import type { RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { REMAKE_COLUMNS, reaRemakeEnabled } from '@/lib/remake';
import { guard } from '@/lib/session';

/** One of the caller's own remakes, polled while it runs. */
export async function GET(request: Request, { params }: RouteContext) {
  if (!reaRemakeEnabled()) return Response.json({ error: 'not found' }, { status: 404 });
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const row = (await pool.query(`select ${REMAKE_COLUMNS} from remakes where id = $1 and user_id = $2`, [id, g.session.user.id])).rows[0];
  if (!row) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(row);
}
