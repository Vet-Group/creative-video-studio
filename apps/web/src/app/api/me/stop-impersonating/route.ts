import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { auth, pool } from '@/lib/auth';
import { authFailure, bad } from '@/lib/admin';
import { guard } from '@/lib/session';

/**
 * Ends "sign in as another user" and puts the real Admin back in their own session. The caller is the impersonated user's session, which may
 * be a member's, so any signed-in session may call it, and it works only for one opened by an Admin (impersonatedBy). The audit row names
 * the real Admin as the actor and shares a transaction with the better-auth call; its Set-Cookie headers are forwarded to restore the Admin.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
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
