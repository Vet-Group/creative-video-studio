import { randomUUID } from 'node:crypto';
import { pool } from '@/lib/auth';
import { readJson } from '@/lib/assets';
import { MAX_PRODUCTS, PRODUCT_LIMIT, PRODUCT_NAME_TAKEN } from '@/lib/products';
import { guard } from '@/lib/session';
import { listProducts, productFields } from './fields';

/**
 * The caller's own products in the active workspace, newest first: `{ products }`, each with its photos (the live ones, in the saved order), its store's name
 * and its type (`?storeId=` keeps one store's). Private to the owner: no other member, not even an Admin, sees them (app/api/products/fields.ts).
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  return Response.json({ products: await listProducts(g.session.user.id, g.workspaceId, { storeId: new URL(request.url).searchParams.get('storeId') }) });
}

/**
 * Saves a product: `{ name, storeId?, productType?, assetIds }` (app/api/products/fields.ts productFields). 201 with the product as GET lists it; 400 for a bad
 * field or a photo that is not the caller's own live image here; 403 `store_not_in_team`; 409 `product_name_taken` for a name the caller already uses (compared
 * without case) and 409 `product_limit` at MAX_PRODUCTS products, counted across workspaces.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const b = await readJson(request);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return Response.json({ error: 'the body must be an object' }, { status: 400 });
  const f = await productFields(b as Record<string, unknown>, g.session.user, g.workspaceId);
  if ('error' in f) return Response.json({ error: f.error, ...(f.code && { code: f.code }) }, { status: f.status });
  const userId = g.session.user.id;
  const id = randomUUID();
  // One writer per member, so two adds cannot both take the last place (the shape of POST /api/choices).
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('products:' || $1))`, [userId]);
    if ((await client.query('select count(*)::int as n from products where user_id = $1', [userId])).rows[0].n >= MAX_PRODUCTS) {
      await client.query('rollback');
      return Response.json({ error: `you can keep at most ${MAX_PRODUCTS} products; delete one first`, code: PRODUCT_LIMIT }, { status: 409 });
    }
    await client.query('insert into products (id, user_id, workspace_id, name, store_id, product_type, asset_ids) values ($1, $2, $3, $4, $5, $6, $7)', [id, userId, g.workspaceId, f.name, f.storeId, f.productType, f.assetIds]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    if ((e as { code?: string }).code === '23505') return Response.json({ error: 'you already have a product with this name', code: PRODUCT_NAME_TAKEN }, { status: 409 });
    throw e;
  } finally {
    client.release();
  }
  return Response.json((await listProducts(userId, g.workspaceId, { id }))[0], { status: 201 });
}
