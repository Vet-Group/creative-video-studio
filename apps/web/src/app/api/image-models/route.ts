import { FEATURES } from '@cvs/db';
import { pool } from '@/lib/auth';
import { modelStats, rank, scoreOf } from '@/lib/model-scores';
import { guard } from '@/lib/session';

/**
 * The model picker of an image page (`?feature=try_on` or `?feature=image`, or any feature other than video and marketing): the enabled image models that
 * list the feature, with their ratios, resolutions (the keys of `image_prices`), the price of one image per resolution as a 4-decimal string, and
 * `maxImages`. A mock model prices every resolution at 0, as its jobs book 0 USD. Each model carries its recommendation score for this feature
 * (lib/model-scores.ts), and the best (the cheaper on a tie) is flagged `recommended` unless all score the same. Members and Admins.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const feature = new URL(request.url).searchParams.get('feature');
  if (feature === null || !(FEATURES as readonly string[]).includes(feature) || feature === 'video' || feature === 'marketing') {
    return Response.json({ error: 'feature must be an image feature such as try_on or image' }, { status: 400 });
  }
  const [{ rows }, stats] = await Promise.all([
    pool.query(
      `select id, label, provider, ratios, max_images, image_prices from model_configs where enabled and kind = 'image' and $1 = any(features) order by label, id`,
      [feature],
    ),
    modelStats(feature),
  ]);
  const models = rows.map((r) => {
    const prices = Object.entries(r.image_prices as Record<string, string>).map(([k, v]) => [k, r.provider === 'mock' ? '0.0000' : Number(v).toFixed(4)] as const);
    const st = stats.get(r.id) ?? { passes: 0, total: 0, ok: 0, bad: 0 };
    return {
      id: r.id as string,
      label: r.label as string,
      provider: r.provider as string,
      isMock: r.provider === 'mock',
      ratios: r.ratios as string[],
      resolutions: prices.map(([k]) => k),
      prices: Object.fromEntries(prices),
      maxImages: r.max_images as number,
      ...scoreOf(st),
      passes: st.passes,
      total: st.total,
    };
  });
  const { recommended } = rank(models.map((m) => ({ id: m.id, score: m.score, usd: Math.min(...Object.values(m.prices).map(Number)) })));
  return Response.json({ models: models.map((m) => ({ ...m, recommended: m.id === recommended })) });
}
