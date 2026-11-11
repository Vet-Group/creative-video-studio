import { randomUUID } from 'node:crypto';
import { FEEDBACK_KINDS, FEEDBACK_STATUSES, type FeedbackKind, type FeedbackStatus } from '@cvs/db';
import { readJson } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { BODY_MAX, FEEDBACK_HOURLY_LIMIT, FEEDBACK_SELECT, MAX_IMAGES, TITLE_MAX, toListed } from '@/lib/feedback';
import { guard } from '@/lib/session';

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/**
 * The public board: every member sees all items. `?kind=` and `?status=` filter; `?sort=top` orders by most upvotes, else newest first.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const status = url.searchParams.get('status');
  if (kind !== null && !FEEDBACK_KINDS.includes(kind as FeedbackKind)) return bad(`kind must be one of ${FEEDBACK_KINDS.join(', ')} or left out`);
  if (status !== null && !FEEDBACK_STATUSES.includes(status as FeedbackStatus)) return bad(`status must be one of ${FEEDBACK_STATUSES.join(', ')} or left out`);
  const top = url.searchParams.get('sort') === 'top';
  const rows = await pool.query(
    `${FEEDBACK_SELECT}
      where ($2::text is null or f.kind = $2) and ($3::text is null or f.status = $3)
      order by ${top ? 'votes desc, f.created_at desc' : 'f.created_at desc'}, f.id
      limit 200`,
    [g.session.user.id, kind, status],
  );
  return Response.json({ items: rows.rows.map(toListed) });
}

/**
 * A member posts an item: `kind` (feedback, bug or feature), `title`, `body` and up to MAX_IMAGES `assetIds` (the member's own uploads from
 * POST /api/assets). The item starts at status `new`. A member may post at most FEEDBACK_HOURLY_LIMIT an hour, so the board cannot be flooded.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const b = (await readJson(request)) as Record<string, unknown> | null;
  const kind = b?.kind as FeedbackKind;
  if (!b || !FEEDBACK_KINDS.includes(kind)) return bad(`kind must be one of ${FEEDBACK_KINDS.join(', ')}`);
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const body = typeof b.body === 'string' ? b.body.trim() : '';
  if (title.length < 1 || title.length > TITLE_MAX) return bad(`title must be 1-${TITLE_MAX} characters`);
  if (body.length < 1 || body.length > BODY_MAX) return bad(`body must be 1-${BODY_MAX} characters`);
  const assetIds = Array.isArray(b.assetIds) ? b.assetIds.filter((x): x is string => typeof x === 'string') : [];
  if (assetIds.length > MAX_IMAGES) return bad(`at most ${MAX_IMAGES} images`);
  const userId = g.session.user.id;
  if (assetIds.length) {
    const own = (await pool.query('select count(*)::int as n from assets where id = any($1) and owner_id = $2 and deleted_at is null', [assetIds, userId])).rows[0].n;
    if (own !== assetIds.length) return bad('an attached image was not found');
  }
  const recent = (await pool.query(`select count(*)::int as n from feedback where user_id = $1 and created_at > now() - interval '1 hour'`, [userId])).rows[0].n;
  if (recent >= FEEDBACK_HOURLY_LIMIT) return bad('too many submissions in the last hour; try again later', 429);
  const id = randomUUID();
  await pool.query(
    `insert into feedback (id, user_id, team_id, kind, title, body, image_asset_ids)
       values ($1, $2, (select team_id from users where id = $2), $3, $4, $5, $6)`,
    [id, userId, kind, title, body, assetIds],
  );
  const row = (await pool.query(`${FEEDBACK_SELECT} where f.id = $2`, [userId, id])).rows[0];
  return Response.json(toListed(row), { status: 201 });
}
