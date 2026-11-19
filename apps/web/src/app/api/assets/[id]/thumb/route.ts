import sharp from 'sharp';
import { bytesOf, MAX_PIXELS, PREVIEW_SIDE, readableAsset, type RouteContext, streamAsset, THUMB_SIDE, thumbKey } from '@/lib/assets';
import { guard } from '@/lib/session';
import { getObject, putObject } from '@/lib/storage';

/** A small JPEG of an image asset for its tiles, made on first use and kept as `thumbs/<id>`, with the same access as its content.
 * `?w=1600` (the only other size) gives the detail view's preview instead: a WebP, so a transparent PNG stays transparent, kept as `thumbs/<id>-1600`; any other `w` is a 400.
 * An asset's bytes never change under its id, so neither does its thumbnail: the browser keeps it for a day, then gets a 304. A picture sharp cannot read, or one too large to decode here, goes out as it is. */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const found = await readableAsset(g.session, g.workspaceId, id);
  if (found.error) return found.error;
  if (!found.asset.mime.startsWith('image/')) return Response.json({ error: 'not an image' }, { status: 400 });
  const w = new URL(request.url).searchParams.get('w');
  if (w !== null && w !== String(PREVIEW_SIDE)) return Response.json({ error: 'unsupported size' }, { status: 400 });
  const preview = w !== null;
  const side = preview ? PREVIEW_SIDE : THUMB_SIDE;
  const mime = preview ? 'image/webp' : 'image/jpeg';
  const key = thumbKey(id, preview ? PREVIEW_SIDE : undefined);
  const cache = 'private, max-age=86400';
  const etag = `"${id}-thumb${preview ? `-${side}` : ''}"`;
  if (request.headers.get('if-none-match')?.split(',').some((t) => t.trim().replace(/^W\//, '') === etag)) return new Response(null, { status: 304, headers: { 'cache-control': cache, etag } });
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = await bytesOf(await getObject(key));
  } catch (e) {
    if ((e as { name?: string }).name !== 'NoSuchKey') throw e;
    try {
      const resized = sharp(await bytesOf(await getObject(found.asset.s3Key)), { limitInputPixels: MAX_PIXELS })
        .rotate()
        .resize(side, side, { fit: 'inside', withoutEnlargement: true });
      body = new Uint8Array(await (preview ? resized.webp({ quality: 82 }) : resized.flatten({ background: '#fff' }).jpeg({ quality: 80 })).toBuffer());
    } catch {
      return streamAsset(request, found.asset, 'inline', cache);
    }
    await putObject(key, body, mime).catch(() => undefined); // made again next time
  }
  return new Response(body, { headers: { 'content-type': mime, 'content-length': String(body.length), 'cache-control': cache, etag, 'x-content-type-options': 'nosniff' } });
}
