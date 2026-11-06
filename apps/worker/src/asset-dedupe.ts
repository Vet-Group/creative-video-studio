// Duplicate uploads (owner decision 2026-11-06: the uploaded-photos picker shows each photo once, and copies nothing uses are removed). An upload hashes its bytes at once
// (assets.sha256); this sweep hashes the inputs uploaded before that, then soft-deletes every extra copy of the same file of one owner that no job, template
// or choice refers to, keeping the newest. A copy something refers to stays (the picker shows its file once anyway). The purge's usual rules then apply.
import { createHash } from 'node:crypto';
import type { LedgerPool as Pool } from '@cvs/core/ledger';
import { getObject } from './storage';

/** How often the sweep runs, and how many old inputs one run hashes. */
export const DEDUPE_TICK_MS = 10 * 60_000;
const HASH_BATCH = 100;
/** Marks an input whose object could not be read, so the sweep does not retry it forever; it never matches a real hash. */
export const UNREADABLE = 'unreadable';

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Hashes up to HASH_BATCH live inputs that have no hash yet, newest first; returns how many it hashed. */
export async function hashInputs(pool: Pool, read: (key: string) => Promise<Uint8Array> = getObject): Promise<number> {
  const { rows } = await pool.query(
    `select id, s3_key from assets where kind = 'input' and sha256 is null and deleted_at is null order by created_at desc, id limit $1`,
    [HASH_BATCH],
  );
  for (const r of rows as { id: string; s3_key: string }[]) {
    const hash = await read(r.s3_key).then(sha256, () => UNREADABLE);
    await pool.query(`update assets set sha256 = $2 where id = $1 and sha256 is null`, [r.id, hash]);
  }
  return rows.length;
}

/** SQL: a job (alias `j`) names asset `a`, as an input or in its params (end frame, reference audio or video). */
const names = (j: string) => `(a.id = any(${j}.input_asset_ids) or strpos(${j}.params::text, a.id) > 0)`;

/**
 * Soft-deletes the extra copies of a file (same owner and hash) that nothing refers to, keeping the newest copy the purge will not take (one that only
 * deleted jobs name goes with them), so the file stays in the uploaded-photos picker; returns the ids it deleted.
 */
export async function removeDuplicateInputs(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query(
    `with copies as (
       select a.id, row_number() over (partition by a.owner_id, a.sha256 order by
           exists (select 1 from jobs j where j.deleted_at is not null and ${names('j')}) and not exists (select 1 from jobs j where j.deleted_at is null and ${names('j')}),
           a.created_at desc, a.id) as n
         from assets a where a.kind = 'input' and a.deleted_at is null and a.sha256 ~ '^[0-9a-f]{64}$')
     update assets a set deleted_at = now()
       from copies c
      where a.id = c.id and c.n > 1
        and not exists (select 1 from jobs j where ${names('j')})
        and not exists (select 1 from user_templates t where strpos(t.data::text, a.id) > 0)
        and not exists (select 1 from user_choices u where u.image_asset_id = a.id)
     returning a.id`,
  );
  return rows.map((r: { id: string }) => r.id);
}

/** One sweep: hash a batch, then remove the copies found so far. */
export async function dedupeTick(pool: Pool, read?: (key: string) => Promise<Uint8Array>): Promise<{ hashed: number; removed: number }> {
  const hashed = await hashInputs(pool, read);
  const removed = (await removeDuplicateInputs(pool)).length;
  return { hashed, removed };
}
