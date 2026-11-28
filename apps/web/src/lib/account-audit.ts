// Audit rows for the links and unlinks better-auth makes itself: the first social sign-in, linkSocial and unlinkAccount.
// The Admin unlink route writes its own row in its own transaction (api/admin/users/[id]/accounts/[accountId]).
import { audit } from '@cvs/core/audit';
import type { Queryable } from '@cvs/core/ledger';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { googleEmail } from './sign-in-methods';

interface AccountRow {
  userId: string;
  providerId: string;
  accountId: string;
  idToken?: string | null;
}

/** The audit action of an account created from a workspace's member list (lib/workspaces.ts); `byOwner` in its new value marks one a workspace owner made. */
export const ACCOUNT_CREATED = 'workspace.account_create';

/**
 * Whether a workspace owner created this account. Lark never links into one, by a first sign-in or from the account page, so a partner cannot pre-create
 * a staff member's account (docs/WORKSPACES.md §4). The marker is the account's creation audit row, which nothing updates.
 */
export const ownerMade = async (q: Queryable, userId: string): Promise<boolean> =>
  Boolean((await q.query(`select 1 from audit_entries where action = $2 and target = 'user:' || $1 and (new_value->>'byOwner')::boolean`, [userId, ACCOUNT_CREATED])).rowCount);

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
 * Revokes every active agent connection of `userId` (lib/agent-access.ts), one agent.token_revoke row each, by `actorId`. Called wherever the
 * user's other sessions end with a credential change (password, lost sign-in method, 2FA reset) or "sign out everywhere": a connection minted
 * from one of those sessions must not outlive it. Signing out one other session leaves the connections alone.
 */
export async function revokeAgentTokens(q: Queryable, userId: string, actorId: string): Promise<number> {
  const { rows } = await q.query(
    `update api_tokens set revoked_at = now(), revoked_by = $2, revoke_reason = 'credentials_reset'
      where user_id = $1 and revoked_at is null and (expires_at is null or expires_at > now()) returning id`,
    [userId, actorId],
  );
  for (const r of rows) await audit(q, { actorId, action: 'agent.token_revoke', target: `api_token:${r.id}`, newValue: { reason: 'credentials_reset', ownerId: userId } });
  return rows.length;
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
        // The backstop of the /link-social refusal in lib/auth.ts, and the only check on a first sign-in that would link by equal email.
        if (a.providerId === 'lark' && (await ownerMade(q, a.userId))) {
          larkEmails.delete(a.accountId);
          throw APIError.from('FORBIDDEN', { message: 'Lark cannot be linked to an account a workspace owner created', code: 'unable_to_link_account' });
        }
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
        if (keep) {
          await q.query('delete from sessions where user_id = $1 and id <> $2', [a.userId, keep]);
          await revokeAgentTokens(q, a.userId, a.userId);
        }
        await audit(q, { actorId: a.userId, action: 'account.unlink', target: `user:${a.userId}`, oldValue: { provider: a.providerId, email }, ...(keep ? { newValue: { sessionsRevoked: true } } : {}) });
      },
    },
  };
}

/**
 * hooks.after for the passkey plugin, which writes its rows with adapter.create, out of reach of databaseHooks.account. Adding and deleting
 * a passkey are audited like linking and unlinking a method, with provider 'passkey'. Both endpoints run in the caller's own session.
 * Deleting one also ends the user's other sessions, as an unlink does, since a lost passkey may have opened them.
 * A changed password is audited without either password, and it lifts the forced change an Admin's temporary password set.
 * Turning 2FA on (the first right code, checked in a session) and off, new backup codes and refused codes are audited without the
 * secret or any code.
 * shortcut: same out-of-transaction write as accountAuditHooks.
 */
export function authAuditHook(q: Queryable) {
  return createAuthMiddleware(async (ctx) => {
    const done = ctx.context.returned;
    const session = ctx.context.session;
    const twoFactorCheck = ctx.path === '/two-factor/verify-totp' || ctx.path === '/two-factor/verify-backup-code';
    if (twoFactorCheck && done instanceof APIError) {
      // A refused code, the account lock included, is audited with the refusal's code only. At sign-in there is no session yet; the
      // two_factor cookie names the challenge, whose verification row holds the user. A challenge already spent or expired names no one.
      let userId = session?.user.id;
      if (!userId) {
        const challenge = await ctx.getSignedCookie(ctx.context.createAuthCookie('two_factor').name, ctx.context.secret);
        userId = challenge ? (await ctx.context.internalAdapter.findVerificationValue(challenge))?.value : undefined;
      }
      if (userId) await audit(q, { actorId: userId, action: 'user.two_factor_failed', target: `user:${userId}`, newValue: { code: (done.body as { code?: string } | undefined)?.code ?? null } });
      return;
    }
    if (!done || done instanceof APIError) return;
    // As for a changed password, the session a right code opens or renews travels in its httpOnly cookie only.
    if (!session) return twoFactorCheck ? ctx.json({ user: (done as { user: unknown }).user }) : undefined;
    const userId = session.user.id;
    const target = `user:${userId}`;
    if (ctx.path === '/passkey/verify-registration') {
      await audit(q, { actorId: userId, action: 'account.link', target, newValue: { provider: 'passkey', accountId: (done as { id: string }).id, email: null } });
    } else if (ctx.path === '/passkey/delete-passkey') {
      await q.query('delete from sessions where user_id = $1 and id <> $2', [userId, session.session.id]);
      await revokeAgentTokens(q, userId, userId);
      await audit(q, { actorId: userId, action: 'account.unlink', target, oldValue: { provider: 'passkey', accountId: (ctx.body as { id: string }).id, email: null }, newValue: { sessionsRevoked: true } });
    } else if (ctx.path === '/change-password') {
      await q.query('update users set must_change_password = false, updated_at = now() where id = $1', [userId]);
      await revokeAgentTokens(q, userId, userId);
      await audit(q, { actorId: userId, action: 'user.password_change', target, newValue: { sessionsRevoked: (ctx.body as { revokeOtherSessions?: boolean }).revokeOtherSessions === true } });
      // The new session's token travels in its httpOnly cookie only, never in a body the page's scripts can read.
      return ctx.json({ user: (done as { user: unknown }).user });
    } else if (ctx.path === '/two-factor/verify-totp' && !session.user.twoFactorEnabled) {
      // The session is the one read before the check, so a user without 2FA yet has just turned it on.
      await audit(q, { actorId: userId, action: 'user.two_factor_enable', target, newValue: { twoFactor: true } });
    } else if (ctx.path === '/two-factor/disable') {
      // The plugin forgets only this device's trust; a device trusted with the old codes must not skip the step if 2FA comes back on.
      await q.query(`delete from verifications where value = $1 and identifier like 'trust-device-%'`, [userId]);
      await audit(q, { actorId: userId, action: 'user.two_factor_disable', target, oldValue: { twoFactor: true }, newValue: { twoFactor: false } });
    } else if (ctx.path === '/two-factor/generate-backup-codes') {
      await audit(q, { actorId: userId, action: 'user.two_factor_backup_codes', target });
    } else if (ctx.path === '/revoke-sessions' || ctx.path === '/revoke-other-sessions') {
      await revokeAgentTokens(q, userId, userId);
    }
    if (twoFactorCheck) return ctx.json({ user: (done as { user: unknown }).user });
  });
}
