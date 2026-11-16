import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { type RouteContext } from '@/lib/assets';
import { auth, pool } from '@/lib/auth';
import { authFailure, bad } from '@/lib/admin';
import { guard, isImpersonated } from '@/lib/session';

/**
 * Admin: sign in as another user (a member or an Admin) to see what they see; every action then counts for that user, runs included.
 * Only an Admin with the `can_impersonate` flag may (PATCH /api/admin/users/[id] sets it). Refused: yourself, a locked account, and
 * starting while already signed in as someone. better-auth keeps the Admin's own session in a signed cookie, and the session it opens for the
 * user lasts one hour (the plugin's default). The audit row shares a transaction with the better-auth call: it commits only if the session
 * was opened. Its Set-Cookie headers are forwarded, so the browser swaps to the user's session. POST /api/me/stop-impersonating ends it.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  if (isImpersonated(g.session)) return bad('you are already signed in as another user; exit first', 403);
  if (!g.session.user.canImpersonate) return bad('only a developer Admin can sign in as another user', 403);
  const { id } = await params;
  const actorId = g.session.user.id;
  if (id === actorId) return bad('you cannot sign in as yourself');
  const user = (await pool.query('select name, banned from users where id = $1', [id])).rows[0];
  if (!user) return bad('not found', 404);
  if (user.banned) return bad('this account is locked', 409);
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
