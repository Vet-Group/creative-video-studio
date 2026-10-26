import { estimateUsd } from '@cvs/core/models';
import { ASPECTS } from '@cvs/db';
import { pool } from '@/lib/auth';
import { modelStats, rank, scoreOf } from '@/lib/model-scores';
import { guard } from '@/lib/session';

const MONTH = `to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM')`;

/**
 * The video model picker (image models are left out) for a ratio and duration (`?ratio=9:16&durationSec=8`): the enabled models with pass rate, recommendation
 * score and estimated cost, and the model to pre-select: the best score among those that support the choice (the cheaper on a tie), flagged `recommended`
 * unless every supported model scores the same. Pass rate = (seed passes + marked passes) / (seed total + marked total) over every marked clip, deleted or
 * purged ones included; null while nothing is counted. The score also weighs how often real jobs of the model end well (lib/model-scores.ts).
 * `?feature=video`, `marketing` or `motion_control` keeps the models whose `features` lists it (Marketing Studio also accepts ratio 16:9, Motion Control takes only `auto`); without it every enabled video model is listed.
 * `monthToDate` is the caller's own total this ICT month, provisional while a job of it has no closing row. `remainingBudgetUsd` is for Admins only.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const q = new URL(request.url).searchParams;
  const ratio = q.get('ratio');
  const durationSec = q.get('durationSec') ? Number(q.get('durationSec')) : NaN;
  const feature = q.get('feature');
  if (feature !== null && !['video', 'marketing', 'motion_control'].includes(feature)) return Response.json({ error: 'feature must be video, marketing or motion_control' }, { status: 400 });
  // Motion Control's output follows the reference video, so its only ratio is 'auto'.
  const ratios: readonly (string | null)[] = feature === 'marketing' ? [...ASPECTS, '16:9'] : feature === 'motion_control' ? ['auto'] : ASPECTS;
  if (!ratios.includes(ratio) || !Number.isInteger(durationSec)) {
    return Response.json({ error: 'ratio and durationSec (a whole number) are required' }, { status: 400 });
  }
  const userId = g.session.user.id;

  const [models, mine, budget, stats] = await Promise.all([
    pool.query(
      `select m.id, m.label, m.provider, m.ratios, m.durations_sec, m.max_images, m.usd_per_second, m.output_resolution
         from model_configs m
        where m.enabled and m.kind = 'video' and ($1::text is null or $1 = any(m.features)) order by m.label, m.id`,
      [feature],
    ),
    pool.query(
      `with m as (select job_id, sum(usd) as usd from cost_entries where user_id = $1 and month = ${MONTH} group by job_id)
       select coalesce(sum(m.usd), 0)::numeric(12, 4)::text as usd, coalesce(bool_or(not c.is_final), false) as provisional from m join job_costs c on c.job_id = m.job_id`,
      [userId],
    ),
    g.session.user.role === 'admin'
      ? pool.query(`select (s.monthly_cap_usd - coalesce((select sum(usd) from cost_entries ce where month = ${MONTH} and not exists (select 1 from jobs j where j.id = ce.job_id and j.feature not in ('video', 'marketing'))), 0))::text as remaining from settings s where s.id = 1`)
      : undefined,
    modelStats(null),
  ]);

  const list = models.rows.map((r) => {
    const st = stats.get(r.id) ?? { passes: 0, total: 0, ok: 0, bad: 0 };
    return {
      id: r.id as string,
      label: r.label as string,
      provider: r.provider as string,
      isMock: r.provider === 'mock',
      ratios: r.ratios as string[],
      durationsSec: r.durations_sec as number[],
      maxImages: r.max_images as number,
      resolution: r.output_resolution as string | null,
      // A mock job books 0 USD, so that is what the picker shows for it.
      estimateUsd: r.provider === 'mock' ? '0.0000' : estimateUsd(r.usd_per_second, durationSec),
      ...scoreOf(st),
      passes: st.passes,
      total: st.total,
      supported: r.ratios.includes(ratio) && r.durations_sec.includes(durationSec),
    };
  });
  const supported = list.filter((m) => m.supported).map((m) => ({ id: m.id, score: m.score, usd: Number(m.estimateUsd) }));
  const { best, recommended } = rank(supported);
  return Response.json({
    models: list.map((m) => ({ ...m, recommended: m.id === recommended })),
    defaultModelId: best,
    monthToDate: { usd: mine.rows[0].usd, provisional: mine.rows[0].provisional },
    ...(budget && { remainingBudgetUsd: budget.rows[0].remaining }),
  });
}
