// The daily purge (plan M.4): clips soft-deleted more than 30 days ago lose their objects and asset rows. The job row stays as a
// tombstone (purged_at), because the cost ledger points at it; ledger rows are never touched.
import { type LedgerPool, withTransaction } from '@cvs/core/ledger';

export const PURGE_AFTER = '30 days';

/** SQL for every input a job (alias `j`) ran from: its images, then Create video's end frame and reference audio, which its params name. */
const inputsOf = (j: string) =>
  `${j}.input_asset_ids || coalesce(string_to_array(${j}.params->>'endAssetId', ','), '{}') || coalesce(string_to_array(${j}.params->>'audioAssetIds', ','), '{}')`;

/** Purges every due clip, one transaction each; returns how many were purged. `removeObject` runs after the commit, so a failure there only leaves an orphan object (logged). */
export async function purgeDeletedClips(pool: LedgerPool, removeObject: (key: string) => Promise<void>, log: (what: string, e: unknown) => void): Promise<number> {
  const due = await pool.query(`select id from jobs where deleted_at < now() - $1::interval and purged_at is null order by deleted_at`, [PURGE_AFTER]);
  let purged = 0;
  for (const { id } of due.rows) {
    try {
      const keys = await withTransaction(pool, async (tx) => {
        const job = (await tx.query(`select ${inputsOf('j')} as inputs, j.output_asset_id, j.poster_asset_id from jobs j where j.id = $1 and j.purged_at is null for update`, [id])).rows[0];
        if (!job) return [];
        const outputs = [job.output_asset_id, job.poster_asset_id].filter((a): a is string => !!a);
        // The job and the verdict reference the output assets, so both let go of them first; the verdict itself survives (it still counts in the pass rate).
        await tx.query('update jobs set purged_at = now(), output_asset_id = null, poster_asset_id = null where id = $1', [id]);
        await tx.query('update verdicts set output_asset_id = null where job_id = $1', [id]);
        // An input stays while any other undeleted job (a Reuse, a retry, a failed Run) still names it.
        const { rows } = await tx.query(
          `delete from assets a where a.id = any($1::text[])
              or (a.id = any($2::text[]) and a.kind = 'input' and not exists (select 1 from jobs o where o.id <> $3 and o.deleted_at is null and a.id = any(${inputsOf('o')})))
            returning a.s3_key`,
          [outputs, job.inputs, id],
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
