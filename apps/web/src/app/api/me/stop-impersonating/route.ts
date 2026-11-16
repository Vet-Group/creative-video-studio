import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { auth, pool } from '@/lib/auth';
import { authFailure, bad } from '@/lib/admin';
import { guard, sameOrigin } from '@/lib/session';

/**
 * Ends "sign in as another user" and puts the real Admin back in their own session. The caller is the impersonated user's session, which may
 * be a member's, so any signed-in session may call it, and it works only for one opened by an Admin (impersonatedBy). The audit row names
 * the real Admin as the actor and is written in a transaction around the better-auth call (another connection), so a failed stop rolls it back;
 * the Set-Cookie headers that restore the Admin are forwarded after the commit. Only this app's own origin may call it.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  if (!sameOrigin(request)) return bad('forbidden origin', 403);
  const adminId = g.session.session.impersonatedBy;
  if (!adminId) return bad('you are not signed in as another user', 409);
  try {
    const { headers } = await withTransaction(pool, async (tx) => {
      await audit(tx, { actorId: adminId, action: 'user.impersonate_stop', target: `user:${g.session.user.id}` });
      return auth.api.stopImpersonating({ headers: request.headers, returnHeaders: true });
    });
    const res = Response.json({ ok: true });
    for (const cookie of headers.getSetCookie()) res.headers.append('set-cookie', cookie);
    return res;
  } catch (e) {
    return authFailure(e);
  }
}
