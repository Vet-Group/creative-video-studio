import { audit } from '@cvs/core/audit';
import { type Queryable, withTransaction } from '@cvs/core/ledger';
import { bad, pgCode, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';
import { createAccount, emailOf, join, nameOf } from '@/lib/workspaces';

/**
 * Admin: every workspace, the company's first, with its owners, its member count, this ICT month's jobs and this month's cost from the ledger. Usage
 * numbers only (docs/WORKSPACES.md §3): no prompt, no media, no member beyond the owners.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { rows } = await pool.query(
    `with month as (select to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as m,
                           date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh' as since)
     select w.id, w.name, w.created_at, w.disabled_at,
            (select count(*)::int from workspace_members m where m.workspace_id = w.id) as members,
            (select count(*)::int from jobs j where j.workspace_id = w.id and j.created_at >= month.since) as jobs,
            (select coalesce(sum(c.usd), 0)::numeric(12, 4)::text from cost_entries c where c.workspace_id = w.id and c.month = month.m) as cost,
            coalesce((select json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email) order by lower(u.name), u.id)
                        from workspace_members m join users u on u.id = m.user_id where m.workspace_id = w.id and m.role = 'owner'), '[]') as owners
       from workspaces w cross join month
      order by w.id <> 'ws_vet', lower(w.name)`,
  );
  return Response.json({
    workspaces: rows.map((w) => ({ id: w.id, name: w.name, createdAt: w.created_at.toISOString(), disabled: w.disabled_at !== null, members: w.members, jobsThisMonth: w.jobs, costThisMonthUsd: w.cost, owners: w.owners })),
  });
}

/**
 * Admin: create a workspace with its first owner, `{ name, ownerEmail }` for an existing user or `{ name, ownerEmail, ownerName }` for a new account,
 * whose temporary password the answer carries once. A name another workspace has (in any case) is refused, 409 name_taken.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const body = (await readBody(request)) ?? {};
  const name = nameOf(body.name);
  const email = emailOf(body.ownerEmail);
  if (!name || !email || (body.ownerName !== undefined && !nameOf(body.ownerName))) return bad('name and ownerEmail are required; ownerName (1 to 100 characters) creates the owner');
  if ((await pool.query('select 1 from workspaces where lower(name) = lower($1)', [name])).rowCount) return bad('name_taken', 409);
  const actorId = g.session.user.id;
  const id = `ws_${crypto.randomUUID()}`;
  const open = async (tx: Queryable, ownerId: string) => {
    await tx.query('insert into workspaces (id, name, created_by) values ($1, $2, $3)', [id, name, actorId]);
    await audit(tx, { actorId, action: 'workspace.create', target: `workspace:${id}`, newValue: { name } });
    await join(tx, actorId, id, ownerId, 'owner');
  };
  try {
    if (body.ownerName !== undefined) {
      const made = await createAccount(actorId, { email, name: nameOf(body.ownerName)!, byOwner: false, workspaceId: id }, open);
      return made instanceof Response ? made : Response.json({ id, ownerId: made.userId, temporaryPassword: made.password }, { status: 201 });
    }
    const owner = (await pool.query('select id from users where lower(email) = $1', [email])).rows[0];
    if (!owner) return bad('no_user', 404);
    await withTransaction(pool, (tx) => open(tx, owner.id));
    return Response.json({ id, ownerId: owner.id }, { status: 201 });
  } catch (e) {
    if (pgCode(e) === '23505') return bad('name_taken', 409); // created by another Admin since the check
    throw e;
  }
}
