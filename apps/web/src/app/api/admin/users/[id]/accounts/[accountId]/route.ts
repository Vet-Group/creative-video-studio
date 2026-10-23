import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { lastLinkedEmail } from '@/lib/account-audit';
import { pool } from '@/lib/auth';
import { bad } from '@/lib/admin';
import { guard } from '@/lib/session';
import { googleEmail } from '@/lib/sign-in-methods';

/**
 * Admin: unlink one Google or Lark account from a user, for example a lost Google account. better-auth has no endpoint for unlinking
 * another user, so the accounts row is deleted here, addressed by its row id because a user can hold two accounts of one provider. The
 * user's sessions end in the same transaction, so a session opened with the lost account does not outlive it, and the audit row is in
 * it too. The last sign-in method is never removed (the same rule as the user's own unlink), and the email and password method is
 * never deleted here: it is changed with a temporary password.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; accountId: string }> }) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id, accountId } = await params;

  const refusal = await withTransaction(pool, async (tx) => {
    await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`user:${id}`]); // the same lock the user PATCH takes
    const { rows } = await tx.query('select id, provider_id, account_id, id_token from accounts where user_id = $1 for update', [id]);
    const target = rows.find((r) => r.id === accountId && (r.provider_id === 'google' || r.provider_id === 'lark'));
    if (!target) return bad('that user has no such linked account', 404);
    // shortcut: better-auth's own unlinkAccount counts without this lock, so an Admin unlink and a user unlink at the same instant could leave no method; upgrade to a constraint trigger on accounts if that ever happens.
    if (rows.length === 1) return bad('cannot remove the last sign-in method', 409);
    const email = googleEmail(target.id_token) ?? (await lastLinkedEmail(tx, id, target.provider_id, target.account_id));
    await tx.query(`delete from accounts where id = $1 and user_id = $2 and provider_id in ('google', 'lark')`, [target.id, id]);
    await tx.query('delete from sessions where user_id = $1', [id]);
    await audit(tx, { actorId: g.session.user.id, action: 'account.unlink', target: `user:${id}`, oldValue: { provider: target.provider_id, email }, newValue: { sessionsRevoked: true } });
  });
  return refusal ?? Response.json({ ok: true });
}
