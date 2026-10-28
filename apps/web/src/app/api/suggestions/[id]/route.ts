import { SUGGEST_EXPIRY_SECONDS } from '@cvs/core/queue';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/** A suggestion run, to the member who asked: `queued`, `succeeded` with its options, or `failed`. One still queued after a minute turns `failed`. */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const { rows } = await pool.query(
    `update suggestion_runs set status = case when status = 'queued' and created_at <= now() - make_interval(secs => $3) then 'failed' else status end
      where id = $1 and user_id = $2 returning status, output`,
    [id, g.session.user.id, SUGGEST_EXPIRY_SECONDS],
  );
  if (!rows[0]) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json({ id, status: rows[0].status, options: rows[0].output ?? [] });
}
