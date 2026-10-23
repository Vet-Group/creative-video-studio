// What the Library routes share: which jobs are Library clips and what a clip's download is called.
import { pool } from './auth';

/** SQL for a job (alias `j`) that is a clip in the Library: succeeded, not deleted, not purged. */
export const LIVE_CLIP = `j.status = 'succeeded' and j.deleted_at is null and j.purged_at is null and j.output_asset_id is not null`;

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
