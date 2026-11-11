import { withTransaction } from '@cvs/core/ledger';
import { bad } from '@/lib/admin';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/**
 * Pin or unpin a store for the caller: a pinned store is one of "theirs" and comes first in every store picker. Toggles `user_stores.pinned`,
 * creating the row on the first pin and dropping it again once it carries no flag and no last-used time, so the table stays to the point.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const userId = g.session.user.id;
  return withTransaction(pool, async (tx): Promise<Response> => {
    const store = (await tx.query('select 1 from stores where id = $1 and not hidden', [id])).rows[0];
    if (!store) return bad('not found', 404);
    const row = (
      await tx.query(
        `insert into user_stores (user_id, store_id, pinned) values ($1, $2, true)
           on conflict (user_id, store_id) do update set pinned = not user_stores.pinned
         returning pinned, assigned, last_used_at as "lastUsedAt"`,
        [userId, id],
      )
    ).rows[0];
    if (!row.pinned && !row.assigned && !row.lastUsedAt) await tx.query('delete from user_stores where user_id = $1 and store_id = $2', [userId, id]);
    return Response.json({ pinned: row.pinned });
  });
}
