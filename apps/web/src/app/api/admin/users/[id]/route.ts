import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { type RouteContext } from '@/lib/assets';
import { auth, pool } from '@/lib/auth';
import { authFailure, bad, nonEmpty, readBody } from '@/lib/admin';
import { guard } from '@/lib/session';

/**
 * Admin: change one user. Any of `role` (member|admin), `teamId` (a visible team), `banned` (boolean, with an optional `banReason`) and
 * `temporaryPassword` in one body. Each change that differs from the current state is audited with its old and new value; the
 * password itself is never stored. A team change touches only users.team_id: jobs keep the team they were run under.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const actorId = g.session.user.id;
  const { role, teamId, banned, banReason, temporaryPassword } = (await readBody(request)) ?? {};
  if ([role, teamId, banned, temporaryPassword].every((v) => v === undefined)) return bad('give at least one of role, teamId, banned, temporaryPassword');
  if (role !== undefined && role !== 'member' && role !== 'admin') return bad('role must be member or admin');
  if (teamId !== undefined && typeof teamId !== 'string') return bad('teamId must be a string');
  if (banned !== undefined && typeof banned !== 'boolean') return bad('banned must be true or false');
  if (banReason !== undefined && typeof banReason !== 'string') return bad('banReason must be a string');
  if (temporaryPassword !== undefined && !nonEmpty(temporaryPassword)) return bad('temporaryPassword must be a non-empty string');
  if (id === actorId && ((role !== undefined && role !== g.session.user.role) || banned === true)) return bad('you cannot change your own role or ban yourself');

  const user = (await pool.query('select role, banned from users where id = $1', [id])).rows[0];
  if (!user) return bad('not found', 404);
  if (typeof teamId === 'string' && !(await pool.query('select 1 from teams where id = $1 and not hidden', [teamId])).rowCount) return bad('teamId must be the id of a visible team');

  try {
    const target = `user:${id}`;
    if (role !== undefined && role !== user.role) {
      await auth.api.setRole({ headers: request.headers, body: { userId: id, role } });
      await audit(pool, { actorId, action: 'user.role_change', target, oldValue: { role: user.role }, newValue: { role } });
    }
    if (typeof teamId === 'string') {
      await withTransaction(pool, async (tx) => {
        const old = (await tx.query('select team_id from users where id = $1 for update', [id])).rows[0].team_id;
        if (old === teamId) return;
        await tx.query('update users set team_id = $2, updated_at = now() where id = $1', [id, teamId]);
        await audit(tx, { actorId, action: 'user.team_change', target, oldValue: { teamId: old }, newValue: { teamId } });
      });
    }
    if (banned === true && !user.banned) {
      await auth.api.banUser({ headers: request.headers, body: { userId: id, ...(banReason ? { banReason } : {}) } });
      await audit(pool, { actorId, action: 'user.ban', target, oldValue: { banned: false }, newValue: { banned: true, reason: banReason ?? null } });
    } else if (banned === false && user.banned) {
      await auth.api.unbanUser({ headers: request.headers, body: { userId: id } });
      await audit(pool, { actorId, action: 'user.unban', target, oldValue: { banned: true }, newValue: { banned: false } });
    }
    if (temporaryPassword !== undefined) {
      await auth.api.setUserPassword({ headers: request.headers, body: { userId: id, newPassword: temporaryPassword as string } });
      await audit(pool, { actorId, action: 'user.password_set', target, newValue: { temporary: true } });
    }
  } catch (e) {
    return authFailure(e);
  }
  const now = (await pool.query('select id, email, name, role, banned, team_id from users where id = $1', [id])).rows[0];
  return Response.json({ id: now.id, email: now.email, name: now.name, role: now.role, banned: now.banned, teamId: now.team_id });
}
