import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { lastLinkedEmail } from '@/lib/account-audit';
import { pool } from '@/lib/auth';
import { bad } from '@/lib/admin';
import { guard } from '@/lib/session';
import { googleEmail } from '@/lib/sign-in-methods';

/**
 * Admin: unlink a Google or Lark account from a user, for example a lost Google account. better-auth has no endpoint for unlinking
 * another user, so the accounts row is deleted here, with its audit row in the same transaction. The last sign-in method is never
 * removed (the same rule as the user's own unlink), and the email and password method is changed with a temporary password, not here.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; provider: string }> }) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id, provider } = await params;
  if (provider !== 'google' && provider !== 'lark') return bad('provider must be google or lark');

  const refusal = await withTransaction(pool, async (tx) => {
    await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`user:${id}`]); // the same lock the user PATCH takes
    const { rows } = await tx.query('select id, provider_id, id_token from accounts where user_id = $1 for update', [id]);
    const target = rows.find((r) => r.provider_id === provider);
    if (!target) return bad('that user has no such linked account', 404);
    if (rows.length === 1) return bad('cannot remove the last sign-in method', 409);
    const email = googleEmail(target.id_token) ?? (await lastLinkedEmail(tx, id, provider));
    await tx.query('delete from accounts where id = $1', [target.id]);
    await audit(tx, { actorId: g.session.user.id, action: 'account.unlink', target: `user:${id}`, oldValue: { provider, email } });
  });
  return refusal ?? Response.json({ ok: true });
}
