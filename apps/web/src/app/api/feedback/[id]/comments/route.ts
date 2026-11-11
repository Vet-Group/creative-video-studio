import { randomUUID } from 'node:crypto';
import { readJson } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { COMMENT_MAX, type FeedbackComment } from '@/lib/feedback';
import { guard } from '@/lib/session';

type RouteContext = { params: Promise<{ id: string }> };
const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** A member adds a comment (`body`, 1-COMMENT_MAX characters) to an item. Returns the comment as the detail route lists it. */
export async function POST(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const b = (await readJson(request)) as Record<string, unknown> | null;
  const body = typeof b?.body === 'string' ? b.body.trim() : '';
  if (body.length < 1 || body.length > COMMENT_MAX) return bad(`body must be 1-${COMMENT_MAX} characters`);
  if (!(await pool.query('select 1 from feedback where id = $1', [id])).rowCount) return bad('not found', 404);
  const commentId = randomUUID();
  await pool.query('insert into feedback_comments (id, feedback_id, user_id, body) values ($1, $2, $3, $4)', [commentId, id, g.session.user.id, body]);
  const comment: FeedbackComment = { id: commentId, authorName: g.session.user.name, body, mine: true, createdAt: new Date().toISOString() };
  return Response.json(comment, { status: 201 });
}
