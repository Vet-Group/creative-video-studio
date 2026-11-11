import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

type RouteContext = { params: Promise<{ id: string }> };

/** Toggles the caller's upvote on an item and returns the new state and the item's vote count. */
export async function PUT(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const userId = g.session.user.id;
  if (!(await pool.query('select 1 from feedback where id = $1', [id])).rowCount) return Response.json({ error: 'not found' }, { status: 404 });
  const had = (await pool.query('delete from feedback_votes where feedback_id = $1 and user_id = $2', [id, userId])).rowCount;
  if (!had) await pool.query('insert into feedback_votes (feedback_id, user_id) values ($1, $2) on conflict do nothing', [id, userId]);
  const votes = (await pool.query('select count(*)::int as n from feedback_votes where feedback_id = $1', [id])).rows[0].n;
  return Response.json({ voted: !had, votes });
}
