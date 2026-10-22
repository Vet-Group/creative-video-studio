import { readableAsset, streamAsset, type RouteContext } from '@/lib/assets';
import { guard } from '@/lib/session';

/** Authenticated byte stream with `Range` support (video seeking); `?download` asks for an attachment. */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const found = await readableAsset(g.session, id);
  if (found.error) return found.error;
  const download = new URL(request.url).searchParams.has('download');
  return streamAsset(request, found.asset, download ? 'attachment' : 'inline');
}
