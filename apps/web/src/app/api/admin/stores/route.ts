import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { bad, nonEmpty, pgCode, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/**
 * Admin: the active workspace's stores (a store belongs to one workspace, docs/WORKSPACES.md §2), each with its brand kit, whether the ledger already holds rows for it (`hasCost`: a code change asks first) and whether
 * anything points at it (`inUse`: it can be closed but not deleted), and its team (`teamId`). Hidden (closed) ones only with `?includeHidden=1`. `teams` lists the
 * teams a store may be given, in the company workspace only (docs/BILLING.md); elsewhere it is null.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const all = new URL(request.url).searchParams.get('includeHidden') === '1';
  const { rows } = await pool.query(
    `select s.id, s.name, s.code, s.hidden, s.paused, s.brand_voice as "brandVoice", s.brand_colors as "brandColors", s.brand_tagline as "brandTagline", s.team_id as "teamId",
            exists (select 1 from cost_entries c where c.store_id = s.id) as "hasCost",
            exists (select 1 from jobs where store_id = s.id union all select 1 from cost_entries where store_id = s.id union all select 1 from assets where store_id = s.id
                    union all select 1 from user_templates where store_id = s.id union all select 1 from user_choices where store_id = s.id) as "inUse"
       from stores s where s.workspace_id = $2 and ($1 or not s.hidden) order by s.hidden, s.paused, s.name, s.id`,
    [all, g.workspaceId],
  );
  const teams = g.workspaceId === COMPANY_WORKSPACE_ID ? (await pool.query('select id, name, billable from teams where not hidden order by name, id')).rows : null;
  return Response.json({ stores: rows, teams });
}

/** Admin: create a store in the active workspace (`name` and a unique `code`, equal to POD Studio's store_id). A taken code is 409. Audited. */
export async function POST(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { name, code } = (await readBody(request)) ?? {};
  if (!nonEmpty(name) || !nonEmpty(code)) return bad('name and code are required');
  const store = { id: crypto.randomUUID(), name: name.trim(), code: code.trim(), hidden: false };
  try {
    await withTransaction(pool, async (tx) => {
      await tx.query('insert into stores (id, name, code, workspace_id) values ($1, $2, $3, $4)', [store.id, store.name, store.code, g.workspaceId]);
      await audit(tx, { actorId: g.session.user.id, action: 'store.create', target: `store:${store.id}`, newValue: { name: store.name, code: store.code } });
    });
  } catch (e) {
    if (pgCode(e) === '23505') return bad('this store code is already used', 409);
    throw e;
  }
  return Response.json(store, { status: 201 });
}
