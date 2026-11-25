import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { bad, money, nonEmpty, readBody } from '@/lib/admin';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { isLanding } from '@/lib/landing';
import { guard } from '@/lib/session';

/**
 * Admin: rename a team or change its cost-centre code (`team.rename`), hide or unhide it (`team.hide`), leave it out of the reports' real-user figures or
 * count it again (`excludedFromReports`: `team.reports`, lib/real-users.ts), make it a billing team or not and set its free monthly allowance in USD
 * (`billable`, `freeMonthlyUsd`: `team.billing`), or set the company stores it owns (`storeIds`, the whole set: `team.stores`; a store taken from another
 * team leaves that team). A team is never deleted: hiding only stops it being offered for new users, and its history stays in the reports.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const { name, costCentreCode, hidden, excludedFromReports, defaultTool, billable, freeMonthlyUsd, storeIds } = (await readBody(request)) ?? {};
  const free = freeMonthlyUsd === undefined ? undefined : money(freeMonthlyUsd);
  if (
    (name !== undefined && !nonEmpty(name)) ||
    (costCentreCode != null && typeof costCentreCode !== 'string') ||
    (hidden !== undefined && typeof hidden !== 'boolean') ||
    (excludedFromReports !== undefined && typeof excludedFromReports !== 'boolean') ||
    (defaultTool !== undefined && defaultTool !== null && !isLanding(defaultTool)) ||
    (billable !== undefined && typeof billable !== 'boolean') ||
    free === null ||
    (storeIds !== undefined && (!Array.isArray(storeIds) || !storeIds.every((s) => typeof s === 'string') || new Set(storeIds).size !== storeIds.length))
  ) {
    return bad(
      'name must be non-empty, costCentreCode a string or null, hidden, excludedFromReports and billable true or false, defaultTool a landing route or null, freeMonthlyUsd a non-negative amount with at most 4 decimals, storeIds a list of distinct store ids',
    );
  }
  if ([name, costCentreCode, hidden, excludedFromReports, defaultTool, billable, freeMonthlyUsd, storeIds].every((v) => v === undefined)) {
    return bad('give at least one of name, costCentreCode, hidden, excludedFromReports, defaultTool, billable, freeMonthlyUsd, storeIds');
  }
  const actorId = g.session.user.id;

  return withTransaction(pool, async (tx): Promise<Response> => {
    const old = (await tx.query('select name, cost_centre_code, hidden, excluded_from_reports, default_tool, billable, free_monthly_usd::text as free from teams where id = $1 for update', [id])).rows[0];
    if (!old) return bad('not found', 404);
    const next = {
      name: nonEmpty(name) ? name.trim() : old.name,
      costCentreCode: costCentreCode === undefined ? old.cost_centre_code : nonEmpty(costCentreCode) ? costCentreCode.trim() : null,
      hidden: typeof hidden === 'boolean' ? hidden : old.hidden,
      excludedFromReports: typeof excludedFromReports === 'boolean' ? excludedFromReports : (old.excluded_from_reports as boolean),
      defaultTool: defaultTool === undefined ? old.default_tool : defaultTool,
      billable: typeof billable === 'boolean' ? billable : (old.billable as boolean),
      freeMonthlyUsd: free ?? (old.free as string),
    };
    await tx.query('update teams set name = $2, cost_centre_code = $3, hidden = $4, default_tool = $5, billable = $6, free_monthly_usd = $7, excluded_from_reports = $8 where id = $1', [
      id, next.name, next.costCentreCode, next.hidden, next.defaultTool, next.billable, next.freeMonthlyUsd, next.excludedFromReports,
    ]);
    if (next.name !== old.name || next.costCentreCode !== old.cost_centre_code || next.defaultTool !== old.default_tool) {
      await audit(tx, {
        actorId, action: 'team.rename', target: `team:${id}`,
        oldValue: { name: old.name, costCentreCode: old.cost_centre_code, defaultTool: old.default_tool }, newValue: { name: next.name, costCentreCode: next.costCentreCode, defaultTool: next.defaultTool },
      });
    }
    if (next.hidden !== old.hidden) await audit(tx, { actorId, action: 'team.hide', target: `team:${id}`, oldValue: { hidden: old.hidden }, newValue: { hidden: next.hidden } });
    if (next.excludedFromReports !== old.excluded_from_reports) {
      await audit(tx, { actorId, action: 'team.reports', target: `team:${id}`, oldValue: { excludedFromReports: old.excluded_from_reports }, newValue: { excludedFromReports: next.excludedFromReports } });
    }
    if (next.billable !== old.billable || next.freeMonthlyUsd !== old.free) {
      await audit(tx, { actorId, action: 'team.billing', target: `team:${id}`, oldValue: { billable: old.billable, freeMonthlyUsd: old.free }, newValue: { billable: next.billable, freeMonthlyUsd: next.freeMonthlyUsd } });
    }
    let owned: string[] = (await tx.query('select id from stores where team_id = $1 and workspace_id = $2', [id, COMPANY_WORKSPACE_ID])).rows.map((r) => r.id).sort();
    if (storeIds !== undefined) {
      const wanted = [...(storeIds as string[])].sort();
      // Only the company's stores have a team: a partner's costs are its workspace's (docs/BILLING.md).
      const found = (await tx.query('select id, team_id from stores where id = any($1::text[]) and workspace_id = $2 for update', [wanted, COMPANY_WORKSPACE_ID])).rows;
      if (found.length !== wanted.length) return bad('storeIds must be stores of the company workspace');
      if (wanted.join() !== owned.join()) {
        await tx.query('update stores set team_id = null where team_id = $1 and not (id = any($2::text[]))', [id, wanted]);
        await tx.query('update stores set team_id = $1 where id = any($2::text[])', [id, wanted]);
        const takenFrom = found.filter((s) => s.team_id !== null && s.team_id !== id).map((s) => ({ storeId: s.id, teamId: s.team_id }));
        await audit(tx, { actorId, action: 'team.stores', target: `team:${id}`, oldValue: { storeIds: owned }, newValue: { storeIds: wanted, ...(takenFrom.length > 0 && { takenFrom }) } });
        owned = wanted;
      }
    }
    return Response.json({ id, ...next, storeIds: owned });
  });
}
