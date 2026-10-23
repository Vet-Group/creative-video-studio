import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/** The preset picker: the enabled presets in display order, by id and label. The prompt stays on the server, where Run reads it. */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { rows } = await pool.query('select id, label from presets where enabled order by sort_order, id');
  return Response.json({ presets: rows });
}
