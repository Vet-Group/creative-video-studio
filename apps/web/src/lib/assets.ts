// Server-side helpers for the /api/assets routes.
import { type Asset, findAsset } from '@cvs/db/assets';
import { createDb } from '@cvs/db/client';
import { pool, type Session } from './auth';
import { LIVE_CLIP } from './clips';
import { getObject } from './storage';

export const MAX_FILES = 4;
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_BODY = MAX_FILES * MAX_BYTES + 64 * 1024;
export const MAX_FILENAME = 255;

export const db = createDb(pool);

export type RouteContext = { params: Promise<{ id: string }> };

/** The multipart body as FormData, 'too-large' once it passes MAX_BODY (counted while streaming, so it is never fully buffered), or null when it is not multipart. */
export async function readUploadForm(request: Request): Promise<FormData | 'too-large' | null> {
  if (Number(request.headers.get('content-length')) > MAX_BODY) return 'too-large';
  const contentType = request.headers.get('content-type');
  if (!request.body || !contentType) return null;
  let seen = 0;
  let tooLarge = false;
  const limited = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.length;
        if (seen > MAX_BODY) {
          tooLarge = true;
          throw new Error('request body too large');
        }
        controller.enqueue(chunk);
      },
    }),
  );
  try {
    return await new Response(limited, { headers: { 'content-type': contentType } }).formData();
  } catch {
    return tooLarge ? 'too-large' : null;
  }
}

/** The image type from the file's first bytes (never from the client's name or content type). */
export function sniffImage(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | undefined {
  const at = (i: number, text: string) => [...text].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && at(1, 'PNG') && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
  return undefined;
}

/** The asset for a signed-in user: 404 when it does not exist, 403 unless the user owns it, is an Admin, or it belongs to a Library clip (its video, poster or input images). */
export async function readableAsset(session: Session, id: string): Promise<{ asset: Asset; error?: never } | { asset?: never; error: Response }> {
  const asset = await findAsset(db, id);
  if (!asset) return { error: Response.json({ error: 'not found' }, { status: 404 }) };
  if (asset.ownerId !== session.user.id && session.user.role !== 'admin') {
    const inLibrary = await pool.query(`select 1 from jobs j where ${LIVE_CLIP} and ($1 in (j.output_asset_id, j.poster_asset_id) or $1 = any(j.input_asset_ids)) limit 1`, [id]);
    if (!inLibrary.rowCount) return { error: Response.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { asset };
}

/** `bytes=a-b`, `bytes=a-` or `bytes=-n` against a size: undefined when absent or not understood (serve everything), null when unsatisfiable. */
function parseRange(header: string | null, size: number): { start: number; end: number } | null | undefined {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!m || (!m[1] && !m[2])) return undefined;
  if (m[1] && m[2] && Number(m[2]) < Number(m[1])) return undefined; // RFC 9110: an inverted range is invalid, so it is ignored
  const start = m[1] ? Number(m[1]) : Math.max(size - Number(m[2]), 0);
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return start <= end && start < size ?{ start, end } : null;
}

/** Streams the object out of MinIO with `Range` support, as an inline image/video or an attachment. */
export async function streamAsset(request: Request, asset: Asset, disposition: 'inline' | 'attachment'): Promise<Response> {
  const range = parseRange(request.headers.get('range'), asset.bytes);
  if (range === null) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${asset.bytes}` } });
  const headers: Record<string, string> = {
    'content-type': asset.mime,
    'accept-ranges': 'bytes',
    'content-disposition': `${disposition}; filename="${asset.filename.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(asset.filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  };
  if (!range) {
    return new Response(await getObject(asset.s3Key), { headers: { ...headers, 'content-length': String(asset.bytes) } });
  }
  headers['content-length'] = String(range.end - range.start + 1);
  headers['content-range'] = `bytes ${range.start}-${range.end}/${asset.bytes}`;
  return new Response(await getObject(asset.s3Key, `bytes=${range.start}-${range.end}`), { status: 206, headers });
}
