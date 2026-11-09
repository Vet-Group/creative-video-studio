// One-off: previews for the image jobs finished before the worker made them (preview.ts). A dry run by default; `--apply` writes.
// node apps/worker/node_modules/tsx/dist/cli.mjs apps/worker/src/backfill-previews.ts [--apply]   (reads <repo>/.env like the worker)
import { createDb, createPool, databaseUrl } from '@cvs/db/client';
import { backfillPreviews } from './preview';

const pool = createPool(databaseUrl(), 2);
try {
  const { failed } = await backfillPreviews(pool, createDb(pool), process.argv.includes('--apply'));
  process.exitCode = failed ? 1 : 0;
} finally {
  await pool.end();
}
