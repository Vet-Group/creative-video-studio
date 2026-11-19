import { insertAssets } from '@cvs/db/assets';
import { db, mp4DurationMs, readJson, sniffImage, sniffVideo } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { MAX_SAMPLE_BYTES } from '@/lib/samples';
import { guard } from '@/lib/session';
import { deleteObject, getObject, putObject } from '@/lib/storage';
import { COPY_HOURLY_LIMIT } from '../samples/route';

/**
 * Copies one of the caller's own finished results (`{ assetId }`, the output of one of their jobs, from History) into a new input asset of theirs on the server: an output
 * is not an input, so a job cannot name it. An MP4 clip (Advanced's reference video; its length comes from the file's header, else from the job's duration) or a
 * JPEG, PNG or WebP image (the "Use result" button), of at most 50 MB. 429 beyond COPY_HOURLY_LIMIT new inputs an hour, as the sample copy.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const body = (await readJson(request)) as { assetId?: unknown } | null;
  if (typeof body?.assetId !== 'string') return Response.json({ error: 'send the clip\'s asset id in "assetId"' }, { status: 400 });
  const userId = g.session.user.id;
  const found = (
    await pool.query(
      `select a.s3_key, a.bytes, a.mime, j.duration_s from assets a join jobs j on j.output_asset_id = a.id
        where a.id = $1 and a.owner_id = $2 and a.workspace_id = $3 and j.workspace_id = $3 and a.kind = 'output' and a.mime in ('video/mp4', 'image/png', 'image/jpeg', 'image/webp') and a.deleted_at is null and j.deleted_at is null and j.purged_at is null`,
      [body.assetId, userId, g.workspaceId],
    )
  ).rows[0] as { s3_key: string; bytes: number; mime: string; duration_s: number } | undefined;
  if (!found) return Response.json({ error: 'the result does not exist or is not yours' }, { status: 404 });
  if (found.bytes > MAX_SAMPLE_BYTES) return Response.json({ error: 'the result is larger than 50 MB' }, { status: 413 });
  const { n } = (await pool.query(`select count(*)::int as n from assets where owner_id = $1 and kind = 'input' and created_at > now() - interval '1 hour'`, [userId])).rows[0];
  if (n + 1 > COPY_HOURLY_LIMIT) return Response.json({ error: `at most ${COPY_HOURLY_LIMIT} new files an hour; try again later` }, { status: 429 });
  const bytes = new Uint8Array(await new Response(await getObject(found.s3_key)).arrayBuffer());
  const video = found.mime === 'video/mp4';
  const mime = video ? (sniffVideo(bytes) ? 'video/mp4' : null) : sniffImage(bytes);
  if (!mime) return Response.json({ error: video ? 'the clip is not an MP4 video' : 'the result is not a JPEG, PNG or WebP image' }, { status: 415 });
  const id = crypto.randomUUID();
  const row = {
    id,
    ownerId: userId,
    workspaceId: g.workspaceId,
    kind: 'input' as const,
    s3Key: `assets/${id}`,
    filename: `history-${id.slice(0, 8)}.${video ? 'mp4' : mime === 'image/jpeg' ? 'jpg' : mime.slice(6)}`,
    mime,
    bytes: bytes.length,
    durationMs: video ? (mp4DurationMs(bytes) ?? found.duration_s * 1000) : null,
  };
  try {
    await putObject(row.s3Key, bytes, row.mime);
    await insertAssets(db, [row]);
  } catch (e) {
    // No row points at the object, so remove it rather than leave an orphan.
    await Promise.allSettled([deleteObject(row.s3Key)]);
    throw e;
  }
  return Response.json({ assets: [{ id, filename: row.filename, mime: row.mime, bytes: row.bytes, durationMs: row.durationMs ?? undefined }] }, { status: 201 });
}
