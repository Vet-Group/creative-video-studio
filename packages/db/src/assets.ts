// Asset queries shared by the web app and the worker (apps do not depend on drizzle-orm themselves).
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from './client';
import { assets } from './schema';

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

export async function insertAssets(db: Db, rows: NewAsset[]): Promise<void> {
  if (rows.length > 0) await db.insert(assets).values(rows); // every file of an upload can be one the caller already has
}

/** Plain SQL over a structural pg interface (a pool or a transaction's client), as @cvs/core/ledger does. */
interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}

/** SQL: a job `j` names asset `c`, as an input or in its params (end frame, reference audio or video), as the purge counts it. */
const NAMES = `(c.id = any(j.input_asset_ids) or strpos(j.params::text, c.id) > 0)`;

export type KeptInput = { id: string; filename: string; mime: string; bytes: number; durationMs: number | null };

/**
 * The owner's live input of each file hash (the newest copy): an upload or sample copy of a file they already have returns it instead of storing it again
 * (owner decision 2026-11-06). A kept input without a slot or store takes the ones given, as a new upload would have recorded them. A copy only deleted jobs
 * name is not returned: the purge removes it with them.
 */
export async function keptInputs(q: Queryable, ownerId: string, hashes: string[], slot: string | null, storeId: string | null = null): Promise<Map<string, KeptInput>> {
  if (hashes.length === 0) return new Map();
  const { rows } = await q.query(
    `update assets a set slot = coalesce(a.slot, $3), store_id = coalesce(a.store_id, $4)
       from (select distinct on (c.sha256) c.id from assets c where c.owner_id = $1 and c.kind = 'input' and c.deleted_at is null and c.sha256 = any($2)
               and not (exists (select 1 from jobs j where j.deleted_at is not null and ${NAMES}) and not exists (select 1 from jobs j where j.deleted_at is null and ${NAMES}))
             order by c.sha256, c.created_at desc, c.id) k
      where a.id = k.id
      returning a.id, a.filename, a.mime, a.bytes, a.duration_ms as "durationMs", a.sha256`,
    [ownerId, hashes, slot, storeId],
  );
  return new Map(rows.map(({ sha256, ...kept }) => [sha256 as string, kept as KeptInput]));
}

/**
 * Records the slot of each input of job `jobId` that has none yet, from the job's feature and the input's place, as migration 0077 did for earlier jobs:
 * Try On's model, garments and background, UGC Marketing Studio's model and product, Unboxing's photos by their roles, Advanced's references, Create video's image and end frame, Image Generation's images.
 */
export async function fillInputSlots(q: Queryable, jobId: string): Promise<void> {
  await q.query(
    `update assets a set slot = u.slot from (
       select i.id, case
         when j.feature = 'try_on' then case when i.n = 1 then 'model'
           when i.n <= 1 + case when j.params->>'garments' ~ '^[0-9]+$' then (j.params->>'garments')::int else cardinality(j.input_asset_ids) - 1 end then 'garment' else 'background' end
         when j.feature = 'marketing' and j.params->>'format' = 'advanced' then 'reference'
         when j.feature = 'marketing' and j.params->>'roles' is not null then nullif(split_part(j.params->>'roles', ',', i.n::int), '')
         when j.feature = 'marketing' then case i.n when 1 then 'model' when 2 then 'product' end
         when j.feature = 'video' then 'video'
         when j.feature = 'image' then 'image' end as slot
         from jobs j cross join lateral unnest(j.input_asset_ids) with ordinality as i(id, n) where j.id = $1
       union all select j.params->>'endAssetId', 'end-frame' from jobs j where j.id = $1 and j.params->>'endAssetId' is not null) u
      where a.id = u.id and a.kind = 'input' and a.slot is null and u.slot is not null`,
    [jobId],
  );
}

/** A live (not soft-deleted) asset, or undefined. */
export async function findAsset(db: Db, id: string): Promise<Asset | undefined> {
  const [row] = await db.select().from(assets).where(and(eq(assets.id, id), isNull(assets.deletedAt)));
  return row;
}
