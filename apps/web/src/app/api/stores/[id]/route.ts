import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad, readBody } from '@/lib/admin';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { parseBrand } from '@/lib/brand';
import { guard } from '@/lib/session';

/**
 * Template editor (or Admin): change a store's brand kit, `brandVoice`, `brandColors` and `brandTagline` (lib/brand.ts; null or an empty text
 * clears one). A hidden store may be edited too, from the Admin stores page. A change is audited (`store.brand`) with the kit before and after.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'editor');
  if (g.error) return g.error;
  const { id } = await params;
  const parsed = parseBrand((await readBody(request)) ?? {});
  if (parsed.error) return bad(parsed.error);
  return withTransaction(pool, async (tx): Promise<Response> => {
    const old = (await tx.query(`select brand_voice as "brandVoice", brand_colors as "brandColors", brand_tagline as "brandTagline" from stores where id = $1 for update`, [id])).rows[0];
    if (!old) return bad('not found', 404);
    const next = { ...old, ...parsed.kit };
    if (JSON.stringify(next) !== JSON.stringify(old)) {
      await tx.query('update stores set brand_voice = $2, brand_colors = $3, brand_tagline = $4 where id = $1', [id, next.brandVoice, next.brandColors, next.brandTagline]);
      await audit(tx, { actorId: g.session.user.id, action: 'store.brand', target: `store:${id}`, oldValue: old, newValue: next });
    }
    return Response.json({ id, ...next });
  });
}
