// Integration test of GET /api/admin/costs/balances against a disposable database on the compose Postgres (`pnpm services:up`). fal is a fake
// fetch, so no test reaches a provider.
import { randomBytes } from 'node:crypto';
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

  test('without FAL_KEY: readable answers, nothing red, and every billing page', async () => {
    const calls = fakeFal(() => Response.json({}));
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body).toEqual({
      warningUsd: 10,
      fal: { ok: false, reason: 'no_key', error: 'FAL_KEY is not set', billingUrl: 'https://fal.ai/dashboard/billing', low: false },
      vertex: { billingUrl: 'https://console.cloud.google.com/billing' },
      byteplus: { billingUrl: 'https://console.byteplus.com/finance/overview', pack: expect.objectContaining({ totalTokens: 7_000_000 }) }, // seeded by migration 0076
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

  test("fal's balance under the threshold is red and kept a minute, and the answer no longer has a Replicate entry", async () => {
    process.env.FAL_KEY = FAL_FIXTURE;
    const calls = fakeFal(() => Response.json({ username: 'vet', credits: { current_balance: 8.5, currency: 'USD' } }));
    const { body } = await get();
    expect(body.fal).toEqual({ ok: true, balance: 8.5, currency: 'USD', billingUrl: 'https://fal.ai/dashboard/billing', low: true });
    expect(body).not.toHaveProperty('replicate');
    await pool.query(`update settings set balance_warning_usd = 5 where id = 1`);
    const again = (await get()).body;
    expect([again.warningUsd, again.fal.low]).toEqual([5, false]);
    expect(calls).toHaveLength(1); // the second open used the cached fal balance
  });
});

describe('the BytePlus Seedance 2.0 resource pack in GET /api/admin/costs/balances', () => {
  let n = 0;
  /** A job of `model` finished at `finishedAt` (ISO) with `tokens` billed (null when the provider did not say). */
  async function job(model: string, finishedAt: string, tokens: number | null, status = 'succeeded') {
    const id = `pack-job-${++n}`;
    await pool.query(`insert into users (id, email, name) values ('pack-u', 'pack-u@example.test', 'u') on conflict do nothing`);
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, provider_tokens, finished_at)
       values ($1, 'pack-u', 'team-unassigned', $2, 'byteplus', 'p', '9:16', 5, '{}', $3, $4, $5)`,
      [id, model, status, tokens, finishedAt],
    );
  }
  const pack = async () => (await get()).body.byteplus.pack;

  test('is the seed of migration 0076 until a job finishes after its as-of moment', async () => {
    const as = (await pool.query(`select byteplus_pack_as_of as t from settings where id = 1`)).rows[0].t as Date;
    expect(as.toISOString()).toBe('2026-11-06T02:50:00.000Z');
    expect(await pack()).toMatchObject({ totalTokens: 7_000_000, tokensLeft: 6_891_100, expiresAt: '2027-02-01T15:59:59.000Z' });
    expect((await pack()).usdLeft).toBeCloseTo(48.2377, 6);
  });

  test('subtracts only the pack model, only jobs that finished after the as-of moment, and only jobs the provider billed in tokens', async () => {
    await job('seedance-2.0-byteplus', '2026-11-06T02:50:01Z', 108_900);
    await job('seedance-2.0-byteplus', '2026-11-07T00:00:00Z', 244_800);
    await job('seedance-2.0-byteplus', '2026-11-06T02:49:59Z', 1_000_000); // before the as-of moment: already in the entered tokens
    await job('seedance-2.0-byteplus', '2026-11-07T01:00:00Z', null); // no token count: nothing to subtract
    await job('seedance-2.0-byteplus', '2026-11-07T01:00:00Z', null, 'failed'); // unbilled failure
    await job('seedance-2.0-fast-byteplus', '2026-11-07T00:00:00Z', 500_000); // pay-as-you-go row, not in the pack
    await job('seedance-1.0-pro-byteplus', '2026-11-07T00:00:00Z', 500_000);
    const p = await pack();
    expect(p.tokensLeft).toBe(6_891_100 - 108_900 - 244_800);
    expect(p.percentLeft).toBeCloseTo((6_537_400 / 7_000_000) * 100, 6);
    expect(p.low).toBe(false);
  });

  test('turns red under 20% of the tokens, and has no pack when none is entered', async () => {
    await job('seedance-2.0-byteplus', '2026-11-08T00:00:00Z', 5_200_000);
    expect(await pack()).toMatchObject({ tokensLeft: 1_337_400, low: true });
    await pool.query(`update settings set byteplus_pack_total_tokens = null, byteplus_pack_tokens = null, byteplus_pack_as_of = null, byteplus_pack_expires_at = null where id = 1`);
    expect((await get()).body.byteplus).toEqual({ billingUrl: 'https://console.byteplus.com/finance/overview', pack: null });
  });
});
