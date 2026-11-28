import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad, readBody } from '@/lib/admin';
import { tokenAdmin } from '@/lib/agent-access';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';

/** Renames a connection (`name`, 1-60), any Admin's; a revoked one is 409. A `capUsd` from an older client is ignored. Audited with the old and new name. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await tokenAdmin(request);
  if (g.error) return g.error;
  const { id } = await params;
  const body = (await readBody(request)) ?? {};
  const name = typeof body.name === 'string' ? body.name.trim() : body.name;
  if (name === undefined) return bad('give name');
  if (!(typeof name === 'string' && name.length >= 1 && name.length <= 60)) return bad('name must have 1 to 60 characters');
  return withTransaction(pool, async (tx) => {
    const old = (await tx.query('select user_id, name, revoked_at from api_tokens where id = $1 for update', [id])).rows[0];
    if (!old) return bad('not found', 404);
    if (old.revoked_at) return bad('revoked', 409);
    await tx.query('update api_tokens set name = $2 where id = $1', [id, name]);
    await audit(tx, { actorId: g.session.user.id, action: 'agent.token_update', target: `api_token:${id}`, oldValue: { name: old.name }, newValue: { name, ownerId: old.user_id } });
    return Response.json({ id, name });
  });
}

/** Revokes a connection, any Admin's: the token stops working on its next request. Audited; revoking one already revoked changes nothing. */
export async function DELETE(request: Request, { params }: RouteContext) {
  const g = await tokenAdmin(request);
  if (g.error) return g.error;
  const { id } = await params;
  const actorId = g.session.user.id;
  return withTransaction(pool, async (tx) => {
    const row = (await tx.query('select user_id, revoked_at from api_tokens where id = $1 for update', [id])).rows[0];
    if (!row) return bad('not found', 404);
    if (!row.revoked_at) {
      const reason = row.user_id === actorId ? 'owner' : 'admin';
      await tx.query('update api_tokens set revoked_at = now(), revoked_by = $2, revoke_reason = $3 where id = $1', [id, actorId, reason]);
      await audit(tx, { actorId, action: 'agent.token_revoke', target: `api_token:${id}`, newValue: { reason, ownerId: row.user_id } });
    }
    return Response.json({ revoked: true });
  });
}
