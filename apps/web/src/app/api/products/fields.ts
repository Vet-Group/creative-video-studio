// The product shelf's server half, kept beside its two route files (a module under app/ that is not a route is ignored by Next; lib/ holds the client-safe
// half, lib/products.ts): the one rule of who sees a product, the list SQL and the checks POST and PATCH share.
import { pool, type Session } from '@/lib/auth';
import { STORE_TEAM_CODE, storeAllowed } from '@/lib/billing';
import { isProductType } from '@/lib/product-types';
import { MAX_PRODUCT_NAME, MAX_PRODUCT_PHOTOS, MIN_PRODUCT_PHOTOS, type ProductItem } from '@/lib/products';

/** Who sees and changes a product: its owner, in the active workspace ($1 the caller, $2 the workspace). No Admin bypass and no sharing. */
const OWN = 'p.user_id = $1 and p.workspace_id = $2';

/** The select list of a listed product (`p`, its store `s`) with only the photos still live, in the saved order; every statement that reads products goes through the OWN predicate. */
const PRODUCT_SQL = `select p.id, p.name, p.store_id, s.name as store_name, p.product_type, p.asset_ids, p.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'filename', a.filename) order by o.n) from unnest(p.asset_ids) with ordinality as o(id, n)
               join assets a on a.id = o.id and a.deleted_at is null), '[]'::jsonb) as photos
  from products p left join stores s on s.id = p.store_id where ${OWN}`;

const listed = (r: Record<string, unknown>): ProductItem => ({
  id: r.id as string,
  name: r.name as string,
  storeId: (r.store_id as string | null) ?? null,
  storeName: (r.store_name as string | null) ?? null,
  productType: (r.product_type as string | null) ?? null,
  photos: r.photos as ProductItem['photos'],
  createdAt: (r.created_at as Date).toISOString(),
});

/** The caller's products in `workspaceId`, newest first; `storeId` keeps one store's, `id` one product. */
export async function listProducts(userId: string, workspaceId: string, { storeId, id }: { storeId?: string | null; id?: string } = {}): Promise<ProductItem[]> {
  const { rows } = await pool.query(`${PRODUCT_SQL} and ($3::text is null or p.store_id = $3) and ($4::text is null or p.id = $4) order by p.created_at desc, p.id`, [userId, workspaceId, storeId ?? null, id ?? null]);
  return rows.map(listed);
}

/** The stored row of one of the caller's products, for a PATCH to read its current fields; undefined for any other id. */
export async function ownProduct(userId: string, workspaceId: string, id: string): Promise<ProductFields | undefined> {
  const r = (await pool.query(`select p.name, p.store_id, p.product_type, p.asset_ids from products p where ${OWN} and p.id = $3`, [userId, workspaceId, id])).rows[0];
  return r && { name: r.name, storeId: r.store_id, productType: r.product_type, assetIds: r.asset_ids };
}

export const deleteProduct = async (userId: string, workspaceId: string, id: string): Promise<boolean> =>
  (await pool.query('delete from products p where p.id = $3 and p.user_id = $1 and p.workspace_id = $2', [userId, workspaceId, id])).rowCount === 1;

const CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u; // a newline or another control character does not belong in a name

/** The stored fields of a product that POST and PATCH set. */
export type ProductFields = { name: string; storeId: string | null; productType: string | null; assetIds: string[] };
export type ProductRefusal = { error: string; status: number; code?: string };

/**
 * Reads and checks the fields of a POST, or with `current` a PATCH's changes over the stored ones: `name` (NFC, trimmed, 1 to 60 characters on one line, so
 * look-alike spellings of one name are one name), `storeId` (a store of the workspace that is not hidden, or null; 403 `store_not_in_team` for a store of another
 * team than the caller's billing team), `productType` (a lib/product-types.ts key, or null) and `assetIds` (two to four distinct photos, each one of the
 * caller's own live images in this workspace; the order is kept). A store or photo kept as it was is not checked again. A refusal has its status.
 */
export async function productFields(b: Record<string, unknown>, user: Session['user'], workspaceId: string, current?: ProductFields): Promise<ProductFields | ProductRefusal> {
  const bad = (error: string, status = 400, code?: string): ProductRefusal => ({ error, status, ...(code && { code }) });
  const name = b.name === undefined && current ? current.name : typeof b.name === 'string' ? b.name.normalize('NFC').trim() : '';
  const length = [...name].length; // code points, as the database counts them
  if (CONTROL.test(name) || length < 1 || length > MAX_PRODUCT_NAME) return bad(`name must have 1 to ${MAX_PRODUCT_NAME} characters on one line`);
  if (b.storeId !== undefined && b.storeId !== null && typeof b.storeId !== 'string') return bad('storeId is a store id or null');
  const storeId = b.storeId === undefined ? (current?.storeId ?? null) : ((b.storeId as string | null) ?? null);
  if (storeId !== null && storeId !== current?.storeId) {
    const store = (await pool.query(`select ${storeAllowed('s', '$3')} as allowed from stores s where s.id = $1 and s.workspace_id = $2 and not s.hidden`, [storeId, workspaceId, user.id])).rows[0];
    if (!store) return bad('the store does not exist or is hidden');
    if (!store.allowed) return bad('a member of a billing team keeps products only for the stores of their team', 403, STORE_TEAM_CODE);
  }
  if (b.productType !== undefined && b.productType !== null && !isProductType(b.productType)) return bad('productType must be one of the product types or null');
  const productType = b.productType === undefined ? (current?.productType ?? null) : ((b.productType as string | null) ?? null);
  const ids = b.assetIds === undefined && current ? current.assetIds : b.assetIds;
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string') || new Set(ids).size !== ids.length || ids.length < MIN_PRODUCT_PHOTOS || ids.length > MAX_PRODUCT_PHOTOS) {
    return bad(`assetIds must be ${MIN_PRODUCT_PHOTOS} to ${MAX_PRODUCT_PHOTOS} different photo ids`);
  }
  const fresh = (ids as string[]).filter((i) => !current?.assetIds.includes(i));
  if (fresh.length > 0) {
    const own = await pool.query(`select count(*)::int as n from assets where id = any($1::text[]) and owner_id = $2 and workspace_id = $3 and kind = 'input' and deleted_at is null and mime like 'image/%'`, [fresh, user.id, workspaceId]);
    if (own.rows[0].n !== fresh.length) return bad('assetIds must be your own uploaded photos');
  }
  return { name, storeId, productType, assetIds: ids as string[] };
}
