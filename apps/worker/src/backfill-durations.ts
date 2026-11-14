// One-off: the real length of the video outputs finished before the worker recorded it (durations.ts). A dry run by default; `--apply` sets assets.duration_ms, and
// `--apply-cost` (with it) books the Motion Control cost differences as manual_adjustment rows.
// node apps/worker/node_modules/tsx/dist/cli.mjs apps/worker/src/backfill-durations.ts [--apply [--apply-cost]]   (reads <repo>/.env like the worker)
import { createPool, databaseUrl } from '@cvs/db/client';
import { backfillDurations } from './durations';

const apply = process.argv.includes('--apply');
const pool = createPool(databaseUrl(), 2);
try {
  const { failed } = await backfillDurations(pool, { apply, applyCost: apply && process.argv.includes('--apply-cost') });
  process.exitCode = failed ? 1 : 0;
} finally {
  await pool.end();
}
