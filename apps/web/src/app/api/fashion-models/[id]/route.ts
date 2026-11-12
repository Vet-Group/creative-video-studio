import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad, readBody } from '@/lib/admin';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { MAX_NAME, visibleFashionModels } from '@/lib/fashion-models';
import { guard } from '@/lib/session';

type Row = { user_id: string; name: string; shared: boolean; shared_locked: boolean };
const LOAD = 'select user_id, name, shared, shared_locked from fashion_models where id = $1 and deleted_at is null for update';

/**
 * Change a saved model: `{ name?, shared?, sharedLocked? }`. The owner renames it and shares or unshares it with every member unless an Admin decided
 * (`sharedLocked`). An Admin shares or unshares any model, which locks it (`sharedLocked` true) until an Admin sends `sharedLocked: false`. Another member's
 * private model is 404, a shared one they may not change 403. Audited `fashion_model.update`.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const { name, shared, sharedLocked } = (await readBody(request)) ?? {};
  if ((name !== undefined && (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > MAX_NAME)) || [shared, sharedLocked].some((v) => v !== undefined && typeof v !== 'boolean')) {
    return bad(`name must have 1 to ${MAX_NAME} characters, shared and sharedLocked be true or false`);
  }
  if ([name, shared, sharedLocked].every((v) => v === undefined)) return bad('give at least one of name, shared, sharedLocked');
  const user = g.session.user;
  const admin = user.role === 'admin';
  return withTransaction(pool, async (tx): Promise<Response> => {
    const old = (await tx.query(LOAD, [id])).rows[0] as Row | undefined;
    if (!old || (!admin && old.user_id !== user.id && !old.shared)) return bad('not found', 404);
    const owner = old.user_id === user.id;
    if (name !== undefined && !owner) return bad('only the owner renames a model', 403);
    if (sharedLocked !== undefined && !admin) return bad('only an Admin releases a decision', 403);
    if (shared !== undefined && !admin && (!owner || old.shared_locked)) return bad('an Admin decided who sees this model', 403);
    const next = {
      name: typeof name === 'string' ? name.trim() : old.name,
      shared: typeof shared === 'boolean' ? shared : old.shared,
      // An Admin's choice of who sees a model is final until an Admin releases it.
      sharedLocked: typeof sharedLocked === 'boolean' ? sharedLocked : shared !== undefined && admin ? true : old.shared_locked,
    };
    await tx.query('update fashion_models set name = $2, shared = $3, shared_locked = $4 where id = $1', [id, next.name, next.shared, next.sharedLocked]);
    await audit(tx, { actorId: user.id, action: 'fashion_model.update', target: `fashion_model:${id}`, oldValue: { name: old.name, shared: old.shared, sharedLocked: old.shared_locked }, newValue: next });
    return Response.json((await visibleFashionModels(tx, user, id))[0]);
  });
}

/** Delete a saved model (soft: the row stays with `deleted_at`, and the picture stays an input). The owner or an Admin; audited `fashion_model.delete`. */
export async function DELETE(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const user = g.session.user;
  return withTransaction(pool, async (tx): Promise<Response> => {
    const old = (await tx.query(LOAD, [id])).rows[0] as Row | undefined;
    if (!old || (user.role !== 'admin' && old.user_id !== user.id && !old.shared)) return bad('not found', 404);
    if (user.role !== 'admin' && old.user_id !== user.id) return bad('only the owner or an Admin deletes a model', 403);
    await tx.query('update fashion_models set deleted_at = now() where id = $1', [id]);
    await audit(tx, { actorId: user.id, action: 'fashion_model.delete', target: `fashion_model:${id}`, oldValue: { name: old.name, shared: old.shared } });
    return new Response(null, { status: 204 });
  });
}
