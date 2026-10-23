import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad, nonEmpty, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/** Admin: the teams. Hidden ones are left out unless `?includeHidden=1`, so the new-user form (which uses the default) never offers them. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const all = new URL(request.url).searchParams.get('includeHidden') === '1';
  const { rows } = await pool.query(
    'select id, name, cost_centre_code as "costCentreCode", hidden from teams where $1 or not hidden order by name, id',
    [all],
  );
  return Response.json({ teams: rows });
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
