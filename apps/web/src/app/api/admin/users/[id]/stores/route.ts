import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { bad, readBody } from '@/lib/admin';
import { guard } from '@/lib/session';

/** Admin: the stores assigned to one user. An assigned store is one of "theirs" and leads their store pickers, like one they pinned. */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const { rows } = await pool.query('select store_id as "storeId" from user_stores where user_id = $1 and assigned order by store_id', [id]);
  return Response.json({ storeIds: rows.map((r) => r.storeId) });
}

/**
 * Admin: set the full set of stores assigned to a user (`storeIds`, visible stores only). Stores dropped from the set are unassigned; a row
 * left with no flag and no last-used time is removed. The change is audited (`user.stores`) only when the assigned set actually changes.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const body = (await readBody(request)) ?? {};
  const storeIds = Array.isArray(body.storeIds) ? [...new Set(body.storeIds.filter((x: unknown): x is string => typeof x === 'string'))] : null;
  if (!storeIds || storeIds.length !== (body.storeIds as unknown[]).length) return bad('storeIds must be an array of store ids');
  return withTransaction(pool, async (tx): Promise<Response> => {
    if (!(await tx.query('select 1 from users where id = $1', [id])).rows[0]) return bad('not found', 404);
    const valid = (await tx.query('select id from stores where id = any($1::text[]) and not hidden', [storeIds])).rows.length;
    if (valid !== storeIds.length) return bad('a store does not exist or is hidden');
    const before = (await tx.query('select store_id from user_stores where user_id = $1 and assigned', [id])).rows.map((r) => r.store_id).sort();
    if (storeIds.length)
      await tx.query(
        `insert into user_stores (user_id, store_id, assigned) select $1, x, true from unnest($2::text[]) x
           on conflict (user_id, store_id) do update set assigned = true`,
        [id, storeIds],
      );
    await tx.query('update user_stores set assigned = false where user_id = $1 and assigned and not (store_id = any($2::text[]))', [id, storeIds]);
    await tx.query('delete from user_stores where user_id = $1 and not pinned and not assigned and last_used_at is null', [id]);
    const after = [...storeIds].sort();
    if (JSON.stringify(before) !== JSON.stringify(after)) await audit(tx, { actorId: g.session.user.id, action: 'user.stores', target: `user:${id}`, oldValue: { storeIds: before }, newValue: { storeIds: after } });
    return Response.json({ storeIds: after });
  });
}
