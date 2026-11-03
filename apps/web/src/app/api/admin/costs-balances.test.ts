// Integration test of GET /api/admin/costs/balances against a disposable database on the compose Postgres (`pnpm services:up`). fal is a fake
// fetch, so no test reaches a provider.
import { randomBytes } from 'node:crypto';
import { bookShared } from '@cvs/core/ledger';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const balancesRoute = await import('./costs/balances/route');

const PASSWORD = 'correct-horse-battery';
const FAL_FIXTURE = 'fal-fixture-value'; // a made-up value, never a real key
let cookie: string;
beforeAll(async () => {
  await auth.api.createUser({ body: { email: 'admin@example.test', name: 'Admin', password: PASSWORD, role: 'admin' } });
  const res = await auth.api.signInEmail({ body: { email: 'admin@example.test', password: PASSWORD }, asResponse: true });
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FAL_KEY;
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

function fakeFal(answer: () => Response) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url);
    return answer();
  });
  return calls;
}

const get = async (as = cookie) => {
  const res = await balancesRoute.GET(new Request('http://localhost/api/admin/costs/balances', { headers: { cookie: as } }));
  return { status: res.status, body: (await res.json()) as any };
};

describe('GET /api/admin/costs/balances', () => {
  test('is for Admins only', async () => {
    expect((await get('')).status).toBe(401);
  });

  test('without FAL_KEY or a Replicate credit: readable answers, nothing red, and every billing page', async () => {
    const calls = fakeFal(() => Response.json({}));
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body).toEqual({
      warningUsd: 10,
      fal: { ok: false, reason: 'no_key', error: 'FAL_KEY is not set', billingUrl: 'https://fal.ai/dashboard/billing', low: false },
      replicate: { credit: null, billingUrl: 'https://replicate.com/account/billing', low: false },
      vertex: { billingUrl: 'https://console.cloud.google.com/billing' },
      byteplus: { billingUrl: 'https://console.byteplus.com/finance/overview' },
    });
    expect(calls).toEqual([]);
  });

  test('a fal error is shown, never cached and never carries the key', async () => {
    process.env.FAL_KEY = FAL_FIXTURE;
    const calls = fakeFal(() => Response.json({ detail: 'Invalid key' }, { status: 401 }));
    const { body } = await get();
    expect(body.fal).toMatchObject({ ok: false, reason: 'failed', error: 'fal billing: HTTP 401 {"detail":"Invalid key"}', low: false });
    expect(JSON.stringify(body)).not.toContain(FAL_FIXTURE);
    await get();
    expect(calls).toHaveLength(2);
  });

  test("fal's balance under the threshold is red and kept a minute; Replicate's remaining is its credit minus the ledger since it was entered", async () => {
    process.env.FAL_KEY = FAL_FIXTURE;
    const calls = fakeFal(() => Response.json({ username: 'vet', credits: { current_balance: 8.5, currency: 'USD' } }));
    await bookShared(pool, { kind: 'bakeoff', usd: '3', month: '2026-11', provider: 'replicate', ref: 'balances-before', note: 'before the credit' });
    await pool.query(`update settings set replicate_credit_usd = 20, replicate_credit_since = now() where id = 1`);
    await bookShared(pool, { kind: 'bakeoff', usd: '12.5', month: '2026-11', provider: 'replicate', ref: 'balances-after', note: 'after the credit' });
    const { body } = await get();
    expect(body.fal).toEqual({ ok: true, balance: 8.5, currency: 'USD', billingUrl: 'https://fal.ai/dashboard/billing', low: true });
    expect(body.replicate).toMatchObject({ credit: { creditUsd: '20.0000', spentUsd: '12.5000', remainingUsd: 7.5 }, low: true });
    await pool.query(`update settings set balance_warning_usd = 5 where id = 1`);
    const again = (await get()).body;
    expect([again.warningUsd, again.fal.low, again.replicate.low]).toEqual([5, false, false]);
    expect(calls).toHaveLength(1); // the second open used the cached fal balance
  });
});
