import { bad, readBody } from '@/lib/admin';
import { guard, resolveWorkspace, sameOrigin, WORKSPACE_COOKIE } from '@/lib/session';

/**
 * Switch the browser to another workspace (the shell's switcher): sets the `cvs_ws` cookie the resolver reads, only for a workspace the caller is an
 * active member of (and, while an Admin is signed in as them, one both share); anything else answers 404. The page then reloads in that workspace.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return bad('forbidden origin', 403);
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { workspaceId } = (await readBody(request)) ?? {};
  if (typeof workspaceId !== 'string') return bad('workspaceId is required');
  const found = await resolveWorkspace(g.session.user.id, workspaceId, g.session.session.impersonatedBy ?? null);
  if (found?.workspaceId !== workspaceId) return bad('not found', 404);
  const secure = process.env.APP_URL?.startsWith('https:') ? '; Secure' : '';
  const res = Response.json({ workspaceId });
  res.headers.append('set-cookie', `${WORKSPACE_COOKIE}=${encodeURIComponent(workspaceId)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
  return res;
}
