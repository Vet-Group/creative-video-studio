import { reassignStore } from '@cvs/core/ledger';
import { bad, readBody } from '@/lib/admin';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/**
 * Admin: re-assign a clip's (job's) store, `{ storeId }` being a visible store or null for none. The job's whole balance moves to the new
 * store as a store_reassign pair in the ledger, with an audit entry, in one transaction.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const body = await readBody(request);
  const storeId = body?.storeId;
  if (storeId !== null && typeof storeId !== 'string') return bad('storeId must be a store id or null');
  if (!(await pool.query('select 1 from jobs where id = $1', [id])).rowCount) return bad('not found', 404);
  if (storeId !== null && !(await pool.query('select 1 from stores where id = $1 and not hidden', [storeId])).rowCount) return bad('storeId must be the id of a visible store');
  const changed = await reassignStore(pool, id, storeId, g.session.user.id);
  return Response.json({ id, storeId, changed });
}
