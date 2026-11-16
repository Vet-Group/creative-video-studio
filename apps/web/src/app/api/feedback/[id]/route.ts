import { pool } from '@/lib/auth';
import { type FeedbackComment, FEEDBACK_MARK_READ, FEEDBACK_SELECT, toListed } from '@/lib/feedback';
import { guard } from '@/lib/session';

type RouteContext = { params: Promise<{ id: string }> };

/** One item with its comments (oldest first), each comment's author (and whether they are an Admin) and a `mine` flag. Opening it marks it read for the caller. */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const userId = g.session.user.id;
  const item = (await pool.query(`${FEEDBACK_SELECT} where f.id = $2`, [userId, id])).rows[0];
  if (!item) return Response.json({ error: 'not found' }, { status: 404 });
  await pool.query(FEEDBACK_MARK_READ, [id, userId]); // after the read, so `unread` still says what changed since the last visit
  const comments = (
    await pool.query(
      `select c.id, c.body, c.created_at, u.name as author_name, (u.role = 'admin') as author_admin, (c.user_id = $2) as mine
         from feedback_comments c join users u on u.id = c.user_id
        where c.feedback_id = $1 order by c.created_at, c.id`,
      [id, userId],
    )
  ).rows.map(
    (r): FeedbackComment => ({ id: r.id, authorName: r.author_name, authorAdmin: r.author_admin === true, body: r.body, mine: r.mine === true, createdAt: new Date(r.created_at).toISOString() }),
  );
  return Response.json({ item: toListed(item), comments });
}
