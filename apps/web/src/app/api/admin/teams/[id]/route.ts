import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad, nonEmpty, readBody } from '@/lib/admin';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/**
 * Admin: rename a team or change its cost-centre code (`team.rename`), or hide or unhide it (`team.hide`). A team is never deleted:
 * hiding only stops it being offered for new users, and its history stays in the reports.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const { name, costCentreCode, hidden } = (await readBody(request)) ?? {};
  if ((name !== undefined && !nonEmpty(name)) || (costCentreCode != null && typeof costCentreCode !== 'string') || (hidden !== undefined && typeof hidden !== 'boolean')) {
    return bad('name must be non-empty, costCentreCode a string or null, hidden true or false');
  }
  if ([name, costCentreCode, hidden].every((v) => v === undefined)) return bad('give at least one of name, costCentreCode, hidden');
  const actorId = g.session.user.id;

  return withTransaction(pool, async (tx): Promise<Response> => {
    const old = (await tx.query('select name, cost_centre_code, hidden from teams where id = $1 for update', [id])).rows[0];
    if (!old) return bad('not found', 404);
    const next = {
      name: nonEmpty(name) ? name.trim() : old.name,
      costCentreCode: costCentreCode === undefined ? old.cost_centre_code : nonEmpty(costCentreCode) ? costCentreCode.trim() : null,
      hidden: typeof hidden === 'boolean' ? hidden : old.hidden,
    };
    await tx.query('update teams set name = $2, cost_centre_code = $3, hidden = $4 where id = $1', [id, next.name, next.costCentreCode, next.hidden]);
    if (next.name !== old.name || next.costCentreCode !== old.cost_centre_code) {
      await audit(tx, {
        actorId, action: 'team.rename', target: `team:${id}`,
        oldValue: { name: old.name, costCentreCode: old.cost_centre_code }, newValue: { name: next.name, costCentreCode: next.costCentreCode },
      });
    }
    if (next.hidden !== old.hidden) await audit(tx, { actorId, action: 'team.hide', target: `team:${id}`, oldValue: { hidden: old.hidden }, newValue: { hidden: next.hidden } });
    return Response.json({ id, ...next });
  });
}
