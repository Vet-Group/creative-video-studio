import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { bad, nonEmpty, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/**
 * Admin: the teams, each with its billing (`billable`, `freeMonthlyUsd`), whether the reports leave it out (`excludedFromReports`, lib/real-users.ts) and
 * the company stores it owns (`storeIds`), and every company store (`stores`, closed ones too, with its team) for the team's store picker (docs/BILLING.md).
 * Hidden teams are left out unless `?includeHidden=1`, so the new-user form (which uses the default) never offers them.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const all = new URL(request.url).searchParams.get('includeHidden') === '1';
  const { rows } = await pool.query(
    `select t.id, t.name, t.cost_centre_code as "costCentreCode", t.hidden, t.default_tool as "defaultTool", t.billable, t.free_monthly_usd::text as "freeMonthlyUsd",
            t.excluded_from_reports as "excludedFromReports",
            array(select s.id from stores s where s.team_id = t.id and s.workspace_id = $2 order by s.name, s.id) as "storeIds"
       from teams t where $1 or not t.hidden order by t.name, t.id`,
    [all, COMPANY_WORKSPACE_ID],
  );
  const stores = await pool.query('select id, name, hidden, team_id as "teamId" from stores where workspace_id = $1 order by hidden, name, id', [COMPANY_WORKSPACE_ID]);
  return Response.json({ teams: rows, stores: stores.rows });
}

/** Admin: create a team (`name`, optional `costCentreCode`). Audited. */
export async function POST(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { name, costCentreCode } = (await readBody(request)) ?? {};
  if (!nonEmpty(name) || (costCentreCode != null && typeof costCentreCode !== 'string')) return bad('name is required; costCentreCode must be a string');
  const team = { id: crypto.randomUUID(), name: name.trim(), costCentreCode: nonEmpty(costCentreCode) ? costCentreCode.trim() : null, hidden: false };
  await withTransaction(pool, async (tx) => {
    await tx.query('insert into teams (id, name, cost_centre_code) values ($1, $2, $3)', [team.id, team.name, team.costCentreCode]);
    await audit(tx, { actorId: g.session.user.id, action: 'team.create', target: `team:${team.id}`, newValue: { name: team.name, costCentreCode: team.costCentreCode } });
  });
  return Response.json(team, { status: 201 });
}
