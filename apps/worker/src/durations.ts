// The real length of a finished clip (assets.duration_ms) and what Motion Control bills for it.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bookShared, type LedgerPool } from '@cvs/core/ledger';
import { probeSeconds } from './media';
import { downloadObject } from './storage';

/**
 * What a Motion Control clip that plays less than the job asked should have cost. fal prices it per second of the clip that came back (pricing.md: "priced per output", unit seconds),
 * so it is the recorded cost scaled to the seconds it plays, rounded up. The worker books the estimate for such a clip (settle() never books less), which the backfill corrects.
 */
export function shorterClipCost(costUsd: number, requestedSec: number, seconds: number): number {
  return requestedSec > 0 && seconds > 0 && Math.ceil(seconds) < requestedSec ? (costUsd * Math.ceil(seconds)) / requestedSec : costUsd;
}

export type DurationRow = { id: string; feature: string; duration_s: number; duration_ms: number | null; cost_usd: string };
export type DurationPlan = { durationMs: number | null; correctedUsd: string | null };

/** What the backfill would change for a clip that plays `seconds`: its asset's length when unset, and for Motion Control the cost its real length is billed at, when that differs. */
export function planDuration(row: DurationRow, seconds: number): DurationPlan {
  const corrected = row.feature === 'motion_control' ? shorterClipCost(Number(row.cost_usd), row.duration_s, seconds).toFixed(4) : row.cost_usd;
  return { durationMs: row.duration_ms === null && seconds > 0 ? Math.round(seconds * 1000) : null, correctedUsd: corrected === row.cost_usd ? null : corrected };
}

const costRef = (jobId: string) => `motion-output-seconds:${jobId}`;

/**
 * The one-off backfill for video outputs made before the worker recorded their length: every live succeeded job whose output video has no duration_ms, and every Motion Control
 * job not yet corrected. A dry run prints `job | feature | duration_s | real seconds | recorded cost | corrected cost` and writes nothing. `apply` sets duration_ms (only where it is
 * still null); `applyCost` also books each Motion Control difference as a manual_adjustment (one per job, by its ref; the job's own rows are never touched). Safe to run again.
 */
export async function backfillDurations(
  pool: LedgerPool,
  o: { apply: boolean; applyCost: boolean },
  log: (line: string) => void = console.log,
): Promise<{ found: number; set: number; adjusted: number; failed: number }> {
  const { rows } = await pool.query(
    `select j.id, j.feature, j.duration_s, j.provider, j.model, to_char(j.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as month,
            o.id as asset_id, o.s3_key, o.duration_ms, coalesce(c.usd, 0)::text as cost_usd
       from jobs j join assets o on o.id = j.output_asset_id left join job_costs c on c.job_id = j.id
      where j.status = 'succeeded' and j.deleted_at is null and j.purged_at is null and o.deleted_at is null and o.mime like 'video/%'
        and (o.duration_ms is null or (j.feature = 'motion_control' and not exists (select 1 from cost_entries e where e.ref = 'motion-output-seconds:' || j.id)))
      order by j.created_at, j.id`,
  );
  let set = 0;
  let adjusted = 0;
  let failed = 0;
  const dir = await mkdtemp(join(tmpdir(), 'cvs-durations-'));
  try {
    for (const r of rows) {
      try {
        let seconds = r.duration_ms === null ? 0 : r.duration_ms / 1000;
        if (r.duration_ms === null) {
          const file = join(dir, 'clip.mp4');
          await downloadObject(r.s3_key, file);
          seconds = await probeSeconds(file);
        }
        const plan = planDuration(r, seconds);
        log(`${r.id} | ${r.feature} | ${r.duration_s} | ${seconds.toFixed(2)} | ${r.cost_usd} | ${plan.correctedUsd ?? '-'}`);
        if (o.apply && plan.durationMs !== null && (await pool.query('update assets set duration_ms = $2 where id = $1 and duration_ms is null', [r.asset_id, plan.durationMs])).rowCount) set++;
        if (o.applyCost && plan.correctedUsd !== null) {
          const usd = (Number(plan.correctedUsd) - Number(r.cost_usd)).toFixed(4);
          const note = `Motion Control job ${r.id.slice(0, 8)} plays ${seconds.toFixed(1)} s, not the ${r.duration_s} s it was recorded for`;
          if (await bookShared(pool, { kind: 'manual_adjustment', usd, month: r.month, provider: r.provider, model: r.model, ref: costRef(r.id), note })) adjusted++;
        }
      } catch (e) {
        failed++;
        log(`job ${r.id}: ${e instanceof Error ? e.message : e}`);
      }
      await rm(join(dir, 'clip.mp4'), { force: true });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  log(`${rows.length} video clips to check${o.apply ? `: set ${set} lengths, booked ${adjusted} cost adjustments, ${failed} failed` : ' (dry run; pass --apply to set the lengths, plus --apply-cost to book the Motion Control cost differences)'}`);
  return { found: rows.length, set, adjusted, failed };
}
