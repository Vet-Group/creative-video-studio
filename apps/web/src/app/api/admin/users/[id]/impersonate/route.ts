import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { type RouteContext } from '@/lib/assets';
import { auth, pool } from '@/lib/auth';
import { authFailure, bad } from '@/lib/admin';
import { guard, isImpersonated, resolveWorkspace, sameOrigin } from '@/lib/session';

/**
 * Admin: sign in as another user (a member or an Admin) to see what they see; every action then counts for that user, runs included.
 * Only an Admin with the `can_impersonate` flag may (PATCH /api/admin/users/[id] sets it). Refused: yourself, a locked account, and
 * starting while already signed in as someone, and a user who shares no active workspace with the Admin (lib/session.ts checks that again on every
 * request of the session, docs/WORKSPACES.md §3). better-auth keeps the Admin's own session in a signed cookie, and the session it opens for the
 * user lasts one hour, which lib/session.ts enforces itself. The audit insert and the better-auth call run on different connections: the
 * call is made inside the audit transaction, so a failure rolls the audit row back, and the Set-Cookie headers are forwarded only after that
 * transaction has committed. POST /api/me/stop-impersonating ends it. Only this app's own origin may call it.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  if (!sameOrigin(request)) return bad('forbidden origin', 403);
  if (isImpersonated(g.session)) return bad('you are already signed in as another user; exit first', 403);
  if (!g.session.user.canImpersonate) return bad('only a developer Admin can sign in as another user', 403);
  const { id } = await params;
  const actorId = g.session.user.id;
  if (id === actorId) return bad('you cannot sign in as yourself');
  const user = (await pool.query('select name, banned from users where id = $1', [id])).rows[0];
  if (!user) return bad('not found', 404);
  if (user.banned) return bad('this account is locked', 409);
  if (!(await resolveWorkspace(id, null, actorId))) return bad('you share no workspace with this user', 403);
  try {
    const { headers } = await withTransaction(pool, async (tx) => {
      await audit(tx, { actorId, action: 'user.impersonate_start', target: `user:${id}` });
      return auth.api.impersonateUser({ headers: request.headers, body: { userId: id }, returnHeaders: true });
    });
    const res = Response.json({ id, name: user.name });
    for (const cookie of headers.getSetCookie()) res.headers.append('set-cookie', cookie);
    return res;
  } catch (e) {
    return authFailure(e);
  }
}
