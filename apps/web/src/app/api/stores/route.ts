import { pool } from '@/lib/auth';
import { guard, isEditor } from '@/lib/session';

/**
 * The store picker: stores that are not closed (hidden), each with its brand kit, and `canEdit` when the caller may edit the kits (isEditor).
 * Paused stores come after the open ones, with a Vietnamese "paused" mark after the name so every picker shows it.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { rows } = await pool.query(
    `select id, name || case when paused then ' (tạm dừng)' else '' end as name, code, paused,
            brand_voice as "brandVoice", brand_colors as "brandColors", brand_tagline as "brandTagline"
       from stores where not hidden order by paused, name, id`,
  );
  return Response.json({ stores: rows, canEdit: isEditor(g.session.user) });
}
