import { readableAsset, streamAsset, type RouteContext } from '@/lib/assets';
import { verifyDownloadToken } from '@/lib/download-token';
import { guard } from '@/lib/session';

/** Attachment download behind a short-lived token; the token must match this asset and this session's user. */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const token = new URL(request.url).searchParams.get('t');
  if (!token || !verifyDownloadToken(token, id, g.session.user.id)) {
    return Response.json({ error: 'the download link is invalid or expired' }, { status: 403 });
  }
  const found = await readableAsset(g.session, id);
  if (found.error) return found.error;
  return streamAsset(request, found.asset, 'attachment');
}
