import { readableAsset, streamAsset, type RouteContext } from '@/lib/assets';
import { guard } from '@/lib/session';

/** Authenticated byte stream with `Range` support (video seeking); `?download` asks for an attachment.
 * An asset's bytes never change under its id: the browser keeps them for a day, then asks again with the id as its ETag and gets a 304 without a byte. */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const found = await readableAsset(g.session, id);
  if (found.error) return found.error;
  const download = new URL(request.url).searchParams.has('download');
  const cache = 'private, max-age=86400';
  const etag = `"${found.asset.id}"`;
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { 'cache-control': cache, etag } });
  return streamAsset(request, found.asset, download ? 'attachment' : 'inline', cache, etag);
}
