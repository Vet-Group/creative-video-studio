// The daily purge (plan M.4): clips soft-deleted more than 30 days ago lose their objects and asset rows. The job row stays as a
// tombstone (purged_at), because the cost ledger points at it; ledger rows are never touched.
import { type LedgerPool, withTransaction } from '@cvs/core/ledger';

export const PURGE_AFTER = '30 days';

/** Purges every due clip, one transaction each; returns how many were purged. `removeObject` runs after the commit, so a failure there only leaves an orphan object (logged). */
export async function purgeDeletedClips(pool: LedgerPool, removeObject: (key: string) => Promise<void>, log: (what: string, e: unknown) => void): Promise<number> {
  const due = await pool.query(`select id from jobs where deleted_at < now() - $1::interval and purged_at is null order by deleted_at`, [PURGE_AFTER]);
  let purged = 0;
  for (const { id } of due.rows) {
    try {
      const keys = await withTransaction(pool, async (tx) => {
        const job = (await tx.query('select input_asset_ids, output_asset_id, poster_asset_id from jobs where id = $1 and purged_at is null for update', [id])).rows[0];
        if (!job) return [];
        const outputs = [job.output_asset_id, job.poster_asset_id].filter((a): a is string => !!a);
        // The job and the verdict reference the output assets, so both let go of them first.
        await tx.query('update jobs set purged_at = now(), output_asset_id = null, poster_asset_id = null where id = $1', [id]);
        await tx.query('delete from verdicts where output_asset_id = any($1::text[])', [outputs]);
        // An input stays while any other undeleted job (a Reuse, a retry, a failed Run) still names it.
        const { rows } = await tx.query(
          `delete from assets a where a.id = any($1::text[])
              or (a.id = any($2::text[]) and a.kind = 'input' and not exists (select 1 from jobs o where o.id <> $3 and o.deleted_at is null and a.id = any(o.input_asset_ids)))
            returning a.s3_key`,
          [outputs, job.input_asset_ids, id],
        );
        return rows.map((r) => r.s3_key as string);
      });
      purged++;
      for (const key of keys) await removeObject(key).catch((e) => log(`remove object ${key}`, e));
    } catch (e) {
      log(`purge job ${id}`, e);
    }
  }
  return purged;
}
