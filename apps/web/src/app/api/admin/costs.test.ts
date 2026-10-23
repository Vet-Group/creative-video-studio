// Integration test of the Admin cost APIs (Costs page, both CSVs, VND rates, invoices, manual adjustments) against a disposable database
// on the compose Postgres (`pnpm services:up`). The September 2026 fixture covers every ledger entry kind, a team change, a store
// reassignment and invoice differences, and the expected totals below are computed by hand, not read back from the code under test.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { bookShared, lateBill, reassignStore, reserve, settle } = await import('@cvs/core/ledger');
const { checkCaps } = await import('@cvs/core/limits');
const costsRoute = await import('./costs/route');
const detailRoute = await import('./costs/detail/route');
const summaryRoute = await import('./costs/summary/route');
const adjustRoute = await import('./costs/adjustments/route');
const rateRoute = await import('./rates/[month]/route');
const invoicesRoute = await import('./invoices/route');
const modelsRoute = await import('../models/route');

const PASSWORD = 'correct-horse-battery';
const M = '2026-09';

async function newUser(email: string, role: 'member' | 'admin') {
  const id = (await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}

const call = (cookie: string | undefined, path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' }, ...(body === undefined || method === 'GET' ? {} : { body: JSON.stringify(body) }) });

const audits = async (target: string) => (await pool.query('select actor_id, action, old_value, new_value from audit_entries where target = $1 order by id', [target])).rows;
const auditCount = async () => (await pool.query('select count(*)::int as n from audit_entries')).rows[0].n as number;
const ledgerCount = async () => (await pool.query('select count(*)::int as n from cost_entries')).rows[0].n as number;

interface Money { usd: string; usdDisplay: string; vnd: string | null }
interface Figures extends Money {
  id: string;
  name?: string;
  code?: string | null;
  failedByVerdict: Money;
  failedByStatus: Money;
  acceptedClips: number;
  costPerAcceptedUsd: string | null;
  costPerAcceptedVnd: string | null;
}
interface Invoice { provider: string; totalUsd: string; ledgerUsd: string; diffUsd: string; red: boolean; utcMonthUsd: string }
interface Page {
  month: string;
  asOf: number;
  provisional: boolean;
  rateVndPerUsd: string | null;
  total: Money;
  shared: Money & { rows: number; byKind: Record<string, string> };
  byUser: Figures[];
  byTeam: Figures[];
  byStore: Figures[];
  capUsage: { usd: string; monthlyCapUsd: string };
  invoices: Invoice[];
}

let admin: Awaited<ReturnType<typeof newUser>>;
let member: Awaited<ReturnType<typeof newUser>>;
const ctxMonth = (month: string) => ({ params: Promise.resolve({ month }) });
const page = async (month = M) => {
  const res = await costsRoute.GET(call(admin.cookie, `/api/admin/costs?month=${month}`));
  expect(res.status).toBe(200);
  return (await res.json()) as Page;
};
const putRate = (month: string, body: unknown, cookie = admin.cookie) => rateRoute.PUT(call(cookie, `/api/admin/rates/${month}`, 'PUT', body), ctxMonth(month));
const putInvoice = (body: unknown, cookie = admin.cookie) => invoicesRoute.PUT(call(cookie, '/api/admin/invoices', 'PUT', body));
const postAdjustment = (body: unknown, cookie = admin.cookie) => adjustRoute.POST(call(cookie, '/api/admin/costs/adjustments', 'POST', body));

/** A CSV download as text with the byte order mark checked and removed, and as cells. */
async function csv(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = new TextDecoder().decode(bytes.slice(3));
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') cell += c;
  }
  return { disposition: res.headers.get('content-disposition'), label: rows[0]![0]!, header: rows[1]!, rows: rows.slice(2) };
}
const detail = async (month = M) => csv(await detailRoute.GET(call(admin.cookie, `/api/admin/costs/detail?month=${month}`)));
const summary = async (month = M) => csv(await summaryRoute.GET(call(admin.cookie, `/api/admin/costs/summary?month=${month}`)));

const units = (usd: string) => BigInt(usd.replace('.', ''));
const sumUsd = (values: string[]) => {
  const n = values.reduce((t, v) => t + units(v), 0n);
  const a = n < 0n ? -n : n;
  return `${n < 0n ? '-' : ''}${a / 10000n}.${String(a % 10000n).padStart(4, '0')}`;
};
const sumVnd = (values: string[]) => String(values.reduce((t, v) => t + BigInt(v === '' ? 0 : v), 0n));

// --- The fixture -----------------------------------------------------------------------------------------------------------

async function open(id: string, userId: string, teamId: string, storeId: string | null, provider: 'fal' | 'replicate', createdAt: string, estimate: string) {
  await pool.query(
    `insert into jobs (id, user_id, team_id, store_id, model, provider, prompt, aspect, duration_s, input_asset_ids, created_at)
     values ($1, $2, $3, $4, $5, $6, 'p', '9:16', 5, '{}', $7)`,
    [id, userId, teamId, storeId, provider === 'fal' ? 'fal-test' : 'rep-test', provider, createdAt],
  );
  await reserve(pool, id, estimate);
}
const running = (id: string) => pool.query(`update jobs set status = 'running' where id = $1`, [id]);
const succeed = (id: string, costUsd: string) => settle(pool, id, { status: 'succeeded', costUsd, outputAssetId: 'out', posterAssetId: null });

let falInvoice: { bookedUsd: string; invoice: Invoice };
let replicateInvoice: { bookedUsd: string; invoice: Invoice };

beforeAll(async () => {
  admin = await newUser('admin@example.test', 'admin');
  member = await newUser('member@example.test', 'member');
  await pool.query(`insert into teams (id, name, cost_centre_code) values ('t1', 'Alpha, Inc', 'CC-A'), ('t2', 'Beta', null), ('t3', 'Gamma', 'CC-G')`);
  await pool.query(`insert into stores (id, name, code) values ('s1', 'Shop A', 'CODE-A'), ('s2', 'Shop B', 'CODE-B')`);
  await pool.query(
    `insert into users (id, email, name, team_id) values ('alice', 'alice@example.test', 'Alice', 't1'), ('bob', 'bob@example.test', 'Bob', 't2'), ('carol', 'carol@example.test', 'Carol', 't1')`,
  );
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
     values ('fal-test', 'fal', 'x', 'Fal test', '{9:16}', '{5}', 2, '720p', 0.2, '{}', true), ('rep-test', 'replicate', 'x', 'Replicate test', '{9:16}', '{5}', 2, '720p', 0.4, '{}', true)`,
  );
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ('out', 'alice', 'output', 'out.mp4', 'out.mp4', 'video/mp4', 1)`);

  // j1: Alice in Alpha (t1), Shop A. Estimate 1.6, real cost 2.0 -> +0.4. Marked Pass.
  await open('j1', 'alice', 't1', 's1', 'fal', '2026-09-10 10:00:00+07', '1.6000');
  await running('j1');
  await succeed('j1', '2.0000');
  // Alice moves to Gamma (t3): her earlier job stays on Alpha, her later jobs go to Gamma.
  await pool.query(`update users set team_id = 't3' where id = 'alice'`);
  // j2: Alice in Gamma, Shop B. Estimate 1.6, real cost 1.0 -> the estimate stays (+0). Marked Fail, then re-assigned to Shop A (a -1.6 / +1.6 pair).
  await open('j2', 'alice', 't3', 's2', 'fal', '2026-09-12 11:00:00+07', '1.6000');
  await running('j2');
  await succeed('j2', '1.0000');
  await reassignStore(pool, 'j2', 's1', admin.id);
  // j3: Bob in Beta (t2), no store. Estimate 1.6, failed and not billed -> release (-1.6).
  await open('j3', 'bob', 't2', null, 'fal', '2026-09-13 09:00:00+07', '1.6000');
  await running('j3');
  await settle(pool, 'j3', { status: 'failed', costUsd: '0', error: 'provider refused' });
  // j4: Bob in Beta, Shop B, Replicate. Estimate 2.0, failed but billed 2.5 -> +0.5.
  await open('j4', 'bob', 't2', 's2', 'replicate', '2026-09-14 09:00:00+07', '2.0000');
  await running('j4');
  await settle(pool, 'j4', { status: 'failed', costUsd: '2.5000', error: 'rejected clip', billed: true });
  // j5: Carol in Alpha, Shop A. Run at 03:00 ICT on 1 September (still 31 August in UTC); timed out, then late-billed 1.8 -> +0.2.
  await open('j5', 'carol', 't1', 's1', 'fal', '2026-09-01 03:00:00+07', '1.6000');
  await pool.query(`update jobs set status = 'timed_out', started_at = '2026-09-01 03:00:05+07', finished_at = now() where id = 'j5'`);
  await lateBill(pool, 'j5', '1.8000');
  // j6: Alice in Gamma, Shop A. Only the estimate 1.6 so far: the job is not final, so the month is provisional.
  await open('j6', 'alice', 't3', 's1', 'fal', '2026-09-20 15:00:00+07', '1.6000');

  await pool.query(`insert into verdicts (id, job_id, verdict, fault, marked_by) values ('v1', 'j1', 'pass', null, $1), ('v2', 'j2', 'fail', 'other', $1)`, [admin.id]);

  // Shared rows: a bake-off row, a manual adjustment and one invoice per provider.
  await bookShared(pool, { kind: 'bakeoff', usd: '3.0000', month: M, provider: 'fal', ref: 'bakeoff-fal-2026-09' });
  expect((await postAdjustment({ month: M, usd: '-1.0000', note: ' Refund for a duplicate charge ' })).status).toBe(201);
  // Everything the ledger holds for fal: 2.0 + 1.6 + 0 + 1.8 + 1.6 + 3.0 = 10.0; for replicate: 2.5.
  falInvoice = await (await putInvoice({ month: M, provider: 'fal', totalUsd: '10.5' })).json();
  replicateInvoice = await (await putInvoice({ month: M, provider: 'replicate', totalUsd: 2 })).json();
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

// Hand-computed from the fixture, at 25000.5 VND per USD, rounding each ledger row half to even.
//   Job rows, USD:  j1 2.0 | j2 1.6 | j3 0 | j4 2.5 | j5 1.8 | j6 1.6                      = 9.5
//   Job rows, VND:  j1 40001 + 10000 | j2 40001 + 0 - 40001 + 40001 | j3 40001 - 40001
//                   j4 50001 + 12500 | j5 40001 + 5000 | j6 40001                        = 237505
//   Shared, USD:    bake-off 3.0 | manual -1.0 | invoice_diff +0.5 and -0.5              = 2.0
//   Shared, VND:    75002 (75001.5 -> even) | -25000 (-25000.5 -> even) | 12500 | -12500  = 50002
const RATE = '25000.5000';
const TOTAL = { usd: '11.5000', usdDisplay: '11.50', vnd: '287507' };
const ZERO = { usd: '0.0000', usdDisplay: '0.00', vnd: '0' };
const money = (usd: string, usdDisplay: string, vnd: string) => ({ usd, usdDisplay, vnd });

describe('round_half_even', () => {
  test.each([
    ['0.5', '0'], ['1.5', '2'], ['2.5', '2'], ['3.5', '4'], ['-0.5', '0'], ['-1.5', '-2'], ['-2.5', '-2'], ['25000.5', '25000'], ['75001.5', '75002'],
    ['2.4999', '2'], ['2.5001', '3'], ['-2.5001', '-3'], ['0', '0'], ['7', '7'],
  ])('rounds %s to %s', async (input, expected) => {
    expect((await pool.query('select round_half_even($1::numeric)::text as r', [input])).rows[0].r).toBe(expected);
  });
});

describe('authorization', () => {
  const endpoints: [string, (cookie?: string) => Promise<Response>][] = [
    ['GET /api/admin/costs', (c) => costsRoute.GET(call(c, `/api/admin/costs?month=${M}`))],
    ['GET /api/admin/costs/detail', (c) => detailRoute.GET(call(c, `/api/admin/costs/detail?month=${M}`))],
    ['GET /api/admin/costs/summary', (c) => summaryRoute.GET(call(c, `/api/admin/costs/summary?month=${M}`))],
    ['POST /api/admin/costs/adjustments', (c) => adjustRoute.POST(call(c, '/api/admin/costs/adjustments', 'POST', { month: M, usd: '1', note: 'x' }))],
    ['PUT /api/admin/rates/[month]', (c) => rateRoute.PUT(call(c, `/api/admin/rates/${M}`, 'PUT', { vndPerUsd: 1 }), ctxMonth(M))],
    ['PUT /api/admin/invoices', (c) => invoicesRoute.PUT(call(c, '/api/admin/invoices', 'PUT', { month: M, provider: 'fal', totalUsd: 1 }))],
  ];

  test.each(endpoints)('%s answers 401 without a session and 403 to a Member, and changes nothing', async (_name, run) => {
    const [ledger, audit, rates, invoices] = [await ledgerCount(), await auditCount(), (await pool.query('select count(*)::int as n from monthly_rates')).rows[0].n, (await pool.query('select count(*)::int as n from provider_invoices')).rows[0].n];
    expect((await run(undefined)).status).toBe(401);
    expect((await run(member.cookie)).status).toBe(403);
    expect([await ledgerCount(), await auditCount(), (await pool.query('select count(*)::int as n from monthly_rates')).rows[0].n, (await pool.query('select count(*)::int as n from provider_invoices')).rows[0].n]).toEqual([ledger, audit, rates, invoices]);
  });
});

describe('the Costs page for September 2026', () => {
  test('shows USD only while the month has no rate', async () => {
    const p = await page();
    expect(p.rateVndPerUsd).toBeNull();
    expect(p.total).toEqual({ usd: '11.5000', usdDisplay: '11.50', vnd: null });
    expect(p.byUser.every((u) => u.vnd === null && u.costPerAcceptedVnd === null)).toBe(true);
    expect((await detail()).rows.every((r) => r[13] === '')).toBe(true);
    expect((await summary()).rows.every((r) => r[6] === '')).toBe(true);
  });

  test('sets the month rate, audited once with the old and new rate; a bad rate or the same rate writes nothing', async () => {
    expect((await putRate(M, { vndPerUsd: 25000.5 })).status).toBe(200);
    expect(await audits(`rate:${M}`)).toEqual([{ actor_id: admin.id, action: 'rate.update', old_value: null, new_value: { vndPerUsd: RATE } }]);
    const before = await auditCount();
    expect((await putRate(M, { vndPerUsd: '25000.5' })).status).toBe(200); // unchanged
    for (const body of [{}, { vndPerUsd: 0 }, { vndPerUsd: -5 }, { vndPerUsd: 'lots' }, { vndPerUsd: '1.23456' }, { vndPerUsd: 1e21 }]) expect((await putRate(M, body)).status, JSON.stringify(body)).toBe(400);
    expect((await putRate('2026-13', { vndPerUsd: 1 })).status).toBe(400);
    expect(await auditCount()).toBe(before);
    expect((await page()).rateVndPerUsd).toBe(RATE);
  });

  test('totals by user, by team and by store, each with its failed-clip columns, accepted clips and cost per accepted clip', async () => {
    const p = await page();
    expect(p.month).toBe(M);
    expect(p.total).toEqual(TOTAL);
    expect(p.shared).toEqual({ ...money('2.0000', '2.00', '50002'), rows: 4, byKind: { bakeoff: '3.0000', manual_adjustment: '-1.0000', invoice_diff: '0.0000' } });
    expect(p.capUsage).toEqual({ usd: '11.5000', monthlyCapUsd: '200.0000' });

    // Largest first. Alice: j1 + j2 + j6.
    expect(p.byUser.map((u) => u.id)).toEqual(['alice', 'bob', 'carol']);
    const [alice, bob, carol] = p.byUser;
    expect(alice).toMatchObject({ name: 'Alice', ...money('5.2000', '5.20', '130003'), acceptedClips: 1, costPerAcceptedUsd: '5.2000', costPerAcceptedVnd: '130003' });
    expect(alice!.failedByVerdict).toEqual(money('1.6000', '1.60', '40001')); // j2, marked Fail
    expect(alice!.failedByStatus).toEqual(ZERO);
    expect(bob).toMatchObject({ name: 'Bob', ...money('2.5000', '2.50', '62501'), acceptedClips: 0, costPerAcceptedUsd: null, costPerAcceptedVnd: null });
    expect(bob!.failedByVerdict).toEqual(ZERO);
    expect(bob!.failedByStatus).toEqual(money('2.5000', '2.50', '62501')); // j4 failed with a cost; j3 failed with none and is not counted
    expect(carol).toMatchObject({ name: 'Carol', ...money('1.8000', '1.80', '45001'), acceptedClips: 0 });
    expect(carol!.failedByStatus).toEqual(money('1.8000', '1.80', '45001')); // j5 timed out with a late bill

    // The team at Run counts: j1 on Alpha although Alice is now in Gamma.
    expect(p.byTeam.map((t) => t.id)).toEqual(['t1', 't3', 't2']);
    const [alpha, gamma, beta] = p.byTeam;
    expect(alpha).toMatchObject({ name: 'Alpha, Inc', ...money('3.8000', '3.80', '95002'), acceptedClips: 1, costPerAcceptedUsd: '3.8000', costPerAcceptedVnd: '95002' });
    expect(alpha!.failedByVerdict).toEqual(ZERO);
    expect(alpha!.failedByStatus).toEqual(money('1.8000', '1.80', '45001'));
    expect(gamma).toMatchObject({ name: 'Gamma', ...money('3.2000', '3.20', '80002'), acceptedClips: 0, costPerAcceptedUsd: null });
    expect(gamma!.failedByVerdict).toEqual(money('1.6000', '1.60', '40001'));
    expect(beta).toMatchObject({ name: 'Beta', ...money('2.5000', '2.50', '62501'), acceptedClips: 0 });
    expect(beta!.failedByStatus).toEqual(money('2.5000', '2.50', '62501'));

    // j2 moved from Shop B to Shop A, so Shop A holds j1 + j2 + j5 + j6 and Shop B only j4; the jobs with no store have their own group.
    expect(p.byStore.map((s) => s.id)).toEqual(['s1', 's2', '']);
    const [shopA, shopB, none] = p.byStore;
    expect(shopA).toMatchObject({ name: 'Shop A', code: 'CODE-A', ...money('7.0000', '7.00', '175004'), acceptedClips: 1, costPerAcceptedUsd: '7.0000', costPerAcceptedVnd: '175004' });
    expect(shopA!.failedByVerdict).toEqual(money('1.6000', '1.60', '40001'));
    expect(shopA!.failedByStatus).toEqual(money('1.8000', '1.80', '45001'));
    expect(shopB).toMatchObject({ name: 'Shop B', ...money('2.5000', '2.50', '62501'), acceptedClips: 0 });
    expect(shopB!.failedByVerdict).toEqual(ZERO);
    expect(none).toMatchObject({ name: 'Không gắn cửa hàng', code: null, ...ZERO, acceptedClips: 0 });

    // Every dimension adds up to the job rows (9.5 USD, 237505 VND); the shared line is on top.
    for (const group of [p.byUser, p.byTeam, p.byStore]) {
      expect(sumUsd(group.map((g) => g.usd))).toBe('9.5000');
      expect(sumVnd(group.map((g) => g.vnd!))).toBe('237505');
    }
  });

  test('the invoices carry the difference, the red flag and the provider total by UTC month of submit', async () => {
    const p = await page();
    // fal: invoice 10.5 - ledger 10.0 = 0.5, 4.76% of the invoice. j5 was submitted on 31 August in UTC, so the UTC month holds 10.0 - 1.8.
    expect(falInvoice).toEqual({ month: M, bookedUsd: '0.5000', invoice: { provider: 'fal', totalUsd: '10.5000', ledgerUsd: '10.0000', diffUsd: '0.5000', red: false, utcMonthUsd: '8.2000' } });
    // replicate: invoice 2.0 - ledger 2.5 = -0.5, 25% of the invoice.
    expect(replicateInvoice).toEqual({ month: M, bookedUsd: '-0.5000', invoice: { provider: 'replicate', totalUsd: '2.0000', ledgerUsd: '2.5000', diffUsd: '-0.5000', red: true, utcMonthUsd: '2.5000' } });
    expect(p.invoices).toEqual([falInvoice.invoice, replicateInvoice.invoice]);
  });

  test('four totals match to the cent: CSV detail, CSV summary, Costs page and the month cap usage', async () => {
    const p = await page();
    const d = await detail();
    const s = await summary();

    const detailUsd = sumUsd(d.rows.map((r) => r[12]!));
    const detailVnd = sumVnd(d.rows.map((r) => r[13]!));
    const summaryUsd = sumUsd(s.rows.map((r) => r[5]!));
    const summaryVnd = sumVnd(s.rows.map((r) => r[6]!));
    expect([detailUsd, detailVnd]).toEqual(['11.5000', '287507']);
    expect([summaryUsd, summaryVnd]).toEqual(['11.5000', '287507']);
    expect([p.total.usd, p.total.vnd]).toEqual(['11.5000', '287507']);
    expect(p.capUsage.usd).toBe('11.5000');

    // The cap itself (limits.ts): usage 11.5 means a cap of exactly 11.5 admits an estimate of 0 but not of 0.0001, and 11.4999 admits neither.
    const at = new Date('2026-09-15T00:00:00Z');
    const withCap = async (cap: string, estimate: string) => {
      await pool.query(`update settings set monthly_cap_usd = $1 where id = 1`, [cap]);
      return checkCaps(pool, admin.id, estimate, at);
    };
    try {
      expect(await withCap('11.5000', '0')).toBeNull();
      expect(await withCap('11.5000', '0.0001')).toBe('monthly_usd');
      expect(await withCap('11.4999', '0')).toBe('monthly_usd');
    } finally {
      await pool.query(`update settings set monthly_cap_usd = 200 where id = 1`);
    }

    // The same rows: one as_of on the page and in both CSV labels.
    const asOf = (await pool.query('select max(id)::int as n from cost_entries')).rows[0].n as number;
    expect(p.asOf).toBe(asOf);
    expect(d.label).toBe(`Creative Video Studio ledger-detail ${M} as_of ${asOf}`);
    expect(s.label).toBe(`Creative Video Studio summary ${M} as_of ${asOf}`);
    expect(d.disposition).toBe(`attachment; filename="cvs-ledger-detail-${M}.csv"`);
    expect(s.disposition).toBe(`attachment; filename="cvs-summary-${M}.csv"`);
  });

  test('the ledger detail CSV has the fixed columns in order, one line per ledger row, and rounds half to even', async () => {
    const d = await detail();
    expect(d.header).toEqual(['month', 'date', 'job id', 'user', 'email', 'team', 'cost-centre code', 'store', 'store code', 'provider', 'model', 'entry kind', 'USD', 'VND', 'Tạm tính/Thật', 'Đạt/Không đạt']);
    expect(d.rows).toHaveLength(17); // j1 2, j2 4, j3 2, j4 2, j5 2, j6 1, bake-off 1, manual 1, invoice_diff 2
    expect(new Set(d.rows.map((r) => r[11]))).toEqual(new Set(['estimate', 'actual_adjustment', 'release', 'late_bill', 'bakeoff', 'manual_adjustment', 'invoice_diff', 'store_reassign']));

    const of = (job: string) => d.rows.filter((r) => r[2] === job);
    // j1: the team and store at Run, final, marked Pass.
    expect(of('j1')[0]).toEqual([M, '2026-09-10', 'j1', 'Alice', 'alice@example.test', 'Alpha, Inc', 'CC-A', 'Shop A', 'CODE-A', 'fal', 'fal-test', 'estimate', '1.6000', '40001', 'Thật', 'Đạt']);
    expect(of('j1')[1]!.slice(5, 7)).toEqual(['Alpha, Inc', 'CC-A']);
    // j2: Alice is in Gamma by then; its rows on Shop B net to zero and the whole 1.6 sits on Shop A; marked Fail.
    expect(of('j2').map((r) => [r[5], r[7], r[11], r[12], r[13], r[15]])).toEqual([
      ['Gamma', 'Shop B', 'estimate', '1.6000', '40001', 'Không đạt'],
      ['Gamma', 'Shop B', 'actual_adjustment', '0.0000', '0', 'Không đạt'],
      ['Gamma', 'Shop B', 'store_reassign', '-1.6000', '-40001', 'Không đạt'],
      ['Gamma', 'Shop A', 'store_reassign', '1.6000', '40001', 'Không đạt'],
    ]);
    // j3: no store, released. j6: not final yet.
    expect(of('j3').map((r) => [r[7], r[11], r[12], r[13]])).toEqual([['', 'estimate', '1.6000', '40001'], ['', 'release', '-1.6000', '-40001']]);
    expect(of('j6')).toEqual([[M, '2026-09-20', 'j6', 'Alice', 'alice@example.test', 'Gamma', 'CC-G', 'Shop A', 'CODE-A', 'fal', 'fal-test', 'estimate', '1.6000', '40001', 'Tạm tính', '']]);
    expect(of('j5').map((r) => [r[11], r[12], r[13], r[14]])).toEqual([['estimate', '1.6000', '40001', 'Thật'], ['late_bill', '0.2000', '5000', 'Thật']]);

    // Shared rows have no job, user, team or store. 3.0 x 25000.5 = 75001.5 goes up to the even 75002; -1.0 x 25000.5 = -25000.5 goes to the even -25000 (round() gives -25001).
    const shared = d.rows.filter((r) => r[2] === '');
    expect(shared).toEqual([
      [M, '', '', '', '', '', '', '', '', 'fal', '', 'bakeoff', '3.0000', '75002', 'Thật', ''],
      [M, '', '', '', '', '', '', '', '', '', '', 'manual_adjustment', '-1.0000', '-25000', 'Thật', ''],
      [M, '', '', '', '', '', '', '', '', 'fal', '', 'invoice_diff', '0.5000', '12500', 'Thật', ''],
      [M, '', '', '', '', '', '', '', '', 'replicate', '', 'invoice_diff', '-0.5000', '-12500', 'Thật', ''],
    ]);
  });

  test('the summary CSV has one line per team and store and a "Chi phí chung" line equal to the shared rows', async () => {
    const s = await summary();
    expect(s.header).toEqual([
      'month', 'team', 'cost-centre code', 'store', 'store code', 'USD', 'VND', 'failed clips USD (Fail verdict)', 'failed jobs USD (failed or timed out)', 'accepted clips', 'cost per accepted clip USD',
    ]);
    expect(s.rows).toEqual([
      [M, 'Alpha, Inc', 'CC-A', 'Shop A', 'CODE-A', '3.8000', '95002', '0.0000', '1.8000', '1', '3.8000'],
      [M, 'Beta', '', 'Không gắn cửa hàng', '', '0.0000', '0', '0.0000', '0.0000', '0', ''],
      [M, 'Beta', '', 'Shop B', 'CODE-B', '2.5000', '62501', '0.0000', '2.5000', '0', ''],
      [M, 'Gamma', 'CC-G', 'Shop A', 'CODE-A', '3.2000', '80002', '1.6000', '0.0000', '0', ''],
      [M, 'Gamma', 'CC-G', 'Shop B', 'CODE-B', '0.0000', '0', '0.0000', '0.0000', '0', ''],
      [M, 'Chi phí chung', '', '', '', '2.0000', '50002', '', '', '', ''],
    ]);
    const shared = (await detail()).rows.filter((r) => r[2] === '');
    expect(s.rows.at(-1)!.slice(5, 7)).toEqual([sumUsd(shared.map((r) => r[12]!)), sumVnd(shared.map((r) => r[13]!))]);
  });

  test('a hidden team and a hidden store keep their history', async () => {
    const before = await page();
    await pool.query(`update teams set hidden = true where id = 't1'`);
    await pool.query(`update stores set hidden = true where id = 's1'`);
    expect(await page()).toEqual(before);
    expect((await summary()).rows).toHaveLength(6);
    expect((await detail()).rows).toHaveLength(17);
  });

  test('"Tạm tính" shows while a job of the month is not final and goes away once every job is final', async () => {
    const before = await page();
    expect(before.provisional).toBe(true);
    expect((await detail()).rows.filter((r) => r[14] === 'Tạm tính').map((r) => r[2])).toEqual(['j6']);

    await running('j6');
    expect(await succeed('j6', '1.6000')).toBe(true); // the real cost equals the estimate: a closing row of 0

    const after = await page();
    expect(after.provisional).toBe(false);
    expect(after.asOf).toBeGreaterThan(before.asOf);
    expect(after.total).toEqual(TOTAL);
    expect((await detail()).rows.filter((r) => r[14] === 'Tạm tính')).toEqual([]);
    expect((await detail()).rows).toHaveLength(18);
  });

  test('a month nobody spent in is empty and not provisional', async () => {
    const p = await page('2030-01');
    expect(p).toMatchObject({ provisional: false, rateVndPerUsd: null, byUser: [], byTeam: [], byStore: [] });
    expect(p.total.usd).toBe('0.0000');
    expect((await detail('2030-01')).rows).toEqual([]);
  });

  test.each(['2026-9', '2026-13', 'x', ''])('refuses ?month=%s with 400', async (month) => {
    for (const run of [costsRoute.GET, detailRoute.GET, summaryRoute.GET]) expect((await run(call(admin.cookie, `/api/admin/costs?month=${month}`))).status).toBe(400);
  });
});

describe('manual adjustments', () => {
  test('books a shared manual_adjustment with its note, audited once with the new values (the fixture row)', async () => {
    const rows = (await pool.query(`select usd::text as usd, month, note, job_id, user_id, team_id, store_id, is_final from cost_entries where kind = 'manual_adjustment'`)).rows;
    expect(rows).toEqual([{ usd: '-1.0000', month: M, note: 'Refund for a duplicate charge', job_id: null, user_id: null, team_id: null, store_id: null, is_final: true }]);
    const entries = (await pool.query(`select actor_id, target, old_value, new_value from audit_entries where action = 'cost.manual_adjustment'`)).rows;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actor_id: admin.id, old_value: null, new_value: { month: M, usd: '-1.0000', note: 'Refund for a duplicate charge' } });
    expect(entries[0].target).toMatch(/^cost:manual-/);
  });

  test.each([
    ['no note', { month: M, usd: '1' }],
    ['a blank note', { month: M, usd: '1', note: '   ' }],
    ['a zero amount', { month: M, usd: '0', note: 'x' }],
    ['a fifth decimal', { month: M, usd: '1.00001', note: 'x' }],
    ['no amount', { month: M, note: 'x' }],
    ['a bad month', { month: '2026-9', usd: '1', note: 'x' }],
  ])('refuses %s with 400 and books nothing', async (_name, body) => {
    const [ledger, audit] = [await ledgerCount(), await auditCount()];
    expect((await postAdjustment(body)).status).toBe(400);
    expect([await ledgerCount(), await auditCount()]).toEqual([ledger, audit]);
  });
});

describe('invoices', () => {
  const aug = async (provider: string, totalUsd: unknown, month = '2026-08') => {
    const res = await putInvoice({ month, provider, totalUsd });
    expect(res.status).toBe(200);
    return (await res.json()) as { month: string; bookedUsd: string; invoice: Invoice };
  };
  const diffRows = async (month: string) => (await pool.query(`select usd::text as usd from cost_entries where kind = 'invoice_diff' and month = $1 and provider = 'fal' order by id`, [month])).rows.map((r) => r.usd);

  test('audits the entry of the fixture once, with the old and new total and the difference booked', async () => {
    expect(await audits(`invoice:${M}:fal`)).toEqual([{ actor_id: admin.id, action: 'invoice.enter', old_value: null, new_value: { totalUsd: '10.5000', bookedUsd: '0.5000' } }]);
    expect(await audits(`invoice:${M}:replicate`)).toHaveLength(1);
  });

  test('books the difference to the ledger, flags red only above 5% of the invoice, and books only the new difference when it is entered again', async () => {
    await bookShared(pool, { kind: 'bakeoff', usd: '95.0000', month: '2026-08', provider: 'fal', ref: 'bakeoff-fal-2026-08' });
    // Ledger 95, invoice 100: the difference 5 is exactly 5% of the invoice, which is not above it.
    // The UTC month of August also holds j5 (submitted on 31 August in UTC, booked to September in ICT): 95 + 1.8.
    const first = await aug('fal', '100');
    expect(first).toEqual({ month: '2026-08', bookedUsd: '5.0000', invoice: { provider: 'fal', totalUsd: '100.0000', ledgerUsd: '95.0000', diffUsd: '5.0000', red: false, utcMonthUsd: '96.8000' } });
    expect(await diffRows('2026-08')).toEqual(['5.0000']);
    // The same invoice again books nothing and writes no audit entry.
    expect(await aug('fal', 100)).toMatchObject({ bookedUsd: '0.0000', invoice: { diffUsd: '5.0000', red: false } });
    expect(await diffRows('2026-08')).toEqual(['5.0000']);
    expect(await audits('invoice:2026-08:fal')).toHaveLength(1);
    // A cent above: difference 5.01 is more than 5% of 100.01 (5.0005), so red. Only the new 0.01 is booked.
    expect(await aug('fal', '100.01')).toEqual({ month: '2026-08', bookedUsd: '0.0100', invoice: { provider: 'fal', totalUsd: '100.0100', ledgerUsd: '95.0000', diffUsd: '5.0100', red: true, utcMonthUsd: '96.8000' } });
    expect(await diffRows('2026-08')).toEqual(['5.0000', '0.0100']);
    expect(await audits('invoice:2026-08:fal')).toEqual([
      { actor_id: admin.id, action: 'invoice.enter', old_value: null, new_value: { totalUsd: '100.0000', bookedUsd: '5.0000' } },
      { actor_id: admin.id, action: 'invoice.enter', old_value: { totalUsd: '100.0000' }, new_value: { totalUsd: '100.0100', bookedUsd: '0.0100' } },
    ]);
  });

  test('an invoice below the ledger books a negative difference and is red above 5%', async () => {
    await bookShared(pool, { kind: 'bakeoff', usd: '95.0000', month: '2026-07', provider: 'fal', ref: 'bakeoff-fal-2026-07' });
    expect(await aug('fal', '90', '2026-07')).toEqual({ month: '2026-07', bookedUsd: '-5.0000', invoice: { provider: 'fal', totalUsd: '90.0000', ledgerUsd: '95.0000', diffUsd: '-5.0000', red: true, utcMonthUsd: '95.0000' } });
    // 3% below the ledger is not red.
    expect(await aug('fal', '92.15', '2026-07')).toMatchObject({ bookedUsd: '2.1500', invoice: { diffUsd: '-2.8500', red: false } });
  });

  test.each([
    ['an unknown provider', { month: M, provider: 'mock', totalUsd: 1 }],
    ['a missing provider', { month: M, totalUsd: 1 }],
    ['a negative total', { month: M, provider: 'fal', totalUsd: -1 }],
    ['a text total', { month: M, provider: 'fal', totalUsd: 'lots' }],
    ['a bad month', { month: '2026-00', provider: 'fal', totalUsd: 1 }],
  ])('refuses %s with 400 and books nothing', async (_name, body) => {
    const [ledger, audit] = [await ledgerCount(), await auditCount()];
    expect((await putInvoice(body)).status).toBe(400);
    expect([await ledgerCount(), await auditCount()]).toEqual([ledger, audit]);
  });
});

describe('VND rates', () => {
  test("changing one month's rate changes only that month, each change audited with the old and new rate", async () => {
    // August holds a 95 bake-off row and invoice differences 5 and 0.01: 100.01 USD in all.
    expect((await putRate('2026-08', { vndPerUsd: 20000 })).status).toBe(200);
    expect((await page('2026-08')).total).toEqual({ usd: '100.0100', usdDisplay: '100.01', vnd: '2000200' }); // 1900000 + 100000 + 200
    expect((await page(M)).total.vnd).toBe('287507');

    expect((await putRate(M, { vndPerUsd: 26000 })).status).toBe(200);
    // At 26000 every September row is a whole number: jobs 52000 + 41600 + 0 + 65000 + 46800 + 41600 = 247000, shared 78000 - 26000 + 13000 - 13000 = 52000.
    expect((await page(M)).total.vnd).toBe('299000');
    expect((await page('2026-08')).total.vnd).toBe('2000200');
    expect((await summary()).rows.reduce((t, r) => t + BigInt(r[6]!), 0n)).toBe(299000n);

    expect((await putRate(M, { vndPerUsd: 26000 })).status).toBe(200); // unchanged
    expect((await putRate(M, { vndPerUsd: 25000.5 })).status).toBe(200);
    expect(await audits(`rate:${M}`)).toEqual([
      { actor_id: admin.id, action: 'rate.update', old_value: null, new_value: { vndPerUsd: '25000.5000' } },
      { actor_id: admin.id, action: 'rate.update', old_value: { vndPerUsd: '25000.5000' }, new_value: { vndPerUsd: '26000.0000' } },
      { actor_id: admin.id, action: 'rate.update', old_value: { vndPerUsd: '26000.0000' }, new_value: { vndPerUsd: '25000.5000' } },
    ]);
    expect(await audits('rate:2026-08')).toEqual([{ actor_id: admin.id, action: 'rate.update', old_value: null, new_value: { vndPerUsd: '20000.0000' } }]);
    expect((await page(M)).total).toEqual(TOTAL);
  });
});

describe('one snapshot across the page and its CSVs', () => {
  const MS = '2026-06';
  const detailAt = async (query: string) => csv(await detailRoute.GET(call(admin.cookie, `/api/admin/costs/detail?month=${MS}${query}`)));
  const summaryAt = async (query: string) => csv(await summaryRoute.GET(call(admin.cookie, `/api/admin/costs/summary?month=${MS}${query}`)));

  test('with the page as_of both CSVs show the rows the page showed, a row written later is left out, and without it they show it', async () => {
    await bookShared(pool, { kind: 'bakeoff', usd: '4.0000', month: MS, provider: 'fal', ref: 'bakeoff-fal-2026-06' });
    const p = await page(MS);
    expect(p.total.usd).toBe('4.0000');
    expect((await postAdjustment({ month: MS, usd: '1.2500', note: 'Written after the page was read' })).status).toBe(201);

    const q = `&asOf=${p.asOf}`;
    const [d, s] = [await detailAt(q), await summaryAt(q)];
    expect(d.label).toBe(`Creative Video Studio ledger-detail ${MS} as_of ${p.asOf}`);
    expect(s.label).toBe(`Creative Video Studio summary ${MS} as_of ${p.asOf}`);
    expect(d.rows).toHaveLength(1);
    expect([sumUsd(d.rows.map((r) => r[12]!)), s.rows.at(-1)![5]]).toEqual([p.total.usd, p.total.usd]);

    const [dNow, sNow] = [await detailAt(''), await summaryAt('')];
    expect(dNow.rows).toHaveLength(2);
    expect([sumUsd(dNow.rows.map((r) => r[12]!)), sNow.rows.at(-1)![5]]).toEqual(['5.2500', '5.2500']);
    expect((await page(MS)).total.usd).toBe('5.2500');
  });

  test.each(['0', '-1', '1.5', 'x', '', '99999999999'])('refuses ?asOf=%s with 400', async (asOf) => {
    for (const run of [detailRoute.GET, summaryRoute.GET]) expect((await run(call(admin.cookie, `/api/admin/costs?month=${MS}&asOf=${asOf}`))).status).toBe(400);
  });
});

describe("a Member's own month-to-date total", () => {
  // GET /api/models already returns it for the Create page; this checks it against the member's own ledger rows.
  const toDate = async () => {
    const res = await modelsRoute.GET(call(member.cookie, '/api/models?ratio=9:16&durationSec=5'));
    expect(res.status).toBe(200);
    return ((await res.json()) as { monthToDate: { usd: string; provisional: boolean } }).monthToDate;
  };
  const ledgerSum = async () =>
    (await pool.query(`select coalesce(sum(usd), 0)::numeric(12, 4)::text as usd from cost_entries where user_id = $1 and month = to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM')`, [member.id])).rows[0].usd as string;

  test('equals the sum of the Member ledger rows of this month, and nothing of other users', async () => {
    const now = new Date().toISOString();
    await open('mtd-bob', 'bob', 't2', null, 'fal', now, '1.0000'); // another user's spend this month
    expect(await toDate()).toEqual({ usd: '0.0000', provisional: false });

    await open('mtd-1', member.id, 'team-unassigned', null, 'fal', now, '1.6000');
    expect(await toDate()).toEqual({ usd: '1.6000', provisional: true });
    expect(await ledgerSum()).toBe('1.6000');

    await running('mtd-1');
    await succeed('mtd-1', '2.0000'); // +0.4
    expect(await toDate()).toEqual({ usd: '2.0000', provisional: false });
    expect(await ledgerSum()).toBe('2.0000');
  });
});

describe('the image and apps features on the Costs page', () => {
  const FM = '2031-08';
  async function featureJob(id: string, feature: string, estimate: string) {
    await pool.query(
      `insert into jobs (id, user_id, team_id, store_id, model, provider, prompt, aspect, duration_s, input_asset_ids, created_at, feature)
       values ($1, 'bob', 't2', null, 'fal-test', 'fal', 'p', '1:1', 5, '{}', '2031-08-10T03:00:00Z', $2)`,
      [id, feature],
    );
    await reserve(pool, id, estimate);
  }

  test('splits the month into the video and the image and apps budgets, lists spend by feature and flags soft caps from 80 %', async () => {
    await open('fv1', 'bob', 't2', null, 'fal', '2031-08-09T03:00:00Z', '3.0000'); // a video job
    await featureJob('ff1', 'face_swap', '5.0000'); // soft cap 5: 100 %
    await featureJob('ff2', 'background_remover', '8.0000'); // soft cap 10: 80 %
    await featureJob('ff3', 'image', '1.5000'); // soft cap 135: no flag
    const p = (await page(FM)) as unknown as {
      capUsage: { usd: string; monthlyCapUsd: string };
      featuresCapUsage: { usd: string; monthlyCapUsd: string };
      byFeature: { id: string; name: string; usd: string }[];
      featureCaps: { feature: string; spentUsd: string; capUsd: string; level: number | null }[];
    };
    expect(p.capUsage).toEqual({ usd: '3.0000', monthlyCapUsd: '200.0000' });
    expect(p.featuresCapUsage).toEqual({ usd: '14.5000', monthlyCapUsd: '260.0000' });
    expect(p.byFeature.map((f) => [f.id, f.name, f.usd])).toEqual([
      ['background_remover', 'Xoá nền', '8.0000'],
      ['face_swap', 'Đổi khuôn mặt', '5.0000'],
      ['video', 'Tạo video', '3.0000'],
      ['image', 'Tạo ảnh', '1.5000'],
    ]);
    const level = Object.fromEntries(p.featureCaps.map((c) => [c.feature, c.level]));
    expect(level).toMatchObject({ face_swap: 100, background_remover: 80, image: null, try_on: null });
    expect(p.featureCaps.find((c) => c.feature === 'face_swap')).toMatchObject({ spentUsd: '5.0000', capUsd: '5.0000' });
  });
});
