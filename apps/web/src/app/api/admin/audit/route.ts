import { bad, pageParams } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/** Admin: the audit log, newest first, 50 entries a page (`?offset=`, `?limit=` up to 200), optionally only one `?action=` such as team.create. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const url = new URL(request.url);
  const page = pageParams(url, 50, 200);
  if (!page) return bad('offset must be 0 or more and limit between 1 and 200');
  const { rows } = await pool.query(
    `select a.id::int as id, a.actor_id as "actorId", u.name as "actorName", a.action, a.target, a.old_value as "oldValue", a.new_value as "newValue", a.created_at as "createdAt"
       from audit_entries a join users u on u.id = a.actor_id
      where ($1::text is null or a.action = $1) order by a.id desc offset $2 limit $3`,
    [url.searchParams.get('action'), page.offset, page.limit + 1],
  );
  return Response.json({ entries: rows.slice(0, page.limit), hasMore: rows.length > page.limit });
}
