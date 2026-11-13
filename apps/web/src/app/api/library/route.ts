import { ASPECTS, FEATURES } from '@cvs/db';
import { JOB_APPS } from '@/lib/apps';
import { pool } from '@/lib/auth';
import { downloadName, EXAMPLE_ORDER, extensionOf, ICT_DAY, LIVE_CLIP, OWN_PROMPT } from '@/lib/clips';
import { GALLERY_SAMPLES } from '@/lib/examples';
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
  // The Marketing Studio formats, as the reference Library splits them: a job of a format other than UGC carries it as params.format.
  marketing_ugc: `j.feature = 'marketing' and j.params->>'format' is null`,
  marketing_advanced: `j.feature = 'marketing' and j.params->>'format' = 'advanced'`,
  marketing_unboxing: `j.feature = 'marketing' and j.params->>'format' = 'unboxing'`,
  marketing_review: `j.feature = 'marketing' and j.params->>'format' = 'review'`,
  apps: `j.feature in (${APP_FEATURES})`,
  // One app: its feature is the kind.
  ...Object.fromEntries(JOB_APPS.map((a) => [a.feature, `j.feature = '${a.feature}'`])),
};
/** The `verdict` filters, as SQL over the item's mark `v`: unmarked, any Pass (a featured one too), featured only, or Fail. */
const VERDICTS: Record<string, string> = {
  none: 'v.job_id is null',
  pass: `v.verdict = 'pass'`,
  featured: 'v.featured is true',
  fail: `v.verdict = 'fail'`,
};

/**
 * The Library: every user's live clips and images, newest first. Filters: `creator` (a user id), `date` (YYYY-MM-DD, Asia/Ho_Chi_Minh), `ratio` and
 * `kind` (`all` by default, `images`, `videos`, one feature of `try_on`, `image`, `video`, `marketing` (or one of its formats, `marketing_ugc`, `marketing_advanced`, `marketing_unboxing` and `marketing_review`), or `apps` for every app feature, or the feature of one app such as `background_changer`),
 * `verdict` (`none` for unmarked items, `pass`, `featured` or `fail`), `favorites=1` (only the caller's favourites), `example=1` (only the results an Admin put on an Examples tab; with the `kind` of one such tab, in its order unless `sort=oldest`), `q` (words in the model name or the creator's own `prompt`, case-insensitive, up to 200 characters) and `sort` (`newest`, the default, or `oldest`); `offset` pages by 24. `favorite` says whether the caller marked an item, `example` whether it is on its page's Examples tab. Each item has its `feature` and `mediaType` (`video` or `image`, from the output asset); `videoAssetId` is the output asset
 * either way, and an image item has `durationSec` 0 and its `resolution`. `creators` fills the creator filter. `unmarked` counts the live items the caller may mark (their own, or all for an Admin) that have no mark yet. `costUsd` is the job's ledger total, provisional while `costFinal` is false.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const q = new URL(request.url).searchParams;
  const creator = q.get('creator');
  const date = q.get('date');
  const days = q.get('days');
  const ratio = q.get('ratio');
  const kind = q.get('kind') ?? 'all';
  const favorites = q.get('favorites');
  const example = q.get('example');
  const verdict = q.get('verdict');
  const sort = q.get('sort') ?? 'newest';
  const text = q.get('q')?.trim() || null;
  const offset = Number(q.get('offset') ?? 0);
  const day = date === null ? null : new Date(`${date}T00:00:00Z`);
  if (date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(day!.getTime()) || day!.toISOString().slice(0, 10) !== date)) return bad('date must be a valid YYYY-MM-DD');
  if (days !== null && !['1', '7', '30'].includes(days)) return bad('days must be 1, 7 or 30');
  if (ratio !== null && !(ASPECTS as readonly string[]).includes(ratio)) return bad(`ratio must be one of ${ASPECTS.join(', ')}`);
  if (!Object.hasOwn(KINDS, kind)) return bad(`kind must be one of ${Object.keys(KINDS).join(', ')}`);
  if (verdict !== null && !Object.hasOwn(VERDICTS, verdict)) return bad(`verdict must be one of ${Object.keys(VERDICTS).join(', ')}`);
  if (!Number.isInteger(offset) || offset < 0) return bad('offset must be a whole number from 0');
  if (favorites !== null && favorites !== '1') return bad('favorites must be 1 when given');
  if (example !== null && example !== '1') return bad('example must be 1 when given');
  if (sort !== 'newest' && sort !== 'oldest') return bad('sort must be newest or oldest');
  if (text !== null && text.length > 200) return bad('q must be at most 200 characters');
  const me = g.session.user;

  const [clips, creators, unmarked] = await Promise.all([
    pool.query(
      `select j.id, j.user_id, u.name as creator_name, j.created_at, ${ICT_DAY} as day, j.model, m.label as model_label, j.aspect, j.duration_s, j.is_mock, j.feature, j.params, o.mime as output_mime, o.filename as output_filename,
              j.output_asset_id, j.poster_asset_id, j.store_id, coalesce(c.usd, 0)::numeric(12, 4)::text as cost_usd, coalesce(c.is_final, false) as cost_final, v.verdict, v.fault, v.featured, v.marked_by, ${OWN_PROMPT} as prompt,
              exists (select 1 from favorites f where f.job_id = j.id and f.user_id = $6) as favorite,
              e.job_id is not null as example
         from jobs j
         join users u on u.id = j.user_id
         join model_configs m on m.id = j.model
         join assets o on o.id = j.output_asset_id
         left join job_costs c on c.job_id = j.id
         left join verdicts v on v.job_id = j.id
         left join examples e on e.job_id = j.id
        where ${LIVE_CLIP}
          and ($1::text is null or j.user_id = $1)
          and ($2::date is null or (j.created_at at time zone 'Asia/Ho_Chi_Minh')::date = $2::date)
          and ($9::int is null or (j.created_at at time zone 'Asia/Ho_Chi_Minh')::date > (now() at time zone 'Asia/Ho_Chi_Minh')::date - $9::int)
          and ($3::text is null or j.aspect = $3)
          and ${KINDS[kind]}
          and ${verdict === null ? 'true' : VERDICTS[verdict]}
          and ($7::boolean is not true or exists (select 1 from favorites f where f.job_id = j.id and f.user_id = $6))
          and ($10::boolean is not true or e.job_id is not null)
          and ($8::text is null or m.label ilike $8 or ${OWN_PROMPT} ilike $8)
        order by ${example === '1' && sort === 'newest' && Object.hasOwn(GALLERY_SAMPLES, kind) ? EXAMPLE_ORDER : `j.created_at ${sort === 'oldest' ? 'asc' : 'desc'}, j.id ${sort === 'oldest' ? 'asc' : 'desc'}`} limit $4 offset $5`,
      // The words match literally: LIKE's own wildcards and escape are escaped.
      [creator, date, ratio, PAGE + 1, offset, me.id, favorites === '1', text === null ? null : `%${text.replace(/[\\%_]/g, '\\$&')}%`, days === null ? null : Number(days), example === '1'],
    ),
    pool.query(`select distinct u.id, u.name from jobs j join users u on u.id = j.user_id where ${LIVE_CLIP} order by u.name, u.id`),
    pool.query(`select count(*)::int as n from jobs j where ${LIVE_CLIP} and ($1::boolean or j.user_id = $2) and not exists (select 1 from verdicts v where v.job_id = j.id)`, [me.role === 'admin', me.id]),
  ]);
  return Response.json({
    hasMore: clips.rows.length > PAGE,
    isAdmin: me.role === 'admin',
    creators: creators.rows,
    unmarked: unmarked.rows[0].n,
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
      verdict: r.verdict ? { verdict: r.verdict, fault: r.fault, featured: r.featured, markedBy: r.marked_by } : null,
      favorite: r.favorite,
      example: r.example,
      prompt: r.prompt,
      canEdit: r.user_id === me.id || me.role === 'admin',
      mine: r.user_id === me.id,
      downloadName: downloadName(r.day, r.creator_name, r.id, r.output_mime.startsWith('image/') ? extensionOf(r.output_filename) : 'mp4'),
    })),
  });
}
