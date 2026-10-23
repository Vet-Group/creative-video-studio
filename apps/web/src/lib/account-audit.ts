// Audit rows for the links and unlinks better-auth makes itself: the first social sign-in, linkSocial and unlinkAccount.
// The Admin unlink route writes its own row in its own transaction (api/admin/users/[id]/accounts/[accountId]).
import { audit } from '@cvs/core/audit';
import type { Queryable } from '@cvs/core/ledger';
import { APIError } from 'better-auth/api';
import { googleEmail } from './sign-in-methods';

interface AccountRow {
  userId: string;
  providerId: string;
  accountId: string;
  idToken?: string | null;
}

// Lark sends no id_token, so its getUserInfo leaves the email here, keyed by the Lark account id, for the account.link hook that follows.
const larkEmails = new Map<string, string>();
export function rememberLarkEmail(accountId: string, email: string): void {
  if (larkEmails.size >= 500) larkEmails.clear(); // entries of sign-ins that linked nothing are never taken
  larkEmails.set(accountId, email);
}

/** The provider email of the latest account.link row of this provider account; for an unlink, when the account row no longer says. */
export async function lastLinkedEmail(q: Queryable, userId: string, provider: string, accountId: string): Promise<string | null> {
  const { rows } = await q.query(
    `select new_value->>'email' as email from audit_entries where action = 'account.link' and target = $1 and new_value->>'provider' = $2 and new_value->>'accountId' = $3 order by id desc limit 1`,
    [`user:${userId}`, provider, accountId],
  );
  return rows[0]?.email ?? null;
}

/**
 * databaseHooks.account for better-auth. The actor is the account's own user: all three flows run in that user's session.
 * shortcut: the hook runs after the account write on another statement, because better-auth gives hooks no handle on its connection;
 * a crash between the two loses the row, and a failing audit write fails the sign-in or link that was already saved. Upgrade by moving
 * the writes to a Postgres trigger on accounts if the audit log must never miss one.
 */
export function accountAuditHooks(q: Queryable) {
  return {
    create: {
      // Refuse before the row is written: the admin plugin's session hook also refuses a banned user, but only after this row and its audit row exist.
      async before(a: AccountRow) {
        if (a.providerId === 'credential') return; // an Admin may give a banned social-only user a password
        const u = (await q.query('select banned, ban_expires from users where id = $1', [a.userId])).rows[0];
        if (!u?.banned || (u.ban_expires && new Date(u.ban_expires).getTime() < Date.now())) return; // an expired ban is lifted by that session hook
        larkEmails.delete(a.accountId);
        throw APIError.from('FORBIDDEN', { message: 'You have been banned from this application.', code: 'BANNED_USER' });
      },
      async after(a: AccountRow) {
        if (a.providerId === 'credential') return; // the password account Admin user creation makes is not a link
        const email = googleEmail(a.idToken ?? null) ?? larkEmails.get(a.accountId) ?? null;
        larkEmails.delete(a.accountId);
        await audit(q, { actorId: a.userId, action: 'account.link', target: `user:${a.userId}`, newValue: { provider: a.providerId, accountId: a.accountId, email } });
      },
    },
    delete: {
      // ctx is the endpoint context; unlink-account's session middleware has put the caller's session on ctx.context.
      async after(a: AccountRow, ctx: { context: { session: { session: { id: string } } | null } } | null) {
        if (a.providerId === 'credential') return;
        const email = googleEmail(a.idToken ?? null) ?? (await lastLinkedEmail(q, a.userId, a.providerId, a.accountId));
        const keep = ctx?.context.session?.session.id;
        // Like the Admin unlink, end the sessions the lost account may have opened; the caller's own stays.
        if (keep) await q.query('delete from sessions where user_id = $1 and id <> $2', [a.userId, keep]);
        await audit(q, { actorId: a.userId, action: 'account.unlink', target: `user:${a.userId}`, oldValue: { provider: a.providerId, email }, ...(keep ? { newValue: { sessionsRevoked: true } } : {}) });
      },
    },
  };
}
