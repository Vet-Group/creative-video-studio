// Integration test of GET /api/admin/costs/vertex against a disposable database on the compose Postgres (`pnpm services:up`). Google is a fake
// fetch (token, BigQuery, Cloud Billing Catalog) and the keys are throwaway RSA keys, so no test reaches Google.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const vertexRoute = await import('./costs/vertex/route');

const PASSWORD = 'correct-horse-battery';
const dir = mkdtempSync(join(tmpdir(), 'cvs-vertex-costs-'));
const keyFile = (project: string) => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const file = join(dir, `${project}.json`);
  writeFileSync(file, JSON.stringify({ client_email: `sa@${project}.iam.gserviceaccount.com`, private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), project_id: project }));
  return file;
};
const KEY1 = keyFile('cvs-vertex');
const KEY2 = keyFile('creative-video-studio');

let cookie: string;
beforeAll(async () => {
  await auth.api.createUser({ body: { email: 'admin@example.test', name: 'Admin', password: PASSWORD, role: 'admin' } });
  const res = await auth.api.signInEmail({ body: { email: 'admin@example.test', password: PASSWORD }, asResponse: true });
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  await pool.query(`update settings set vertex_active_project = 'cvs-vertex' where id = 1`);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS_NEXT;
  delete process.env.GOOGLE_CLOUD_PROJECT;
});

afterAll(async () => {
  rmSync(dir, { recursive: true });
  await pool.end();
  await testDb.drop();
});

const FIELDS = ['credits_all_time', 'credits_all_time_usd', 'currency', 'rate', 'month', 'sku_id', 'sku', 'usage', 'unit', 'cost', 'cost_usd', 'credits', 'credits_usd'];
const row = (...v: (string | null)[]) => ({ f: v.map((x) => ({ v: x })) });
const sku = (skuId: string, units: string, nanos: number) => ({ skuId, pricingInfo: [{ pricingExpression: { tieredRates: [{ unitPrice: { units, nanos } }] } }] });

/** Google as the route sees it: account 1 has an export with two months, account 2 is refused (403); the Catalog answers `catalog` or fails. */
function fakeGoogle(catalog: unknown[] | 'fail') {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url);
    if (url.startsWith('https://oauth2.googleapis.com/')) return Response.json({ access_token: 'tok', expires_in: 3600 });
    if (url.includes('/projects/creative-video-studio/')) return Response.json({ error: { message: 'Access Denied' } }, { status: 403 });
    if (url.endsWith('/datasets/billing_export/tables?maxResults=1000')) return Response.json({ tables: [{ tableReference: { tableId: 'gcp_billing_export_v1_01F104_C9738B_959059' } }] });
    if (url.endsWith('/queries')) {
      return Response.json({
        jobComplete: true, schema: { fields: FIELDS.map((name) => ({ name })) },
        rows: [
          row('-1968600', '-75.6', 'VND', '26050', '202610', '4D50-275D-FC3F', 'Veo silent', '13', 'count', '71830', '2.7574', '-71830', '-2.7574'),
          row('-1968600', '-75.6', 'VND', '26050', '202611', '4D50-275D-FC3F', 'Veo silent', '8', 'count', '41680', '1.6', '-41680', '-1.6'),
          row('-1968600', '-75.6', 'VND', '26050', '202611', 'F64B-2A78-7BAE', 'Veo audio', '8', 'count', '86389', '3.3161', '-86389', '-3.3161'),
        ],
      });
    }
    if (url.startsWith('https://cloudbilling.googleapis.com/')) return catalog === 'fail' ? Response.json({}, { status: 500 }) : Response.json({ skus: catalog });
    return Response.json({}, { status: 500 });
  });
  return calls;
}

const get = async (month: string) => {
  const res = await vertexRoute.GET(new Request(`http://localhost/api/admin/costs/vertex?month=${month}`, { headers: { cookie } }));
  return { status: res.status, body: (await res.json()) as any };
};

describe('GET /api/admin/costs/vertex', () => {
  test('without a Vertex key answers configured: false, and refuses a malformed month', async () => {
    expect((await get('2026-11')).body).toEqual({ configured: false });
    expect((await get('2026-13')).status).toBe(400);
  });

  test("shows each account's month by SKU in USD, its credits and errors, the active one, and the price check; then serves the cache", async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = KEY1;
    process.env.GOOGLE_APPLICATION_CREDENTIALS_NEXT = KEY2;
    const calls = fakeGoogle([sku('4D50-275D-FC3F', '0', 200_000_000), sku('F64B-2A78-7BAE', '0', 400_000_000)]);
    const { status, body } = await get('2026-11');
    expect(status).toBe(200);
    expect(body).toMatchObject({ configured: true, month: '2026-11', totalMonthUsd: 4.9161 });
    const [one, two] = body.accounts;
    expect(one).toMatchObject({ projectId: 'cvs-vertex', active: true, monthUsd: 4.9161, monthCreditsUsd: -4.9161 });
    expect(one.error).toBeUndefined();
    expect(one.skus.map((s: { skuId: string; costUsd: number }) => [s.skuId, s.costUsd])).toEqual([['4D50-275D-FC3F', 1.6], ['F64B-2A78-7BAE', 3.3161]]);
    expect(one.credit).toEqual({
      total: 7825800, currency: 'VND', used: 1968600, remaining: 5857200, remainingUsd: 5857200 / 26050, expiresOn: '2026-12-30', stopWhenCreditsEnd: true, unverified: false,
    });
    expect(two).toMatchObject({ projectId: 'creative-video-studio', active: false, error: { reason: 'no_access' }, monthUsd: 0, skus: [], credit: { total: null, unverified: true } });
    expect(body.prices).toEqual([
      { label: 'Veo 3.1 (Vertex), không tiếng', appUsd: 0.2, googleUsd: 0.2, red: false },
      { label: 'Veo 3.1 (Vertex), có tiếng', appUsd: 0.4, googleUsd: 0.4, red: false },
    ]);
    // An answer with a refused account is not kept: the next open asks Google again.
    const n = calls.length;
    expect((await get('2026-11')).body).toEqual(body);
    expect(calls.length).toBeGreaterThan(n);
  });

  test('keeps a full answer 5 minutes, never one whose Catalog read failed, and empties the cache past 24 months', async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = KEY1;
    const calls = fakeGoogle('fail');
    await get('2025-01');
    let n = calls.length;
    await get('2025-01');
    expect(calls.length).toBeGreaterThan(n); // the failed Catalog read was not cached
    fakeGoogle([sku('4D50-275D-FC3F', '0', 200_000_000), sku('F64B-2A78-7BAE', '0', 400_000_000)]);
    const months = Array.from({ length: 24 }, (_, i) => `${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
    for (const m of months) await get(m);
    const full = fakeGoogle([sku('4D50-275D-FC3F', '0', 200_000_000), sku('F64B-2A78-7BAE', '0', 400_000_000)]);
    await get(months[0]!);
    expect(full).toHaveLength(0); // cached
    await get('2025-02'); // the 25th month empties the cache first
    n = full.length;
    await get(months[0]!);
    expect(full.length).toBeGreaterThan(n);
  });

  test('a key file that cannot be read is a readable answer, not a 500', async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = join(dir, 'missing.json');
    const { status, body } = await get('2026-11');
    expect(status).toBe(200);
    expect(body).toEqual({ configured: false, error: expect.stringMatching(/ENOENT|no such file/) });
  });

  test('marks a price off by more than 1% red, and leaves the Google price empty when the Catalog does not list it or fails', async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = KEY1;
    fakeGoogle([sku('4D50-275D-FC3F', '0', 201_000_000), sku('F64B-2A78-7BAE', '0', 450_000_000)]);
    const off = (await get('2026-10')).body;
    expect(off).toMatchObject({ totalMonthUsd: 2.7574 });
    expect(off.prices.map((p: { red: boolean }) => p.red)).toEqual([false, true]);
    fakeGoogle([]);
    expect((await get('2026-09')).body.prices.map((p: { googleUsd: number | null; red: boolean }) => [p.googleUsd, p.red])).toEqual([[null, false], [null, false]]);
  });
});
