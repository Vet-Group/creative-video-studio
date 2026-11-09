// An image job's preview: a small JPEG stored as its own output asset and set as the job's poster, so tiles load it instead of the original.
import { randomUUID } from 'node:crypto';
import type { LedgerPool } from '@cvs/core/ledger';
import { insertAssets } from '@cvs/db/assets';
import type { Db } from '@cvs/db/client';
import { imagePreview } from './media';
import { deleteObject, getObject, putObject } from './storage';

/** Stores the preview of an image output for its owner; returns the new asset id. Nothing is left behind when it throws. */
export async function storePreview(db: Db, ownerId: string, jobId: string, bytes: Uint8Array): Promise<string> {
  const preview = await imagePreview(bytes);
  const id = randomUUID();
  const key = `assets/${id}`;
  await putObject(key, preview.data, 'image/jpeg');
  try {
    await insertAssets(db, [{ id, ownerId, kind: 'output', s3Key: key, filename: `preview-${jobId.slice(0, 8)}.jpg`, mime: 'image/jpeg', bytes: preview.data.length, width: preview.width, height: preview.height }]);
  } catch (e) {
    await deleteObject(key).catch(() => undefined);
    throw e;
  }
  return id;
}

/** Removes a preview no job took. */
export async function dropPreview(pool: LedgerPool, id: string): Promise<void> {
  await pool.query('delete from assets where id = $1', [id]);
  await deleteObject(`assets/${id}`);
}

/**
 * The one-off backfill for image jobs finished before previews: every live succeeded job whose output is an image and that has no poster. A dry run
 * only counts them; `apply` makes each preview and sets it as the poster, unless the job got one or was deleted meanwhile. Safe to run again.
 */
export async function backfillPreviews(pool: LedgerPool, db: Db, apply: boolean, log: (line: string) => void = console.log): Promise<{ found: number; made: number; failed: number }> {
  const { rows } = await pool.query(
    `select j.id, j.user_id, o.s3_key from jobs j join assets o on o.id = j.output_asset_id
      where j.status = 'succeeded' and j.poster_asset_id is null and j.deleted_at is null and j.purged_at is null and o.deleted_at is null and o.mime like 'image/%'
      order by j.created_at, j.id`,
  );
  let made = 0;
  let failed = 0;
  if (apply) {
    for (const r of rows) {
      try {
        const id = await storePreview(db, r.user_id, r.id, await getObject(r.s3_key));
        const set = await pool.query('update jobs set poster_asset_id = $2 where id = $1 and poster_asset_id is null and deleted_at is null and purged_at is null', [r.id, id]);
        if (set.rowCount) made++;
        else await dropPreview(pool, id);
      } catch (e) {
        failed++;
        log(`job ${r.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  log(`${rows.length} image jobs without a preview${apply ? `: made ${made}, failed ${failed}` : ' (dry run; pass --apply to make them)'}`);
  return { found: rows.length, made, failed };
}
