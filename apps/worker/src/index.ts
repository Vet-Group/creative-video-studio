// The worker process: `pnpm --filter @cvs/worker start`. The mock provider always runs; fal and Replicate run when FAL_KEY and REPLICATE_API_TOKEN are set (M.6).
import { serviceAccountToken } from '@cvs/core/providers/vertex';
import { readVertexBilling } from '@cvs/core/providers/vertex-billing';
import { createPool, databaseUrl } from '@cvs/db/client';
import { createMockImageProvider, createMockProvider } from './mock-provider';
import { realProviders } from './real-providers';
import { replicateGuard } from './replicate-guard';
import { fakeSuggester } from './suggest';
import { ensureBucket } from './storage';
import { VERTEX_TICK_MS, vertexTicker } from './vertex-accounts';
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
  enhance: real.enhance,
  // The e2e server sets CVS_FAKE_SUGGEST and removes FAL_KEY, so its suggestions never reach fal.
  suggest: real.suggest ?? (process.env.CVS_FAKE_SUGGEST === '1' ? fakeSuggester : undefined),
});
console.log(`worker ${worker.id} is running`);

// The hourly Vertex credits guard and the daily invoice booking (docs/ops/vertex-accounts.md); unref'd so it never keeps the process alive.
if (real.vertexAccounts.length) {
  const ticker = vertexTicker(
    pool,
    real.vertexAccounts.map(({ project, key }) => {
      const token = serviceAccountToken(key);
      return { project, read: () => readVertexBilling({ project, token }) };
    }),
  );
  const tick = () => ticker().catch((e) => console.error('worker: vertex tick:', e instanceof Error ? e.message : e));
  void tick();
  setInterval(tick, VERTEX_TICK_MS).unref();
}

// The hourly Replicate guard (docs/ops/provider-balances.md): under 2 USD of Replicate credit its models go off and their fal twins on.
const replicateTick = () =>
  replicateGuard(pool, Boolean(process.env.FAL_KEY)).then(
    (off) => off.length && console.log(`worker: replicate credit is low; turned off ${off.join(', ')}`),
    (e) => console.error('worker: replicate guard:', e instanceof Error ? e.message : e),
  );
void replicateTick();
setInterval(replicateTick, VERTEX_TICK_MS).unref();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await worker.stop();
    await pool.end();
    process.exit(0);
  });
}
