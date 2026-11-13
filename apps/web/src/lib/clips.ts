// What the Library routes share: which jobs are Library clips and what a clip's download is called.
import { thumbUrl } from './api';
import { pool } from './auth';

/** SQL for a job (alias `j`) that is a clip in the Library: succeeded, not deleted, not purged. */
export const LIVE_CLIP = `j.status = 'succeeded' and j.deleted_at is null and j.purged_at is null and j.output_asset_id is not null`;

/** The creator's own words, as the detail view shows them: a free prompt on Create video and Image Generation (kept as the brief beside a style); the other features compose theirs. */
export const OWN_PROMPT = `case when j.feature in ('image', 'video') and j.preset_id is null then j.prompt when j.feature = 'image' then j.params->>'brief' end`;

/** An Examples tab's order over its `examples e` rows: the Admin's order, any added since first, newest first. */
export const EXAMPLE_ORDER = 'e.position asc nulls first, e.created_at desc, e.job_id';

/** Per model, the company's best Library clip as card media: a real (not mock) Create Videos or Image Generation clip marked Pass, a featured one first, then the most favourited, then the newest.
 * A video clip gives its loop and poster, an image its preview (else the image itself); any member may read both (`readableAsset`).
 * Other features (Try On, Face Swap and the apps) run on the same models but show staff photos, so they never qualify. */
export async function bestClips(): Promise<Map<string, { video: string | null; poster: string | null }>> {
  const { rows } = await pool.query<{ model: string; output_asset_id: string; poster_asset_id: string | null; mime: string }>(
    `select distinct on (j.model) j.model, j.output_asset_id, j.poster_asset_id, o.mime
       from jobs j
       join verdicts v on v.job_id = j.id and v.verdict = 'pass'
       join assets o on o.id = j.output_asset_id
      where ${LIVE_CLIP} and not j.is_mock and j.feature in ('video', 'image') and (o.mime like 'video/%' or o.mime like 'image/%')
      order by j.model, v.featured desc, (select count(*) from favorites f where f.job_id = j.id) desc, j.created_at desc, j.id desc`,
  );
  const content = (id: string | null) => (id ? `/api/assets/${id}/content` : null);
  const thumb = (id: string | null) => (id ? thumbUrl(id) : null); // the card's picture is a tile, not the original
  return new Map(
    rows.map((r) => [r.model, r.mime.startsWith('video/') ? { video: content(r.output_asset_id), poster: thumb(r.poster_asset_id) } : { video: null, poster: thumb(r.poster_asset_id ?? r.output_asset_id) }]),
  );
}

/** The ICT day of a job's Run as 'YYYYMMDD'; the first column of a download name. */
export const ICT_DAY = `to_char(j.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDD')`;

/** `YYYYMMDD-<creator-slug>-<id>.<ext>` (`mp4` unless the output is an image), the id being the first 8 characters of the job id. */
export function downloadName(day: string, creatorName: string, jobId: string, ext = 'mp4'): string {
  const slug = creatorName
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${day}-${slug || 'user'}-${jobId.slice(0, 8)}.${ext}`;
}

/** The extension of an asset's filename: the stored name of a generated image ends in its real type. */
export const extensionOf = (filename: string): string => filename.slice(filename.lastIndexOf('.') + 1);

/** The download name when the asset is the output (video or image) of a job, else null. */
export async function clipDownloadName(assetId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `select ${ICT_DAY} as day, u.name, j.id, o.filename, o.mime from jobs j join users u on u.id = j.user_id join assets o on o.id = j.output_asset_id where j.output_asset_id = $1`,
    [assetId],
  );
  return rows[0] ? downloadName(rows[0].day, rows[0].name, rows[0].id, rows[0].mime.startsWith('image/') ? extensionOf(rows[0].filename) : 'mp4') : null;
}
