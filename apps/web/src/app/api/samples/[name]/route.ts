import { streamAsset } from '@/lib/assets';
import { headSample, SAMPLE_PREFIX, sampleType } from '@/lib/samples';
import { guard } from '@/lib/session';

/** One sample file for a signed-in user, with `Range` support for video seeking.
 * The browser keeps it for an hour, then asks again with its ETag: an unchanged sample answers 304 without a byte, a replaced one comes anew. */
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { name } = await params;
  const mime = sampleType(name);
  const found = mime && (await headSample(name));
  if (!mime || !found) return Response.json({ error: 'not found' }, { status: 404 });
  const cache = 'private, max-age=3600';
  if (found.etag && request.headers.get('if-none-match') === found.etag) return new Response(null, { status: 304, headers: { 'cache-control': cache, etag: found.etag } });
  return streamAsset(request, { s3Key: SAMPLE_PREFIX + name, bytes: found.bytes, mime, filename: name }, 'inline', cache, found.etag ?? undefined);
}
