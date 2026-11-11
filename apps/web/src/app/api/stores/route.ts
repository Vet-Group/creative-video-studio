import { pool } from '@/lib/auth';
import { guard, isEditor } from '@/lib/session';

/**
 * The store picker: stores that are not closed (hidden), each with its brand kit, and `canEdit` when the caller may edit the kits (isEditor).
 * A store the caller pins or an Admin assigns to them is `mine` and comes first; the rest follow by how recently the caller used them
 * (`lastUsedAt`), then paused stores (with a Vietnamese "paused" mark after the name), then by name.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { rows } = await pool.query(
    `select s.id, s.name || case when s.paused then ' (tạm dừng)' else '' end as name, s.code, s.paused,
            s.brand_voice as "brandVoice", s.brand_colors as "brandColors", s.brand_tagline as "brandTagline",
            coalesce(us.pinned, false) as pinned, coalesce(us.assigned, false) as assigned,
            (coalesce(us.pinned, false) or coalesce(us.assigned, false)) as mine, us.last_used_at as "lastUsedAt"
       from stores s
       left join user_stores us on us.store_id = s.id and us.user_id = $1
      where not s.hidden
      order by coalesce(us.pinned, false) desc, coalesce(us.assigned, false) desc, us.last_used_at desc nulls last, s.paused, s.name, s.id`,
    [g.session.user.id],
  );
  return Response.json({ stores: rows, canEdit: isEditor(g.session.user) });
}
