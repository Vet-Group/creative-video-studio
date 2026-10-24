// The worker process: `pnpm --filter @cvs/worker start`. The mock provider always runs; fal and Replicate run when FAL_KEY and REPLICATE_API_TOKEN are set (M.6).
import { createPool, databaseUrl } from '@cvs/db/client';
import { createMockImageProvider, createMockProvider } from './mock-provider';
import { realProviders } from './real-providers';
import { ensureBucket } from './storage';
import { startWorker } from './worker';

const connectionString = databaseUrl();
const pool = createPool(connectionString);
if (process.env.NODE_ENV !== 'production') {
  await ensureBucket().catch((e) => console.warn('Could not prepare the MinIO bucket (is `pnpm services:up` running?):', e instanceof Error ? e.message : e));
}
const real = realProviders(pool);
const worker = await startWorker({
  pool,
  connectionString,
  providers: { mock: createMockProvider({ runMs: Number(process.env.CVS_MOCK_RUN_MS ?? 8_000) }), ...real.providers },
  imageProviders: { mock: createMockImageProvider({ runMs: Number(process.env.CVS_MOCK_RUN_MS ?? 8_000) }), ...real.imageProviders },
});
console.log(`worker ${worker.id} is running`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await worker.stop();
    await pool.end();
    process.exit(0);
  });
}
