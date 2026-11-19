import sharp from 'sharp';
import { bytesOf, MAX_PIXELS, streamAsset } from '@/lib/assets';
import { headSample, SAMPLE_PREFIX, SAMPLE_THUMB, sampleType } from '@/lib/samples';
import { guard } from '@/lib/session';
import { getObject, putObject } from '@/lib/storage';

/** The picker thumbnail of a sample picture: the kept one, else a WebP made now and kept under the sample's ETag, so a replaced sample never shows an old one. Null when sharp cannot read it or it is too large to decode here. */
async function thumbOf(name: string, version: string): Promise<Uint8Array<ArrayBuffer> | null> {
  // shortcut: a replaced or deleted sample leaves its old thumbnail (a few dozen KB) in the bucket; sweep thumbs/samples/ if replacements become frequent.
  const key = `thumbs/samples/${name}-${version}`;
  try {
    return await bytesOf(await getObject(key));
  } catch (e) {
    if ((e as { name?: string }).name !== 'NoSuchKey') throw e;
  }
  let body: Uint8Array<ArrayBuffer>;
  try {
    // 'outside': each side at least the tile's, so the tile's cover crop stays sharp whatever the picture's shape.
    const resized = sharp(await bytesOf(await getObject(SAMPLE_PREFIX + name)), { limitInputPixels: MAX_PIXELS }).rotate().resize(SAMPLE_THUMB.width, SAMPLE_THUMB.height, { fit: 'outside', withoutEnlargement: true });
    body = new Uint8Array(await resized.webp({ quality: 80 }).toBuffer());
  } catch {
    return null;
  }
  await putObject(key, body, 'image/webp').catch(() => undefined); // made again next time
  return body;
}

/** One sample file for a signed-in user, with `Range` support for video seeking.
 * The browser keeps it for an hour, then asks again with its ETag: an unchanged sample answers 304 without a byte, a replaced one comes anew.
 * `?thumb=1` on a picture gives the photo pickers' small WebP of it instead (SAMPLE_THUMB); a video, or a picture sharp cannot read, goes out as it is. */
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { name } = await params;
  const mime = sampleType(name);
  const found = mime && (await headSample(name));
  if (!mime || !found) return Response.json({ error: 'not found' }, { status: 404 });
  const cache = 'private, max-age=3600';
  const version = mime.startsWith('image/') && new URL(request.url).searchParams.get('thumb') === '1' ? found.etag?.replaceAll('"', '') : undefined;
  const etag = version ? `"${version}-thumb"` : found.etag;
  if (etag && request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { 'cache-control': cache, etag } });
  const thumb = version && (await thumbOf(name, version));
  if (thumb) return new Response(thumb, { headers: { 'content-type': 'image/webp', 'content-length': String(thumb.length), 'cache-control': cache, etag: etag!, 'x-content-type-options': 'nosniff' } });
  return streamAsset(request, { s3Key: SAMPLE_PREFIX + name, bytes: found.bytes, mime, filename: name }, 'inline', cache, found.etag ?? undefined);
}
