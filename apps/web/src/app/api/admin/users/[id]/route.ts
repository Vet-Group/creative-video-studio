import { type AuditEntry, audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { type RouteContext } from '@/lib/assets';
import { auth, pool } from '@/lib/auth';
import { authFailure, bad, readBody } from '@/lib/admin';
import { guard } from '@/lib/session';

/** better-auth's default password length limits (see lib/auth.ts, which does not change them). */
const PASSWORD_LENGTH = { min: 8, max: 128 };

/**
 * Admin: change one user. Any of `name`, `email` (unique; a first Google or Lark sign-in links by this address), `role` (member|admin),
 * `teamId` (a visible team), `banned` (boolean, with an optional `banReason`) and `temporaryPassword` in one body. Every field is checked before anything is written. Each change that differs from the current state is
 * audited with its old and new value, in the transaction of the change itself: the audit row commits only if the change was made. The
 * password itself is never stored. A team change touches only users.team_id: jobs keep the team they were run under.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const actorId = g.session.user.id;
  const { name, email, role, teamId, banned, banReason, temporaryPassword } = (await readBody(request)) ?? {};
  if ([name, email, role, teamId, banned, temporaryPassword].every((v) => v === undefined)) return bad('give at least one of name, email, role, teamId, banned, temporaryPassword');
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
  if (id === actorId && ((role !== undefined && role !== g.session.user.role) || banned === true)) return bad('you cannot change your own role or ban yourself');

  if (!(await pool.query('select 1 from users where id = $1', [id])).rowCount) return bad('not found', 404);
  if (typeof teamId === 'string' && !(await pool.query('select 1 from teams where id = $1 and not hidden', [teamId])).rowCount) return bad('teamId must be the id of a visible team');
  if (typeof newEmail === 'string' && (await pool.query('select 1 from users where lower(email) = $1 and id <> $2', [newEmail, id])).rowCount) return bad('another user has this email', 409);

  const target = `user:${id}`;
  // The change and its audit row share a transaction: `apply` (a better-auth call on its own connection) failing rolls the audit row back.
  // The users row is not locked, because better-auth updates it from another connection and would wait for us; an advisory lock
  // serialises Admins changing the same user instead, so the old value read here is the one the change replaces.
  const change = (entry: (old: { role: string; banned: boolean }) => Omit<AuditEntry, 'actorId' | 'target'> | null, apply: () => Promise<unknown>) =>
    withTransaction(pool, async (tx) => {
      await tx.query('select pg_advisory_xact_lock(hashtext($1))', [target]);
      const e = entry((await tx.query('select role, banned from users where id = $1', [id])).rows[0]);
      if (!e) return;
      await audit(tx, { actorId, target, ...e });
      await apply();
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
        () => auth.api.setUserPassword({ headers: request.headers, body: { userId: id, newPassword: temporaryPassword as string } }),
      );
    }
  } catch (e) {
    return authFailure(e);
  }
  const now = (await pool.query('select id, email, name, role, banned, team_id from users where id = $1', [id])).rows[0];
  return Response.json({ id: now.id, email: now.email, name: now.name, role: now.role, banned: now.banned, teamId: now.team_id });
}
