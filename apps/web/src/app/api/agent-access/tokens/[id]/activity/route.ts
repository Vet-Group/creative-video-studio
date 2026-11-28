import { bad } from '@/lib/admin';
import { activityItem } from '@/lib/agent-activity';
import { tokenAdmin } from '@/lib/agent-access';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';

const MAX = 50;

/**
 * Connection `id`'s own audit rows (target api_token:<id>, action agent.*), newest first: `limit` (1-50, 20 when left out) rows before the row id
 * `before`, each as a short line (lib/agent-activity.ts). `next` is the cursor of the next page, or null on the last. Any Admin's connection; cookie only.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await tokenAdmin(request);
  if (g.error) return g.error;
  const { id } = await params;
  const q = new URL(request.url).searchParams;
  const limit = q.has('limit') ? Number(q.get('limit')) : 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX) return bad(`limit must be 1 to ${MAX}`);
  const before = q.get('before');
  if (before !== null && !/^[1-9][0-9]{0,17}$/.test(before)) return bad('bad cursor');
  const token = (await pool.query('select kind from api_tokens where id = $1', [id])).rows[0];
  if (!token) return bad('not found', 404);
  const { rows } = await pool.query(
    `select id, action, new_value, created_at from audit_entries
      where target = $1 and action like 'agent.%' and ($2::bigint is null or id < $2::bigint)
      order by id desc limit $3`,
    [`api_token:${id}`, before, limit + 1],
  );
  const page = rows.slice(0, limit);
  return Response.json(
    { items: page.map((r) => activityItem(r, token.kind === 'oauth')), next: rows.length > limit ? String(page.at(-1)!.id) : null },
    { headers: { 'cache-control': 'no-store' } },
  );
}
