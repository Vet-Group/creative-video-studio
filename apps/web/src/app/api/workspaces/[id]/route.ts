import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { bad, pgCode, readBody } from '@/lib/admin';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard, sameOrigin } from '@/lib/session';
import { managerOf, nameOf } from '@/lib/workspaces';

/**
 * Rename a workspace (`name`: an Admin, or its owner on the Members page) or disable and re-enable it (`disabled`: an Admin only). A disabled workspace
 * refuses its members' requests (they fall back to another membership or see the no-workspace notice) and keeps every row. The company's workspace
 * keeps its name and cannot be disabled. A name another workspace has, in any case, is refused (409 name_taken). Each change is audited.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  if (!sameOrigin(request)) return bad('forbidden origin', 403);
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const as = await managerOf(g, id, true);
  if (as instanceof Response) return as;
  const { name, disabled } = (await readBody(request)) ?? {};
  if ((name === undefined && disabled === undefined) || (name !== undefined && !nameOf(name)) || (disabled !== undefined && typeof disabled !== 'boolean')) {
    return bad('give name (1 to 100 characters) or disabled (true or false)');
  }
  if (disabled !== undefined && as !== 'admin') return bad('forbidden', 403);
  if (id === COMPANY_WORKSPACE_ID) return bad('the company workspace keeps its name and stays enabled', 403);
  const actorId = g.session.user.id;
  const target = `workspace:${id}`;
  try {
    await withTransaction(pool, async (tx) => {
      const old = (await tx.query('select name, disabled_at is not null as disabled from workspaces where id = $1 for update', [id])).rows[0];
      const next = nameOf(name);
      if (next && next !== old.name) {
        await tx.query('update workspaces set name = $2 where id = $1', [id, next]);
        await audit(tx, { actorId, action: 'workspace.rename', target, oldValue: { name: old.name }, newValue: { name: next } });
      }
      if (typeof disabled === 'boolean' && disabled !== old.disabled) {
        await tx.query(`update workspaces set disabled_at = ${disabled ? 'now()' : 'null'} where id = $1`, [id]);
        await audit(tx, { actorId, action: disabled ? 'workspace.disable' : 'workspace.enable', target });
      }
    });
  } catch (e) {
    if (pgCode(e) === '23505') return bad('name_taken', 409);
    throw e;
  }
  return Response.json({ ok: true });
}
