import { pool } from '@/lib/auth';
import { guard, isEditor } from '@/lib/session';

/** The store picker: stores that are not hidden, each with its brand kit, and `canEdit` when the caller may edit the kits (isEditor). */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { rows } = await pool.query(
    `select id, name, code, brand_voice as "brandVoice", brand_colors as "brandColors", brand_tagline as "brandTagline" from stores where not hidden order by name, id`,
  );
  return Response.json({ stores: rows, canEdit: isEditor(g.session.user) });
}
