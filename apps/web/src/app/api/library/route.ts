import { ASPECTS, FEATURES } from '@cvs/db';
import { pool } from '@/lib/auth';
import { downloadName, extensionOf, ICT_DAY, LIVE_CLIP } from '@/lib/clips';
import { guard } from '@/lib/session';

const PAGE = 24;
const bad = (error: string) => Response.json({ error }, { status: 400 });

/** The `kind` filters of the Library, as SQL over the job `j` and its output asset `o`: the media type, one feature, or every app feature. */
const APP_FEATURES = FEATURES.filter((f) => !['video', 'marketing', 'try_on', 'image'].includes(f)).map((f) => `'${f}'`).join(', ');
const KINDS: Record<string, string> = {
  all: 'true',
  images: `o.mime like 'image/%'`,
  videos: `o.mime like 'video/%'`,
  try_on: `j.feature = 'try_on'`,
  image: `j.feature = 'image'`,
  video: `j.feature = 'video'`,
  marketing: `j.feature = 'marketing'`,
  // The two Marketing Studio formats, as the reference Library splits them: Advanced jobs carry params.format 'advanced'.
  marketing_ugc: `j.feature = 'marketing' and j.params->>'format' is null`,
  marketing_advanced: `j.feature = 'marketing' and j.params->>'format' = 'advanced'`,
  apps: `j.feature in (${APP_FEATURES})`,
};

/**
 * The Library: every user's live clips and images, newest first. Filters: `creator` (a user id), `date` (YYYY-MM-DD, Asia/Ho_Chi_Minh), `ratio` and
 * `kind` (`all` by default, `images`, `videos`, one feature of `try_on`, `image`, `video`, `marketing` (or one of its formats, `marketing_ugc` and `marketing_advanced`), or `apps` for every app feature),
 * `favorites=1` (only the caller's favourites) and `sort` (`newest`, the default, or `oldest`); `offset` pages by 24. `favorite` says whether the caller marked an item. Each item has its `feature` and `mediaType` (`video` or `image`, from the output asset); `videoAssetId` is the output asset
 * either way, and an image item has `durationSec` 0 and its `resolution`. `creators` fills the creator filter. `costUsd` is the job's ledger total, provisional while `costFinal` is false.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const q = new URL(request.url).searchParams;
  const creator = q.get('creator');
  const date = q.get('date');
  const ratio = q.get('ratio');
  const kind = q.get('kind') ?? 'all';
  const favorites = q.get('favorites');
  const sort = q.get('sort') ?? 'newest';
  const offset = Number(q.get('offset') ?? 0);
  const day = date === null ? null : new Date(`${date}T00:00:00Z`);
  if (date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(day!.getTime()) || day!.toISOString().slice(0, 10) !== date)) return bad('date must be a valid YYYY-MM-DD');
  if (ratio !== null && !(ASPECTS as readonly string[]).includes(ratio)) return bad(`ratio must be one of ${ASPECTS.join(', ')}`);
  if (!Object.hasOwn(KINDS, kind)) return bad(`kind must be one of ${Object.keys(KINDS).join(', ')}`);
  if (!Number.isInteger(offset) || offset < 0) return bad('offset must be a whole number from 0');
  if (favorites !== null && favorites !== '1') return bad('favorites must be 1 when given');
  if (sort !== 'newest' && sort !== 'oldest') return bad('sort must be newest or oldest');
  const me = g.session.user;

  const [clips, creators] = await Promise.all([
    pool.query(
      `select j.id, j.user_id, u.name as creator_name, j.created_at, ${ICT_DAY} as day, j.model, m.label as model_label, j.aspect, j.duration_s, j.is_mock, j.feature, j.params, o.mime as output_mime, o.filename as output_filename,
              j.output_asset_id, j.poster_asset_id, j.store_id, coalesce(c.usd, 0)::numeric(12, 4)::text as cost_usd, coalesce(c.is_final, false) as cost_final, v.verdict, v.fault, v.marked_by,
              exists (select 1 from favorites f where f.job_id = j.id and f.user_id = $6) as favorite
         from jobs j
         join users u on u.id = j.user_id
         join model_configs m on m.id = j.model
         join assets o on o.id = j.output_asset_id
         left join job_costs c on c.job_id = j.id
         left join verdicts v on v.job_id = j.id
        where ${LIVE_CLIP}
          and ($1::text is null or j.user_id = $1)
          and ($2::date is null or (j.created_at at time zone 'Asia/Ho_Chi_Minh')::date = $2::date)
          and ($3::text is null or j.aspect = $3)
          and ${KINDS[kind]}
          and ($7::boolean is not true or exists (select 1 from favorites f where f.job_id = j.id and f.user_id = $6))
        order by j.created_at ${sort === 'oldest' ? 'asc' : 'desc'}, j.id ${sort === 'oldest' ? 'asc' : 'desc'} limit $4 offset $5`,
      [creator, date, ratio, PAGE + 1, offset, me.id, favorites === '1'],
    ),
    pool.query(`select distinct u.id, u.name from jobs j join users u on u.id = j.user_id where ${LIVE_CLIP} order by u.name, u.id`),
  ]);
  return Response.json({
    hasMore: clips.rows.length > PAGE,
    isAdmin: me.role === 'admin',
    creators: creators.rows,
    clips: clips.rows.slice(0, PAGE).map((r) => ({
      id: r.id,
      creator: { id: r.user_id, name: r.creator_name },
      createdAt: r.created_at,
      modelId: r.model,
      modelLabel: r.model_label,
      ratio: r.aspect,
      durationSec: r.duration_s,
      feature: r.feature,
      mediaType: r.output_mime.startsWith('image/') ? 'image' : 'video',
      resolution: r.params.resolution ?? null,
      isMock: r.is_mock,
      videoAssetId: r.output_asset_id,
      posterAssetId: r.poster_asset_id,
      storeId: r.store_id,
      costUsd: r.cost_usd,
      costFinal: r.cost_final,
      verdict: r.verdict ? { verdict: r.verdict, fault: r.fault, markedBy: r.marked_by } : null,
      favorite: r.favorite,
      canEdit: r.user_id === me.id || me.role === 'admin',
      downloadName: downloadName(r.day, r.creator_name, r.id, r.output_mime.startsWith('image/') ? extensionOf(r.output_filename) : 'mp4'),
    })),
  });
}
