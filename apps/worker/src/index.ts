// The worker process: `pnpm --filter @cvs/worker start`. The mock provider always runs; fal and BytePlus run when FAL_KEY and BYTEPLUS_ARK_API_KEY are set (M.6).
import { readFalBalances } from '@cvs/core/providers/balances';
import { serviceAccountToken } from '@cvs/core/providers/vertex';
import { readVertexBilling } from '@cvs/core/providers/vertex-billing';
import { createPool, databaseUrl } from '@cvs/db/client';
import { DEDUPE_TICK_MS, dedupeTick } from './asset-dedupe';
import { FAL_ALERT_TICK_MS, falAlertTick, larkSender } from './fal-alert';
import { falActive } from './fal-next';
import { createMockImageProvider, createMockProvider } from './mock-provider';
import { realProviders } from './real-providers';
import { fakeSuggester } from './suggest';
import { ensureBucket } from './storage';
import { VERTEX_TICK_MS, vertexTick, vertexTicker } from './vertex-accounts';
import { startWorker } from './worker';

const connectionString = databaseUrl();
const pool = createPool(connectionString);
if (process.env.NODE_ENV !== 'production') {
  await ensureBucket().catch((e) => console.warn('Could not prepare the MinIO bucket (is `pnpm services:up` running?):', e instanceof Error ? e.message : e));
}
// The CVS Lark app's bot, for the fal alerts to the Admins (fal-alert.ts, fal-next.ts); only when the app is configured.
const lark = process.env.LARK_APP_ID && process.env.LARK_APP_SECRET ? larkSender({ appId: process.env.LARK_APP_ID, appSecret: process.env.LARK_APP_SECRET }) : undefined;
// Set below with the Vertex guard, which needs the providers' accounts; a Vertex billing refusal runs it at once instead of waiting for the hour.
let vertexGuard: () => Promise<unknown> = async () => undefined;
const real = realProviders(pool, process.env, undefined, lark, () => vertexGuard());
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
  const accounts = real.vertexAccounts.map(({ project, key }) => {
    const token = serviceAccountToken(key);
    return { project, read: () => readVertexBilling({ project, token }) };
  });
  const ticker = vertexTicker(pool, accounts);
  vertexGuard = () => vertexTick(pool, accounts, new Date(), { book: false });
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

// The hourly fal low-balance alert on Lark (fal-alert.ts), to FAL_ALERT_LARK_TO or else the Admins; only with a fal key and the Lark app, unref'd like the others.
// With a second key it watches what both accounts can still spend (readFalBalances), as Admin Costs shows it.
if (process.env.FAL_KEY && lark) {
  const read = async () => readFalBalances({ key: process.env.FAL_KEY, nextKey: process.env.FAL_KEY_NEXT, switched: (await falActive(pool)) === 'team' });
  // FAL_ALERT_LARK_TO: comma-separated Lark emails or open_ids of the CVS app (the owner and the accountants who top up) that get the alert instead of the Admins.
  const to = (process.env.FAL_ALERT_LARK_TO ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const alert = () =>
    falAlertTick(pool, read, lark, to)
      .then((r) => {
        if (r === 'cleared') console.log('worker: fal alert: the balance is back over the threshold');
        else if (r !== 'none') console.log(`worker: fal alert: sent to ${r.sent} ${to.length ? 'listed people' : 'Admins'}${r.failed.length ? `; failed: ${r.failed.join('; ')}` : ''}`);
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
