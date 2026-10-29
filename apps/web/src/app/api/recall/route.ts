import { usdPerSecondFor } from '@cvs/core/models';
import { FEATURES } from '@cvs/db';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

const bad = (error: string) => Response.json({ error }, { status: 400 });
/** The features that run on a video model; every other feature runs on an image model (as in POST /api/jobs). */
const VIDEO_FEATURES = ['video', 'marketing', 'motion_control'];

/**
 * `?feature=` (and `&format=advanced` for Marketing Studio Advanced): the model and settings of the caller's latest job on that page, so the page opens
 * as the member last ran it. The job row is the memory, so nothing is written here. `settings` is null without a job, or when the model is no longer
 * enabled for the feature; a value the model no longer allows (or the page does not take) is null, and the page keeps its default for it.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const q = new URL(request.url).searchParams;
  const feature = q.get('feature') ?? '';
  const format = q.get('format');
  if (!(FEATURES as readonly string[]).includes(feature)) return bad(`feature must be one of ${FEATURES.join(', ')}`);
  if (format !== null && (format !== 'advanced' || feature !== 'marketing')) return bad('format may only be advanced, on marketing');
  const { rows } = await pool.query(
    `select j.model, j.aspect, j.duration_s, j.params, j.preset_id, j.enhance, j.store_id, s.id is not null and not s.hidden as store_ok,
            m.enabled and j.feature = any(m.features) as usable, m.endpoint, m.usd_per_second, m.ratios, m.durations_sec, m.image_prices
       from jobs j left join model_configs m on m.id = j.model left join stores s on s.id = j.store_id
      where j.user_id = $1 and j.feature = $2 and j.deleted_at is null and ((j.params->>'format' = 'advanced') is true) = $3
      order by j.created_at desc, j.id desc limit 1`,
    [g.session.user.id, feature, format === 'advanced'],
  );
  const r = rows[0];
  if (!r?.usable) return Response.json({ settings: null });
  const isImage = !VIDEO_FEATURES.includes(feature);
  const timed = feature === 'video' || feature === 'marketing';
  const params = r.params as Record<string, string>;
  return Response.json({
    settings: {
      modelId: r.model as string,
      ratio: (r.ratios as string[]).includes(r.aspect) ? (r.aspect as string) : null,
      durationSec: timed && (r.durations_sec as number[]).includes(r.duration_s) ? (r.duration_s as number) : null,
      resolution: isImage && params.resolution !== undefined && Object.hasOwn(r.image_prices ?? {}, params.resolution) ? params.resolution : null,
      audio: timed && params.audio !== undefined && usdPerSecondFor({ endpoint: r.endpoint, usdPerSecond: r.usd_per_second }, 'on') !== undefined ? params.audio === 'on' : null,
      // Enhance rewrites the member's own prompt, so only a free-prompt job says whether it was on.
      enhance: feature === 'image' || (feature === 'video' && r.preset_id === null) ? (r.enhance as boolean) : null,
      storeId: r.store_ok ? (r.store_id as string) : null,
    },
  });
}
