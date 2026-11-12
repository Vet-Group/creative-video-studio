// Step 2 of the /analyze direct upload: the browser has PUT the video to R2 (POST /api/assets/presign-video); confirm the
// object is really an MP4/MOV within the size cap, then record the input asset. The s3_key carries the `r2:` prefix so every
// later reader (the content route, the analyze worker, the purge) finds it in R2. A bad or missing object is deleted, not kept.
import { insertAssets } from '@cvs/db/assets';
import { reaAnalyzeEnabled } from '@/lib/analyze';
import { db, MAX_FILENAME, mp4DurationMs, readJson, sniffVideo } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';
import { deleteObject, getRange, headObject, r2Key } from '@/lib/storage';
import { MAX_VIDEO_BYTES_R2 } from '@/lib/upload-limits';

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const notHere = () => Response.json({ error: 'not found' }, { status: 404 });
const UPLOAD_HOURLY_LIMIT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Cut a file name to MAX_FILENAME code points, keeping a short extension (as POST /api/assets does). */
function shortName(name: string): string {
  const chars = Array.from(name);
  if (chars.length <= MAX_FILENAME) return name;
  const dot = chars.lastIndexOf('.');
  const ext = dot > 0 && chars.length - dot <= 10 ? chars.slice(dot) : [];
  return [...chars.slice(0, MAX_FILENAME - ext.length), ...ext].join('');
}

export async function POST(request: Request) {
  if (!reaAnalyzeEnabled()) return notHere();
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const userId = g.session.user.id;
  const b = (await readJson(request)) as { assetId?: unknown; filename?: unknown; storeId?: unknown } | null;
  const assetId = b?.assetId;
  if (typeof assetId !== 'string' || !UUID.test(assetId)) return bad('assetId must be a presigned upload id');
  const storeId = b?.storeId == null ? null : b.storeId;
  if (storeId !== null && (typeof storeId !== 'string' || (await pool.query('select 1 from stores where id = $1 and not hidden', [storeId])).rowCount === 0)) return bad('the store does not exist or is hidden');

  // Idempotent: a repeated finalize of the same upload returns the row already made rather than conflicting on the primary key.
  const existing = (await pool.query('select id, filename, duration_ms as "durationMs", bytes from assets where id = $1 and owner_id = $2', [assetId, userId])).rows[0];
  if (existing) return Response.json({ asset: existing });

  const key = r2Key(`assets/${assetId}`);
  let size: number;
  try {
    ({ size } = await headObject(key));
  } catch {
    return bad('the upload was not found; PUT the video to the presigned URL first', 409);
  }
  if (size <= 0 || size > MAX_VIDEO_BYTES_R2) {
    await deleteObject(key);
    return bad(`the video is empty or larger than ${MAX_VIDEO_BYTES_R2 / 1024 / 1024} MB`, 413);
  }
  const MB = 1048576;
  const head = await getRange(key, `bytes=0-${MB - 1}`);
  const mime = sniffVideo(head);
  if (!mime) {
    await deleteObject(key);
    return bad('the upload is not an MP4 or MOV video', 415);
  }
  // Duration best-effort: the moov box is in the first MB for a fast-start file, else near the end; unknown is acceptable here.
  let durationMs = mp4DurationMs(head) ?? null;
  if (durationMs === null && size > MB) {
    const tail = `bytes=${size - MB}-`;
    durationMs = mp4DurationMs(await getRange(key, tail)) ?? null;
  }

  const { n } = (await pool.query(`select count(*)::int as n from assets where owner_id = $1 and kind = 'input' and created_at > now() - interval '1 hour'`, [userId])).rows[0];
  if (n >= UPLOAD_HOURLY_LIMIT) {
    await deleteObject(key);
    return bad(`Mỗi giờ chỉ tải lên được tối đa ${UPLOAD_HOURLY_LIMIT} tệp; hãy thử lại sau.`, 429);
  }
  const row = { id: assetId, ownerId: userId, kind: 'input' as const, s3Key: key, filename: shortName(typeof b?.filename === 'string' && b.filename ? b.filename : 'video.mp4'), mime, bytes: size, durationMs, storeId, slot: null };
  try {
    await insertAssets(db, [row]);
  } catch (e) {
    await deleteObject(key); // no row points at it
    throw e;
  }
  return Response.json({ asset: { id: assetId, filename: row.filename, durationMs, bytes: size } });
}
