// The worker process: `pnpm --filter @cvs/worker start`. The mock provider always runs; fal and BytePlus run when FAL_KEY and BYTEPLUS_ARK_API_KEY are set (M.6).
import { readFalBalance } from '@cvs/core/providers/balances';
import { serviceAccountToken } from '@cvs/core/providers/vertex';
import { readVertexBilling } from '@cvs/core/providers/vertex-billing';
import { createPool, databaseUrl } from '@cvs/db/client';
import { DEDUPE_TICK_MS, dedupeTick } from './asset-dedupe';
import { FAL_ALERT_TICK_MS, falAlertTick, larkSender } from './fal-alert';
import { createMockImageProvider, createMockProvider } from './mock-provider';
import { realProviders } from './real-providers';
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
  // The e2e server sets CVS_FAKE_SUGGEST and removes FAL_KEY and OPENAI_API_KEY, so its suggestions never reach fal or OpenAI.
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

// Hash the inputs uploaded before uploads were hashed, and remove the copies of a file nothing uses (asset-dedupe.ts); unref'd like the Vertex tick.
const dedupe = () =>
  dedupeTick(pool)
    .then(({ hashed, removed }) => (hashed || removed) && console.log(`worker: dedupe: hashed ${hashed}, removed ${removed} duplicate uploads`))
    .catch((e) => console.error('worker: dedupe:', e instanceof Error ? e.message : e));
void dedupe();
setInterval(dedupe, DEDUPE_TICK_MS).unref();

// The hourly fal low-balance alert to the Admins on Lark (fal-alert.ts); only with a fal key and the Lark app, unref'd like the others.
if (process.env.FAL_KEY && process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) {
  const send = larkSender({ appId: process.env.LARK_APP_ID, appSecret: process.env.LARK_APP_SECRET });
  const alert = () =>
    falAlertTick(pool, () => readFalBalance({ key: process.env.FAL_KEY }), send)
      .then((r) => {
        if (r === 'cleared') console.log('worker: fal alert: the balance is back over the threshold');
        else if (r !== 'none') console.log(`worker: fal alert: sent to ${r.sent} Admins${r.failed.length ? `; failed: ${r.failed.join('; ')}` : ''}`);
      })
      .catch((e) => console.error('worker: fal alert:', e instanceof Error ? e.message : e));
  void alert();
  setInterval(alert, FAL_ALERT_TICK_MS).unref();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await worker.stop();
    await pool.end();
    process.exit(0);
  });
}
