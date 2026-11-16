// One-off: the detailed scene prompts (and their Vietnamese reading) for the analyses finished before the worker wrote them (analyze.ts). A dry run by
// default, printing the counts and estimated cost; `--apply` rewrites each result from its stored breakdown.json, and `--force` also redoes the ones done.
// node apps/worker/node_modules/tsx/dist/cli.mjs apps/worker/src/backfill-scene-prompts.ts [--apply] [--force]   (reads <repo>/.env like the worker)
import { createPool, databaseUrl } from '@cvs/db/client';
import { backfillScenePrompts } from './analyze';

const pool = createPool(databaseUrl(), 2);
try {
  const { failed } = await backfillScenePrompts(pool, { apply: process.argv.includes('--apply'), force: process.argv.includes('--force') });
  process.exitCode = failed ? 1 : 0;
} finally {
  await pool.end();
}
