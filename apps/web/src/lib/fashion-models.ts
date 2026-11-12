// The saved AI models (table fashion_models) as the API lists them; the routes are api/fashion-models.
import type { Queryable } from '@cvs/core/ledger';

export type FashionModelItem = { id: string; name: string; assetId: string; traits: unknown; shared: boolean; sharedLocked: boolean; mine: boolean; ownerName: string; createdAt: string };

/** A saved model's name: 1 to 60 characters (the table's check). */
export const MAX_NAME = 60;

/**
 * The live models the caller may see, newest first: their own and the shared ones (an Admin sees all); `id` narrows it to one. A model whose picture was
 * deleted is not listed.
 */
export async function visibleFashionModels(q: Queryable, user: { id: string; role?: string | null }, id?: string): Promise<FashionModelItem[]> {
  const { rows } = await q.query(
    `select f.id, f.name, f.asset_id, f.traits, f.shared, f.shared_locked, f.user_id = $1 as mine, u.name as owner_name, f.created_at
       from fashion_models f join users u on u.id = f.user_id join assets a on a.id = f.asset_id and a.deleted_at is null
      where f.deleted_at is null and ($2 or f.user_id = $1 or f.shared) and ($3::text is null or f.id = $3)
      order by f.created_at desc, f.id desc`,
    [user.id, user.role === 'admin', id ?? null],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, assetId: r.asset_id, traits: r.traits, shared: r.shared, sharedLocked: r.shared_locked, mine: r.mine, ownerName: r.owner_name, createdAt: r.created_at }));
}
