import { pool } from '@/lib/auth';
import { readJson, type RouteContext } from '@/lib/assets';
import { PRODUCT_NAME_TAKEN } from '@/lib/products';
import { guard } from '@/lib/session';
import { deleteProduct, listProducts, ownProduct, productFields } from '../fields';

const notFound = () => Response.json({ error: 'not found' }, { status: 404 });

/**
 * Changes one of the caller's own products (404 for any other, another workspace's too): the body holds the fields to change, as POST takes them (app/api/products/
 * fields.ts productFields); the photos may be reordered. A store or photo kept as it was is not checked again, so renaming a product whose store was hidden since works.
 * Answers with the product as GET lists it; 409 `product_name_taken` for a name the caller already uses.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const b = await readJson(request);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return Response.json({ error: 'the body must be an object' }, { status: 400 });
  const userId = g.session.user.id;
  const current = await ownProduct(userId, g.workspaceId, id);
  if (!current) return notFound();
  const f = await productFields(b as Record<string, unknown>, g.session.user, g.workspaceId, current);
  if ('error' in f) return Response.json({ error: f.error, ...(f.code && { code: f.code }) }, { status: f.status });
  try {
    await pool.query('update products set name = $3, store_id = $4, product_type = $5, asset_ids = $6 where id = $1 and user_id = $2 and workspace_id = $7', [id, userId, f.name, f.storeId, f.productType, f.assetIds, g.workspaceId]);
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return Response.json({ error: 'you already have a product with this name', code: PRODUCT_NAME_TAKEN }, { status: 409 });
    throw e;
  }
  return Response.json((await listProducts(userId, g.workspaceId, { id }))[0]);
}

/** Deletes one of the caller's own products (404 for any other). Its photos stay as uploads. */
export async function DELETE(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  return (await deleteProduct(g.session.user.id, g.workspaceId, id)) ? new Response(null, { status: 204 }) : notFound();
}
