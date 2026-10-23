import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/** The store picker: stores that are not hidden. */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { rows } = await pool.query('select id, name, code from stores where not hidden order by name, id');
  return Response.json({ stores: rows });
}
