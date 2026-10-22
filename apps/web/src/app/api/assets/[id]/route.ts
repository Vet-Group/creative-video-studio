import { readableAsset, type RouteContext } from '@/lib/assets';
import { signDownloadToken } from '@/lib/download-token';
import { guard } from '@/lib/session';

/** Asset details plus a download URL whose token is good for 5 minutes. */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const found = await readableAsset(g.session, id);
  if (found.error) return found.error;
  const { asset } = found;
  const t = signDownloadToken(asset.id, g.session.user.id);
  return Response.json({ id: asset.id, kind: asset.kind, filename: asset.filename, mime: asset.mime, bytes: asset.bytes, downloadUrl: `/api/assets/${asset.id}/download?t=${t}` });
}
