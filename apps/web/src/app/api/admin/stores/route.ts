import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad, nonEmpty, pgCode, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/** Admin: the stores, each with whether the ledger already holds rows for it (then its code is locked). Hidden ones only with `?includeHidden=1`. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const all = new URL(request.url).searchParams.get('includeHidden') === '1';
  const { rows } = await pool.query(
    `select s.id, s.name, s.code, s.hidden, exists (select 1 from cost_entries c where c.store_id = s.id) as "hasCost"
       from stores s where $1 or not s.hidden order by s.name, s.id`,
    [all],
  );
  return Response.json({ stores: rows });
}

/** Admin: create a store (`name` and a unique `code`, equal to POD Studio's store_id). A taken code is 409. Audited. */
export async function POST(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { name, code } = (await readBody(request)) ?? {};
  if (!nonEmpty(name) || !nonEmpty(code)) return bad('name and code are required');
  const store = { id: crypto.randomUUID(), name: name.trim(), code: code.trim(), hidden: false };
  try {
    await withTransaction(pool, async (tx) => {
      await tx.query('insert into stores (id, name, code) values ($1, $2, $3)', [store.id, store.name, store.code]);
      await audit(tx, { actorId: g.session.user.id, action: 'store.create', target: `store:${store.id}`, newValue: { name: store.name, code: store.code } });
    });
  } catch (e) {
    if (pgCode(e) === '23505') return bad('this store code is already used', 409);
    throw e;
  }
  return Response.json(store, { status: 201 });
}
