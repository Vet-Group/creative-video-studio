import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/** Admin: every preset, enabled or not, in display order. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { rows } = await pool.query('select id, label, prompt, enabled, sort_order as "sortOrder" from presets order by sort_order, id');
  return Response.json({ presets: rows });
}
