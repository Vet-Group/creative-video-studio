import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad, nonEmpty, pgCode, readBody } from '@/lib/admin';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/**
 * Admin: rename a store, change its `code` or hide or unhide it (`store.hide`). A store is never deleted. The code may change at any time: cost
 * entries and jobs point at the store by id, so its history stays with it, and the change is audited (`store.update`). A code that another
 * store uses is refused (409).
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const { name, code, hidden } = (await readBody(request)) ?? {};
  if ((name !== undefined && !nonEmpty(name)) || (code !== undefined && !nonEmpty(code)) || (hidden !== undefined && typeof hidden !== 'boolean')) {
    return bad('name and code must be non-empty, hidden true or false');
  }
  if ([name, code, hidden].every((v) => v === undefined)) return bad('give at least one of name, code, hidden');
  const actorId = g.session.user.id;

  try {
    return await withTransaction(pool, async (tx): Promise<Response> => {
      const old = (await tx.query('select name, code, hidden from stores where id = $1 for update', [id])).rows[0];
      if (!old) return bad('not found', 404);
      const next = { name: nonEmpty(name) ? name.trim() : old.name, code: nonEmpty(code) ? code.trim() : old.code, hidden: typeof hidden === 'boolean' ? hidden : old.hidden };
      await tx.query('update stores set name = $2, code = $3, hidden = $4 where id = $1', [id, next.name, next.code, next.hidden]);
      if (next.name !== old.name || next.code !== old.code) {
        await audit(tx, { actorId, action: 'store.update', target: `store:${id}`, oldValue: { name: old.name, code: old.code }, newValue: { name: next.name, code: next.code } });
      }
      if (next.hidden !== old.hidden) await audit(tx, { actorId, action: 'store.hide', target: `store:${id}`, oldValue: { hidden: old.hidden }, newValue: { hidden: next.hidden } });
      return Response.json({ id, ...next });
    });
  } catch (e) {
    if (pgCode(e) === '23505') return bad('this store code is already used', 409);
    throw e;
  }
}
