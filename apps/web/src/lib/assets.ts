// Server-side helpers for the /api/assets routes.
import { type Asset, findAsset } from '@cvs/db/assets';
import { createDb } from '@cvs/db/client';
import { pool, type Session } from './auth';
import { getObject } from './storage';

export const MAX_FILES = 4;
export const MAX_BYTES = 10 * 1024 * 1024;

export const db = createDb(pool);

export type RouteContext = { params: Promise<{ id: string }> };

/** The image type from the file's first bytes (never from the client's name or content type). */
export function sniffImage(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | undefined {
  const at = (i: number, text: string) => [...text].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && at(1, 'PNG') && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
  return undefined;
}

/** The asset for a signed-in user: 404 when it does not exist, 403 unless the user owns it or is an Admin. */
export async function readableAsset(session: Session, id: string): Promise<{ asset: Asset; error?: never } | { asset?: never; error: Response }> {
  const asset = await findAsset(db, id);
  if (!asset) return { error: Response.json({ error: 'not found' }, { status: 404 }) };
  if (asset.ownerId !== session.user.id && session.user.role !== 'admin') return { error: Response.json({ error: 'forbidden' }, { status: 403 }) };
  return { asset };
}

/** `bytes=a-b`, `bytes=a-` or `bytes=-n` against a size: undefined when absent or not understood (serve everything), null when unsatisfiable. */
function parseRange(header: string | null, size: number): { start: number; end: number } | null | undefined {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!m || (!m[1] && !m[2])) return undefined;
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
    'content-disposition': `${disposition}; filename="${asset.filename.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,
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
