import { streamAsset } from '@/lib/assets';
import { headSample, SAMPLE_PREFIX, sampleType } from '@/lib/samples';
import { guard } from '@/lib/session';

/** One sample file for a signed-in user, with `Range` support for video seeking. */
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { name } = await params;
  const mime = sampleType(name);
  const found = mime && (await headSample(name));
  if (!mime || !found) return Response.json({ error: 'not found' }, { status: 404 });
  return streamAsset(request, { s3Key: SAMPLE_PREFIX + name, bytes: found.bytes, mime, filename: name }, 'inline');
}
