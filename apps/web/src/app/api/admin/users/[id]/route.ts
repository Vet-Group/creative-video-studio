import { type AuditEntry, audit } from '@cvs/core/audit';
import { type Queryable, withTransaction } from '@cvs/core/ledger';
import { PASSWORD_LENGTH } from '@/lib/account-security';
import { type RouteContext } from '@/lib/assets';
import { auth, pool } from '@/lib/auth';
import { authFailure, bad, readBody } from '@/lib/admin';
import { guard } from '@/lib/session';

/**
 * Admin: change one user. Any of `name`, `email` (unique; a first Google or Lark sign-in links by this address), `role` (member|admin),
 * `teamId` (a visible team), `banned` (boolean, with an optional `banReason`), `temporaryPassword`, `twoFactor: false` (turns the
 * user's 2FA off, for a lost phone, and ends the user's sessions), `canEditTemplates` (boolean: a template editor, lib/session.ts), `system` (boolean: an
 * automation account, listed apart from the staff) and `outsideLark` (boolean: not in the company's Lark organisation, never asked to link Lark) in one body. Every field is checked before anything is written. Each change that differs from the current state is
 * audited with its old and new value, in the transaction of the change itself: the audit row commits only if the change was made. The
 * password itself is never stored. A team change touches only users.team_id: jobs keep the team they were run under.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const actorId = g.session.user.id;
  const { name, email, role, teamId, banned, banReason, temporaryPassword, twoFactor, canEditTemplates, system, outsideLark } = (await readBody(request)) ?? {};
  if ([name, email, role, teamId, banned, temporaryPassword, twoFactor, canEditTemplates, system, outsideLark].every((v) => v === undefined)) {
    return bad('give at least one of name, email, role, teamId, banned, temporaryPassword, twoFactor, canEditTemplates, system, outsideLark');
  }
  const newName = typeof name === 'string' ? name.trim() : name;
  const newEmail = typeof email === 'string' ? email.trim().toLowerCase() : email;
  if (newName !== undefined && !(typeof newName === 'string' && newName.length >= 1 && newName.length <= 100)) return bad('name must have 1 to 100 characters');
  if (newEmail !== undefined && !(typeof newEmail === 'string' && newEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))) return bad('email must be an email address');
  if (role !== undefined && role !== 'member' && role !== 'admin') return bad('role must be member or admin');
  if (teamId !== undefined && typeof teamId !== 'string') return bad('teamId must be a string');
  if (banned !== undefined && typeof banned !== 'boolean') return bad('banned must be true or false');
  if (banReason !== undefined && typeof banReason !== 'string') return bad('banReason must be a string');
  if (temporaryPassword !== undefined && !(typeof temporaryPassword === 'string' && temporaryPassword.length >= PASSWORD_LENGTH.min && temporaryPassword.length <= PASSWORD_LENGTH.max)) {
    return bad(`temporaryPassword must have ${PASSWORD_LENGTH.min} to ${PASSWORD_LENGTH.max} characters`);
  }
  if (twoFactor !== undefined && twoFactor !== false) return bad('twoFactor can only be turned off (false); the user turns it on');
  if (canEditTemplates !== undefined && typeof canEditTemplates !== 'boolean') return bad('canEditTemplates must be true or false');
  if (system !== undefined && typeof system !== 'boolean') return bad('system must be true or false');
  if (outsideLark !== undefined && typeof outsideLark !== 'boolean') return bad('outsideLark must be true or false');
  if (id === actorId && ((role !== undefined && role !== g.session.user.role) || banned === true)) return bad('you cannot change your own role or ban yourself');

  if (!(await pool.query('select 1 from users where id = $1', [id])).rowCount) return bad('not found', 404);
  if (typeof teamId === 'string' && !(await pool.query('select 1 from teams where id = $1 and not hidden', [teamId])).rowCount) return bad('teamId must be the id of a visible team');
  if (typeof newEmail === 'string' && (await pool.query('select 1 from users where lower(email) = $1 and id <> $2', [newEmail, id])).rowCount) return bad('another user has this email', 409);

  const target = `user:${id}`;
  // The change and its audit row share a transaction: `apply` (a better-auth call on its own connection) failing rolls the audit row back.
  // The users row is not locked, because better-auth updates it from another connection and would wait for us; an advisory lock
  // serialises Admins changing the same user instead, so the old value read here is the one the change replaces.
  const change = (entry: (old: { role: string; banned: boolean }) => Omit<AuditEntry, 'actorId' | 'target'> | null, apply: (tx: Queryable) => Promise<unknown>) =>
    withTransaction(pool, async (tx) => {
      await tx.query('select pg_advisory_xact_lock(hashtext($1))', [target]);
      const e = entry((await tx.query('select role, banned from users where id = $1', [id])).rows[0]);
      if (!e) return;
      await audit(tx, { actorId, target, ...e });
      await apply(tx);
    });

  try {
    if (typeof newName === 'string' || typeof newEmail === 'string') {
      await withTransaction(pool, async (tx) => {
        const old = (await tx.query('select name, email from users where id = $1 for update', [id])).rows[0];
        const next = { name: (newName as string | undefined) ?? old.name, email: (newEmail as string | undefined) ?? old.email };
        if (next.name === old.name && next.email === old.email) return;
        // The address stays verified: an Admin set it, as when the user was created (POST /api/admin/users).
        await tx.query('update users set name = $2, email = $3, email_verified = true, updated_at = now() where id = $1', [id, next.name, next.email]);
        await audit(tx, { actorId, action: 'user.update', target, oldValue: old, newValue: next });
      });
    }
    if (role !== undefined) {
      await change(
        (old) => (role === old.role ? null : { action: 'user.role_change', oldValue: { role: old.role }, newValue: { role } }),
        () => auth.api.setRole({ headers: request.headers, body: { userId: id, role } }),
      );
    }
    if (typeof teamId === 'string') {
      await withTransaction(pool, async (tx) => {
        const old = (await tx.query('select team_id from users where id = $1 for update', [id])).rows[0].team_id;
        if (old === teamId) return;
        await tx.query('update users set team_id = $2, updated_at = now() where id = $1', [id, teamId]);
        await audit(tx, { actorId, action: 'user.team_change', target, oldValue: { teamId: old }, newValue: { teamId } });
      });
    }
    if (typeof canEditTemplates === 'boolean') {
      await withTransaction(pool, async (tx) => {
        if (!(await tx.query('update users set can_edit_templates = $2, updated_at = now() where id = $1 and can_edit_templates <> $2', [id, canEditTemplates])).rowCount) return;
        await audit(tx, { actorId, action: 'user.template_editor', target, oldValue: { canEditTemplates: !canEditTemplates }, newValue: { canEditTemplates } });
      });
    }
    if (typeof system === 'boolean') {
      await withTransaction(pool, async (tx) => {
        if (!(await tx.query('update users set system = $2, updated_at = now() where id = $1 and system <> $2', [id, system])).rowCount) return;
        await audit(tx, { actorId, action: 'user.system', target, oldValue: { system: !system }, newValue: { system } });
      });
    }
    if (typeof outsideLark === 'boolean') {
      await withTransaction(pool, async (tx) => {
        if (!(await tx.query('update users set outside_lark = $2, updated_at = now() where id = $1 and outside_lark <> $2', [id, outsideLark])).rowCount) return;
        await audit(tx, { actorId, action: 'user.outside_lark', target, oldValue: { outsideLark: !outsideLark }, newValue: { outsideLark } });
      });
    }
    if (banned === true) {
      await change(
        (old) => (old.banned ? null : { action: 'user.ban', oldValue: { banned: false }, newValue: { banned: true, reason: banReason ?? null } }),
        () => auth.api.banUser({ headers: request.headers, body: { userId: id, ...(banReason ? { banReason } : {}) } }),
      );
    } else if (banned === false) {
      await change(
        (old) => (old.banned ? { action: 'user.unban', oldValue: { banned: true }, newValue: { banned: false } } : null),
        () => auth.api.unbanUser({ headers: request.headers, body: { userId: id } }),
      );
    }
    if (temporaryPassword !== undefined) {
      await change(
        () => ({ action: 'user.password_set', newValue: { temporary: true } }),
        async (tx) => {
          await auth.api.setUserPassword({ headers: request.headers, body: { userId: id, newPassword: temporaryPassword as string } });
          // After better-auth's write, which would wait on this row lock; the user must replace the password at the next sign-in.
          await tx.query('update users set must_change_password = true, updated_at = now() where id = $1', [id]);
        },
      );
    }
    if (twoFactor === false) {
      await withTransaction(pool, async (tx) => {
        await tx.query('select pg_advisory_xact_lock(hashtext($1))', [target]);
        if (!(await tx.query('update users set two_factor_enabled = false, updated_at = now() where id = $1 and two_factor_enabled', [id])).rowCount) return;
        await tx.query('delete from two_factors where user_id = $1', [id]);
        // A device trusted with the lost phone's codes must not skip the step once 2FA is back on; a session it opened ends, like an unlink.
        await tx.query(`delete from verifications where value = $1 and identifier like 'trust-device-%'`, [id]);
        await tx.query('delete from sessions where user_id = $1', [id]);
        await audit(tx, { actorId, action: 'user.two_factor_disable', target, oldValue: { twoFactor: true }, newValue: { twoFactor: false, sessionsRevoked: true } });
      });
    }
  } catch (e) {
    return authFailure(e);
  }
  const now = (await pool.query('select id, email, name, role, banned, team_id, can_edit_templates from users where id = $1', [id])).rows[0];
  return Response.json({ id: now.id, email: now.email, name: now.name, role: now.role, banned: now.banned, teamId: now.team_id, canEditTemplates: now.can_edit_templates });
}

/**
 * Admin: remove a user for good. better-auth's accounts, sessions, passkeys and 2FA rows fall with it (those foreign keys cascade), so the
 * sign-in ends at once. A user that has created content — a clip, an uploaded asset, a decided proposal, or an audit row as its actor — is
 * held back by a restrict foreign key: the delete is refused with 409 so cost and audit history is never orphaned, and the Admin locks the
 * account instead. You cannot delete yourself, so the acting Admin always remains and the last admin can never be removed. The audit row
 * shares the transaction and rolls back with a refused delete.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const actorId = g.session.user.id;
  if (id === actorId) return bad('you cannot delete yourself');
  const target = `user:${id}`;
  try {
    const refusal = await withTransaction(pool, async (tx) => {
      await tx.query('select pg_advisory_xact_lock(hashtext($1))', [target]);
      const user = (await tx.query('select role, email from users where id = $1', [id])).rows[0];
      if (!user) return bad('not found', 404);
      await audit(tx, { actorId, action: 'user.delete', target, oldValue: { email: user.email, role: user.role } });
      await tx.query('delete from users where id = $1', [id]);
    });
    return refusal ?? Response.json({ ok: true });
  } catch (e) {
    // A restrict foreign key (assets, jobs, proposals, audit_entries) blocks the delete: the user has content, so lock the account instead.
    if (e && typeof e === 'object' && (e as { code?: string }).code === '23503') return bad('this user has created content (a clip, an upload or a record); lock the account instead of deleting it', 409);
    throw e;
  }
}
