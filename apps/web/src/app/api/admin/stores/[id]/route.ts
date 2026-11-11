import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad, nonEmpty, pgCode, readBody } from '@/lib/admin';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/**
 * Admin: rename a store, change its `code`, close or reopen it (`hidden`, audited `store.hide`) or pause or resume it (`paused`, audited
 * `store.pause`). The code may change at any time: cost entries and jobs point at the store by id, so its history stays with it, and the
 * change is audited (`store.update`). A code that another store uses is refused (409).
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const { name, code, hidden, paused } = (await readBody(request)) ?? {};
  if ((name !== undefined && !nonEmpty(name)) || (code !== undefined && !nonEmpty(code)) || [hidden, paused].some((v) => v !== undefined && typeof v !== 'boolean')) {
    return bad('name and code must be non-empty, hidden and paused true or false');
  }
  if ([name, code, hidden, paused].every((v) => v === undefined)) return bad('give at least one of name, code, hidden, paused');
  const actorId = g.session.user.id;

  try {
    return await withTransaction(pool, async (tx): Promise<Response> => {
      const old = (await tx.query('select name, code, hidden, paused from stores where id = $1 for update', [id])).rows[0];
      if (!old) return bad('not found', 404);
      const next = {
        name: nonEmpty(name) ? name.trim() : old.name,
        code: nonEmpty(code) ? code.trim() : old.code,
        hidden: typeof hidden === 'boolean' ? hidden : old.hidden,
        paused: typeof paused === 'boolean' ? paused : old.paused,
      };
      await tx.query('update stores set name = $2, code = $3, hidden = $4, paused = $5 where id = $1', [id, next.name, next.code, next.hidden, next.paused]);
      if (next.name !== old.name || next.code !== old.code) {
        await audit(tx, { actorId, action: 'store.update', target: `store:${id}`, oldValue: { name: old.name, code: old.code }, newValue: { name: next.name, code: next.code } });
      }
      if (next.hidden !== old.hidden) await audit(tx, { actorId, action: 'store.hide', target: `store:${id}`, oldValue: { hidden: old.hidden }, newValue: { hidden: next.hidden } });
      if (next.paused !== old.paused) await audit(tx, { actorId, action: 'store.pause', target: `store:${id}`, oldValue: { paused: old.paused }, newValue: { paused: next.paused } });
      return Response.json({ id, ...next });
    });
  } catch (e) {
    if (pgCode(e) === '23505') return bad('this store code is already used', 409);
    throw e;
  }
}

/**
 * Admin: delete a store nothing points at yet (owner decision, 2026-11-11): no job, cost entry, upload, template or saved choice. Any of
 * those is 409, so the costs of past months keep their store; close the store instead. Audited `store.delete`.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  return withTransaction(pool, async (tx): Promise<Response> => {
    const old = (await tx.query('select name, code from stores where id = $1 for update', [id])).rows[0];
    if (!old) return bad('not found', 404);
    const used = await tx.query(
      `select 1 from jobs where store_id = $1 union all select 1 from cost_entries where store_id = $1 union all select 1 from assets where store_id = $1
       union all select 1 from user_templates where store_id = $1 union all select 1 from user_choices where store_id = $1 limit 1`,
      [id],
    );
    if (used.rowCount) return bad('the store has clips, costs, uploads, templates or choices; close it instead', 409);
    await tx.query('delete from stores where id = $1', [id]);
    await audit(tx, { actorId: g.session.user.id, action: 'store.delete', target: `store:${id}`, oldValue: { name: old.name, code: old.code }, newValue: null });
    return Response.json({ ok: true });
  });
}
