import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { bad, nonEmpty, pgCode, readBody } from '@/lib/admin';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/**
 * Admin: rename a store, change its `code`, close or reopen it (`hidden`, audited `store.hide`), pause or resume it (`paused`, audited
 * `store.pause`) or give it to a team or none (`teamId`, audited `store.team`; a company store only, docs/BILLING.md). The code may change at any time: cost entries and jobs point at the store by id, so its history stays with it, and the
 * change is audited (`store.update`). A code that another store uses is refused (409).
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const { name, code, hidden, paused, teamId } = (await readBody(request)) ?? {};
  if (
    (name !== undefined && !nonEmpty(name)) || (code !== undefined && !nonEmpty(code)) || [hidden, paused].some((v) => v !== undefined && typeof v !== 'boolean') ||
    (teamId !== undefined && teamId !== null && !nonEmpty(teamId))
  ) {
    return bad('name and code must be non-empty, hidden and paused true or false, teamId a team id or null');
  }
  if ([name, code, hidden, paused, teamId].every((v) => v === undefined)) return bad('give at least one of name, code, hidden, paused, teamId');
  const actorId = g.session.user.id;

  try {
    return await withTransaction(pool, async (tx): Promise<Response> => {
      const old = (await tx.query('select name, code, hidden, paused, team_id from stores where id = $1 and workspace_id = $2 for update', [id, g.workspaceId])).rows[0];
      if (!old) return bad('not found', 404);
      if (typeof teamId === 'string') {
        // A partner's costs are its workspace's, so only a company store has a team.
        if (g.workspaceId !== COMPANY_WORKSPACE_ID) return bad('only a store of the company workspace has a team');
        if (!(await tx.query('select 1 from teams where id = $1', [teamId])).rowCount) return bad('the team does not exist');
      }
      const next = {
        name: nonEmpty(name) ? name.trim() : old.name,
        code: nonEmpty(code) ? code.trim() : old.code,
        hidden: typeof hidden === 'boolean' ? hidden : old.hidden,
        paused: typeof paused === 'boolean' ? paused : old.paused,
        teamId: teamId === undefined ? (old.team_id as string | null) : (teamId as string | null),
      };
      await tx.query('update stores set name = $2, code = $3, hidden = $4, paused = $5, team_id = $6 where id = $1', [id, next.name, next.code, next.hidden, next.paused, next.teamId]);
      if (next.teamId !== old.team_id) await audit(tx, { actorId, action: 'store.team', target: `store:${id}`, oldValue: { teamId: old.team_id }, newValue: { teamId: next.teamId } });
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
 * Admin: delete a store nothing points at yet (owner decision, 2026-11-11): no job, cost entry, upload, template, saved choice or product. Any of
 * those is 409, so the costs of past months keep their store; close the store instead. Audited `store.delete`.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  return withTransaction(pool, async (tx): Promise<Response> => {
    const old = (await tx.query('select name, code from stores where id = $1 and workspace_id = $2 for update', [id, g.workspaceId])).rows[0];
    if (!old) return bad('not found', 404);
    const used = await tx.query(
      `select 1 from jobs where store_id = $1 union all select 1 from cost_entries where store_id = $1 union all select 1 from assets where store_id = $1
       union all select 1 from user_templates where store_id = $1 union all select 1 from user_choices where store_id = $1 union all select 1 from products where store_id = $1 limit 1`,
      [id],
    );
    if (used.rowCount) return bad('the store has clips, costs, uploads, templates, choices or products; close it instead', 409);
    await tx.query('delete from stores where id = $1', [id]);
    await audit(tx, { actorId: g.session.user.id, action: 'store.delete', target: `store:${id}`, oldValue: { name: old.name, code: old.code }, newValue: null });
    return Response.json({ ok: true });
  });
}
