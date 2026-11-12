// Step 1 of the /analyze direct upload: hand the browser a presigned URL to PUT one reference video straight to R2, past
// the request-body and tunnel caps. No asset row yet — POST /api/assets/finalize-video validates the object and records it.
// Gated by the analyze flag, the only page that uploads this way; Motion Control still uploads through POST /api/assets.
import { randomUUID } from 'node:crypto';
import { reaAnalyzeEnabled } from '@/lib/analyze';
import { readJson } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';
import { presignR2Put, r2Configured, r2Key } from '@/lib/storage';
import { MAX_VIDEO_BYTES_R2 } from '@/lib/upload-limits';

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const notHere = () => Response.json({ error: 'not found' }, { status: 404 });
const VIDEO = ['video/mp4', 'video/quicktime'];
const UPLOAD_HOURLY_LIMIT = 100; // keep in step with POST /api/assets; a loop cannot fill the file store

export async function POST(request: Request) {
  if (!reaAnalyzeEnabled()) return notHere();
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  // No R2 (local dev, or an outage): tell the browser to use the MinIO multipart path (POST /api/assets) instead.
  if (!r2Configured()) return Response.json({ fallback: true });
  const b = (await readJson(request)) as { contentType?: unknown; size?: unknown } | null;
  if (!VIDEO.includes(b?.contentType as string)) return bad('contentType must be video/mp4 or video/quicktime');
  const size = b?.size;
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) return bad('size must be a positive integer');
  if (size > MAX_VIDEO_BYTES_R2) return bad(`the video is larger than ${MAX_VIDEO_BYTES_R2 / 1024 / 1024} MB`, 413);
  // The real limit is enforced at finalize, where the row is created; this is an early check so a flood fails before upload.
  const { n } = (await pool.query(`select count(*)::int as n from assets where owner_id = $1 and kind = 'input' and created_at > now() - interval '1 hour'`, [g.session.user.id])).rows[0];
  if (n >= UPLOAD_HOURLY_LIMIT) return bad(`Mỗi giờ chỉ tải lên được tối đa ${UPLOAD_HOURLY_LIMIT} tệp; hãy thử lại sau.`, 429);

  const id = randomUUID();
  const url = await presignR2Put(`assets/${id}`, b!.contentType as string);
  return Response.json({ assetId: id, key: r2Key(`assets/${id}`), url });
}
