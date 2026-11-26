// Billing (docs/BILLING.md): the attribution of each ledger row to a team, a partner or the company, the month's figures and their reconciliation with
// the ledger, the CSV, closing a month and mailing it to accounting on Lark (a fake fetch, never a real call). Against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { autoCloseLastMonth, billedRows, billingMonth, reopenMonth } = await import('@/lib/billing');
const { parseCsv } = await import('@/lib/csv');
const { GET: BILLING } = await import('./route');
const { GET: CSV } = await import('./csv/route');
const { DELETE: REOPEN, POST: CLOSE } = await import('./close/route');

const PASSWORD = 'correct-horse-battery';
let seq = 0;
async function newUser(teamId: string, role: 'member' | 'admin' = 'member') {
  const email = `u${++seq}@example.test`;
  const { user } = await auth.api.createUser({ body: { email, name: `User ${seq}`, password: PASSWORD, role, data: { teamId } } });
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id: user.id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}
type User = Awaited<ReturnType<typeof newUser>>;
const req = (u: User, path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { cookie: u.cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** A ledger row named by its ref: an llm row of a user (no job), or a shared row. `team` is the team the row was booked with, which billing ignores. */
async function row(ref: string, month: string, usd: string, who: { user?: string; team?: string; store?: string | null; workspace?: string; kind?: string; job?: string } = {}) {
  const kind = who.kind ?? (who.user ? 'llm' : 'invoice_diff');
  await pool.query(
    `insert into cost_entries (kind, usd, month, day, user_id, team_id, store_id, job_id, is_final, ref, note, workspace_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [kind, usd, month, who.user ? `${month}-15` : null, who.user ?? null, who.user ? (who.team ?? 'team-unassigned') : null, who.store ?? null, who.job ?? null,
      !who.job, ref, kind === 'manual_adjustment' ? 'correction' : null, who.workspace ?? 'ws_vet'],
  );
}
const buckets = async (month: string) =>
  Object.fromEntries((await pool.query(`select ce.ref, b.bucket from (${billedRows('$1')}) b join cost_entries ce on ce.id = b.id order by ce.ref`, [month])).rows.map((r) => [r.ref, r.bucket]));

let sellerA: User; // in billing team A (free 20)
let sellerB: User; // in billing team B (free 5)
let designer: User; // in a team that is not billed
let system: User; // a system account in team A
let partner: User; // a partner seller, in the unassigned team
let admin: User;

beforeAll(async () => {
  await pool.query(
    `insert into teams (id, name, billable, free_monthly_usd) values ('sales-a', 'Sales A', true, 20), ('sales-b', 'Sales B', true, 5), ('design', 'Design', false, 20)`,
  );
  await pool.query(`insert into workspaces (id, name) values ('ws_p', 'Partner P')`);
  await pool.query(
    `insert into stores (id, name, code, workspace_id, team_id) values ('st-a', 'A Shop', 'A', 'ws_vet', 'sales-a'), ('st-b', 'B Shop', 'B', 'ws_vet', 'sales-b'),
       ('st-n', 'No-team Shop', 'N', 'ws_vet', null), ('st-p', 'Partner Shop', 'P', 'ws_p', null)`,
  );
  [sellerA, sellerB, designer, system, partner, admin] = [
    await newUser('sales-a'), await newUser('sales-b'), await newUser('design'), await newUser('sales-a'), await newUser('team-unassigned'), await newUser('design', 'admin'),
  ];
  await pool.query(`update users set system = true where id = $1`, [system.id]);
  await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_p', $1, 'owner')`, [partner.id]);
  await pool.query(
    `insert into jobs (id, user_id, team_id, store_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, workspace_id, created_at)
     values ('job-a', $1, 'sales-a', 'st-a', 'veo-3.1', 'fal', 'p', '9:16', 5, '{}', 'running', 'ws_vet', '2026-11-10T05:00:00Z')`,
    [sellerA.id],
  );
  // 2026-11, the first billed month.
  await row('a-own-store', '2026-11', '3.0000', { user: sellerA.id, team: 'design', store: 'st-a' }); // booked under another team: billing reads today's
  await row('a-llm-no-store', '2026-11', '1.5000', { user: sellerA.id });
  await row('a-store-of-b', '2026-11', '2.0000', { user: sellerA.id, store: 'st-b' });
  await row('a-store-no-team', '2026-11', '0.2500', { user: sellerA.id, store: 'st-n' });
  await row('a-job', '2026-11', '20.0000', { user: sellerA.id, store: 'st-a', kind: 'estimate', job: 'job-a' }); // not settled yet
  await row('b-own-store', '2026-11', '4.0000', { user: sellerB.id, store: 'st-b' });
  await row('design-on-a', '2026-11', '7.0000', { user: designer.id, store: 'st-a' });
  await row('system-a', '2026-11', '0.5000', { user: system.id, store: 'st-a' });
  await row('shared-invoice', '2026-11', '10.0000');
  await row('shared-adjust', '2026-11', '-1.0000', { kind: 'manual_adjustment' });
  await row('partner-p', '2026-11', '2.5000', { user: partner.id, store: 'st-p', workspace: 'ws_p' });
  // 2026-10, before billing started.
  await row('old-a', '2026-10', '100.0000', { user: sellerA.id, store: 'st-a' });
  await row('old-partner', '2026-10', '1.0000', { user: partner.id, workspace: 'ws_p' });
});
afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

describe('the attribution', () => {
  test('puts each row of a billed month in its bucket by the owner’s rules', async () => {
    expect(await buckets('2026-11')).toEqual({
      'a-own-store': 'team:sales-a', // the store's team
      'a-llm-no-store': 'team:sales-a', // an llm row with no store: the member's team
      'a-store-of-b': 'team:sales-b', // a store owned by another billing team: that team
      'a-store-no-team': 'team:sales-a', // a store of no team: the member's team
      'a-job': 'team:sales-a',
      'b-own-store': 'team:sales-b',
      'design-on-a': 'company:non_billing', // a member outside billing teams, even on a billing team's store
      'system-a': 'company:system',
      'shared-invoice': 'company:shared',
      'shared-adjust': 'company:shared',
      'partner-p': 'partner:ws_p', // a partner pays from the first dollar
    });
  });

  test('a month before 2026-11 is company cost, a partner’s row too', async () => {
    const old = await buckets('2026-10');
    expect(old).toMatchObject({ 'old-a': 'company:before_start', 'old-partner': 'company:before_start' });
    expect(new Set(Object.values(old))).toEqual(new Set(['company:before_start'])); // the migrations' bake-off rows of 2026-10 too
  });

  test('follows today’s teams and stores, not those a row was booked with', async () => {
    await pool.query(`update stores set team_id = 'sales-a' where id = 'st-b'`);
    await pool.query(`update users set team_id = 'sales-b' where id = $1`, [designer.id]);
    try {
      const now = await buckets('2026-11');
      expect(now['a-store-of-b']).toBe('team:sales-a');
      expect(now['b-own-store']).toBe('team:sales-a'); // B's member on a store now A's
      expect(now['design-on-a']).toBe('team:sales-a'); // now a billing member, on A's store
    } finally {
      await pool.query(`update stores set team_id = 'sales-b' where id = 'st-b'`);
      await pool.query(`update users set team_id = 'design' where id = $1`, [designer.id]);
    }
  });
});

describe('the month’s figures', () => {
  test('give each team its total, allowance and payable, each partner its total, and the company by reason, reconciled with the ledger', async () => {
    const m = await billingMonth('2026-11');
    expect(m.teams.map((t) => [t.name, t.totalUsd, t.freeUsd, t.usedUsd, t.payableUsd])).toEqual([
      ['Sales A', '24.7500', '20.0000', '20.0000', '4.7500'],
      ['Sales B', '6.0000', '5.0000', '5.0000', '1.0000'],
    ]);
    expect(m.teams[0]).toMatchObject({ stores: ['A Shop'], members: expect.arrayContaining([`User 1`, `User 4`]) });
    expect(m.partners).toEqual([{ bucket: 'partner:ws_p', id: 'ws_p', name: 'Partner P', totalUsd: '2.5000', freeUsd: '0.0000', payableUsd: '2.5000' }]);
    expect(Object.fromEntries(m.company.reasons.map((r) => [r.id, r.totalUsd]))).toEqual({ before_start: '0.0000', shared: '9.0000', system: '0.5000', non_billing: '7.0000' });
    expect(m.totals).toEqual({ ledgerUsd: '49.7500', teamsUsd: '30.7500', partnersUsd: '2.5000', companyUsd: '16.5000', payableUsd: '8.2500', reconciled: true });
    expect(m.provisional).toBe(true); // job-a has no closing row
    expect(m.lines.filter((l) => l.bucket === 'team:sales-a').map((l) => [l.storeName, l.kind, l.usd])).toEqual(
      expect.arrayContaining([['A Shop', 'estimate', '20.0000'], [null, 'llm', '1.5000']]),
    );
  });

  test('reconcile in a month before billing too, and say so when a bucket is left out', async () => {
    const m = await billingMonth('2026-10');
    const ledger = (await pool.query(`select sum(usd)::numeric(14, 4)::text as usd from cost_entries where month = '2026-10'`)).rows[0].usd;
    expect(m.totals).toMatchObject({ ledgerUsd: ledger, companyUsd: ledger, teamsUsd: '0.0000', partnersUsd: '0.0000', reconciled: true });
    // A team that stops being billed: its member's 4.00 goes to the company, and A's 2.00 on its store to A. Still reconciled.
    await pool.query(`update teams set billable = false where id = 'sales-b'`);
    try {
      expect((await billingMonth('2026-11')).totals).toMatchObject({ teamsUsd: '26.7500', companyUsd: '20.5000', reconciled: true });
    } finally {
      await pool.query(`update teams set billable = true where id = 'sales-b'`);
    }
  });

  test('sum unrounded amounts: three thirds of a cent reconcile exactly', async () => {
    for (const n of [1, 2, 3]) await row(`third-${n}`, '2026-09', '0.0033', { user: sellerA.id });
    const m = await billingMonth('2026-09');
    expect(m.totals).toMatchObject({ ledgerUsd: '0.0099', companyUsd: '0.0099', reconciled: true });
  });
});

describe('GET /api/admin/billing and its CSV', () => {
  test('the route answers an Admin with the month, refuses a member and a bad month', async () => {
    const res = await BILLING(req(admin, '/api/admin/billing?month=2026-11'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ month: '2026-11', closed: null, totals: { reconciled: true } });
    expect((await BILLING(req(sellerA, '/api/admin/billing'))).status).toBe(403);
    expect((await BILLING(req(admin, '/api/admin/billing?month=2026-13'))).status).toBe(400);
  });

  test('the CSV has one line per bucket, user, store and kind, and the summary one line per bucket and the ledger', async () => {
    const lines = parseCsv(await (await CSV(req(admin, '/api/admin/billing/csv?month=2026-11'))).text());
    expect(lines[0]![0]).toMatch(/^Creative Video Studio billing 2026-11 as_of \d+ open$/);
    expect(lines[1]).toEqual(['month', 'bucket', 'team or partner', 'user', 'store', 'kind', 'USD']);
    const body = lines.slice(2);
    expect(body).toHaveLength(11);
    expect(body).toContainEqual(['2026-11', 'team:sales-a', 'Sales A', 'User 1', 'A Shop', 'estimate', '20.0000']);
    expect(body).toContainEqual(['2026-11', 'partner:ws_p', 'Partner P', 'User 5', 'Partner Shop', 'llm', '2.5000']);
    expect(body).toContainEqual(['2026-11', 'company:shared', 'Chi phí chung', '', '', 'invoice_diff', '10.0000']);
    const total = body.reduce((t, r) => t + Math.round(Number(r[6]) * 10_000), 0);
    expect(total).toBe(497_500); // the ledger's 49.75

    const summary = parseCsv(await (await CSV(req(admin, '/api/admin/billing/csv?month=2026-11&part=summary'))).text());
    expect(summary[1]).toEqual(['month', 'bucket', 'name', 'total USD', 'free USD', 'payable USD']);
    expect(summary.slice(2)).toEqual([
      ['2026-11', 'team:sales-a', 'Sales A', '24.7500', '20.0000', '4.7500'],
      ['2026-11', 'team:sales-b', 'Sales B', '6.0000', '5.0000', '1.0000'],
      ['2026-11', 'partner:ws_p', 'Partner P', '2.5000', '0.0000', '2.5000'],
      ['2026-11', 'company:before_start', 'Trước tháng tính phí (11/2026)', '0.0000', '0.0000', '0.0000'],
      ['2026-11', 'company:shared', 'Chi phí chung', '9.0000', '0.0000', '0.0000'],
      ['2026-11', 'company:system', 'Tài khoản hệ thống', '0.5000', '0.0000', '0.0000'],
      ['2026-11', 'company:non_billing', 'Nhóm không tính phí', '7.0000', '0.0000', '0.0000'],
      ['2026-11', 'ledger', 'Tổng sổ cái', '49.7500', '', '8.2500'],
    ]);
    expect((await CSV(req(admin, '/api/admin/billing/csv?part=x'))).status).toBe(400);
  });
});

describe('closing a month', () => {
  test('freezes a past month’s figures until an Admin reopens it, both audited; this month cannot be closed', async () => {
    const thisMonth = (await pool.query(`select to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as m`)).rows[0].m as string;
    expect((await CLOSE(req(admin, '/api/admin/billing/close', 'POST', { month: thisMonth }))).status).toBe(409);
    expect((await CLOSE(req(sellerA, '/api/admin/billing/close', 'POST', { month: '2026-10' }))).status).toBe(403);
    const before = await billingMonth('2026-10');
    expect(before.canClose).toBe(true);
    expect((await CLOSE(req(admin, '/api/admin/billing/close', 'POST', { month: '2026-10' }))).status).toBe(200);
    expect((await CLOSE(req(admin, '/api/admin/billing/close', 'POST', { month: '2026-10' }))).status).toBe(409);

    // A late row and a renamed store change nothing in a closed month: the view and the CSV read the snapshot.
    await row('late-old', '2026-10', '5.0000', { user: sellerA.id });
    const closed = await billingMonth('2026-10');
    expect(closed.closed).toMatchObject({ by: 'User 6' });
    expect(closed.canClose).toBe(false);
    expect({ totals: closed.totals, lines: closed.lines, asOf: closed.asOf }).toEqual({ totals: before.totals, lines: before.lines, asOf: before.asOf });
    const csv = parseCsv(await (await CSV(req(admin, '/api/admin/billing/csv?month=2026-10&part=summary'))).text());
    expect(csv[0]![0]).toMatch(/ closed \d{4}-\d{2}-\d{2}$/);
    expect(csv.at(-1)).toEqual(['2026-10', 'ledger', 'Tổng sổ cái', before.totals.ledgerUsd, '', '0.0000']);

    expect((await REOPEN(req(admin, '/api/admin/billing/close?month=2026-10', 'DELETE'))).status).toBe(200);
    expect((await REOPEN(req(admin, '/api/admin/billing/close?month=2026-10', 'DELETE'))).status).toBe(404);
    expect((await billingMonth('2026-10')).totals.ledgerUsd).toBe((Number(before.totals.ledgerUsd) + 5).toFixed(4)); // live again, with the late row
    const audits = (await pool.query(`select action from audit_entries where target = 'billing:2026-10' order by id`)).rows.map((r) => r.action);
    expect(audits).toEqual(['billing.close', 'billing.send', 'billing.reopen']); // the close mail is off here: no Lark app
    expect((await pool.query(`select new_value from audit_entries where action = 'billing.send' and target = 'billing:2026-10'`)).rows[0].new_value).toBe('off');
  });
});

describe('mailing a closed month to accounting', () => {
  /** What the fake Lark saw. A message to `refuse` is answered with a Lark error code; `down` makes every call fail like a network error. */
  let seen: { url: string; body: unknown }[];
  const lark = (opts: { refuse?: string; down?: boolean } = {}) => {
    seen = [];
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      expect(u).toMatch(/^https:\/\/open\.larksuite\.com\/open-apis\//);
      seen.push({ url: u.replace('https://open.larksuite.com/open-apis', ''), body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body });
      if (opts.down) throw new TypeError('fetch failed');
      const body = seen.at(-1)!.body as { receive_id?: string };
      const code = u.includes('/im/v1/messages') && body.receive_id === opts.refuse ? 230002 : 0;
      return new Response(JSON.stringify({ code, msg: code ? 'bot not in chat' : 'ok', tenant_access_token: 't-1', data: { file_key: 'file_v2_x' } }));
    });
  };
  const configure = (to: string | undefined, app = true) => {
    for (const [k, v] of Object.entries({ LARK_APP_ID: app ? 'cli_x' : undefined, LARK_APP_SECRET: app ? 's' : undefined, FAL_ALERT_LARK_TO: to })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  const close = (month: string) => CLOSE(req(admin, '/api/admin/billing/close', 'POST', { month }));
  const reopen = (month: string) => REOPEN(req(admin, `/api/admin/billing/close?month=${month}`, 'DELETE'));
  const sendAudit = async (month: string) => (await pool.query(`select new_value from audit_entries where action = 'billing.send' and target = $1 order by id desc limit 1`, [`billing:${month}`])).rows[0]?.new_value;
  afterEach(() => {
    vi.unstubAllGlobals();
    configure(undefined, false);
  });

  test('sends each recipient the summary and the month’s CSV as a file, and says how many it reached', async () => {
    configure('a@vet.test, ou_b');
    lark();
    const res = await close('2026-08');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ month: '2026-08', closed: true, lark: { sent: 2, failed: [] } });
    // Per receiver: the token, the text, the token again, the upload, the file message.
    const token = '/auth/v3/tenant_access_token/internal';
    expect(seen.map((c) => c.url)).toEqual([
      ...[token, '/im/v1/messages?receive_id_type=email', token, '/im/v1/files', '/im/v1/messages?receive_id_type=email'],
      ...[token, '/im/v1/messages?receive_id_type=open_id', token, '/im/v1/files', '/im/v1/messages?receive_id_type=open_id'],
    ]);
    const closed = await billingMonth('2026-08');
    const text = JSON.parse((seen[1]!.body as { content: string }).content).text as string;
    expect(text).toBe(
      [
        'Creative Video Studio: đã chốt chi phí tháng 2026-08.',
        `Tổng sổ cái: $${Number(closed.totals.ledgerUsd).toFixed(2)}`,
        'Team phải trả: $0.00',
        'Đối tác phải trả: $0.00',
        `Phần của công ty: $${Number(closed.totals.companyUsd).toFixed(2)}`,
        'Chi tiết trong tệp CSV gửi kèm.',
      ].join('\n'),
    );
    const upload = seen[3]!.body as FormData;
    expect(upload.get('file_name')).toBe('cvs-chi-phi-2026-08.csv');
    expect(await (upload.get('file') as File).text()).toBe(await (await CSV(req(admin, '/api/admin/billing/csv?month=2026-08'))).text()); // the CSV route's content
    expect([...new Uint8Array(await (upload.get('file') as File).arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // the BOM Excel needs for UTF-8
    expect(seen[4]!.body).toEqual({ receive_id: 'a@vet.test', msg_type: 'file', content: '{"file_key":"file_v2_x"}' });
    expect(await sendAudit('2026-08')).toEqual({ sent: 2, failed: [] });
    await reopen('2026-08');
  });

  test('a recipient Lark refuses is listed and the others are still sent; the month stays closed', async () => {
    configure('a@vet.test,ou_b');
    lark({ refuse: 'ou_b' });
    const res = await close('2026-07');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ month: '2026-07', closed: true, lark: { sent: 1, failed: ['lark /im/v1/messages: HTTP 200 code 230002 bot not in chat'] } });
    expect((await billingMonth('2026-07')).closed).not.toBeNull();
    expect(await sendAudit('2026-07')).toMatchObject({ sent: 1, failed: [expect.stringContaining('230002')] });
    await reopen('2026-07');
  });

  test('with Lark down the close still commits, and the outcome says nobody was reached', async () => {
    configure('a@vet.test,b@vet.test');
    lark({ down: true });
    const res = await close('2026-06');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ month: '2026-06', closed: true, lark: { sent: 0, failed: ['a@vet.test: fetch failed', 'b@vet.test: fetch failed'] } });
    expect((await billingMonth('2026-06')).closed).not.toBeNull();
    expect((await close('2026-06')).status).toBe(409); // closed, and not closed twice
    await reopen('2026-06');
  });

  test('is off, and calls nothing, without the Lark app or without recipients', async () => {
    for (const [to, app] of [['a@vet.test', false], [undefined, true], ['', true]] as const) {
      configure(to, app);
      lark();
      expect(await (await close('2026-04')).json()).toEqual({ month: '2026-04', closed: true, lark: 'off' });
      expect(seen).toEqual([]);
      expect(await sendAudit('2026-04')).toBe('off');
      await reopen('2026-04');
    }
  });

  test('closing again after a reopen sends again', async () => {
    configure('ou_b');
    lark();
    await close('2026-03');
    await reopen('2026-03');
    await close('2026-03');
    expect(seen.filter((c) => c.url.startsWith('/im/v1/files'))).toHaveLength(2);
    await reopen('2026-03');
  });
});

describe('the automatic close', () => {
  // `now` is passed in, so these run in 2026-11 itself: the month closed is 2026-11, the first one billed, which is "past" only for an `at` of December.
  const at = (iso: string) => new Date(iso);
  /** The previous month as if never closed: no snapshot and no `billing.close` audit row. */
  const forget = async () => {
    await pool.query(`delete from billing_month_closes where month = '2026-11'`);
    await pool.query(`delete from audit_entries where target = 'billing:2026-11'`);
  };
  let sent: unknown[];
  const larkOn = () => {
    sent = [];
    process.env.LARK_APP_ID = 'cli_x';
    process.env.LARK_APP_SECRET = 's';
    process.env.FAL_ALERT_LARK_TO = 'a@vet.test';
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(url), body: init?.body });
      return new Response(JSON.stringify({ code: 0, msg: 'ok', tenant_access_token: 't-1', data: { file_key: 'file_v2_x' } }));
    });
  };
  afterEach(async () => {
    vi.unstubAllGlobals();
    for (const k of ['LARK_APP_ID', 'LARK_APP_SECRET', 'FAL_ALERT_LARK_TO']) delete process.env[k];
    await forget();
  });

  test('waits for 08:00 ICT on day 1 and for nothing else', async () => {
    larkOn();
    expect(await autoCloseLastMonth(at('2026-12-01T07:59:59+07:00'))).toEqual({ month: '2026-11', did: 'early' });
    expect(await autoCloseLastMonth(at('2026-11-30T23:00:00Z'))).toEqual({ month: '2026-11', did: 'early' }); // 06:00 ICT on 1 December
    expect((await billingMonth('2026-11')).closed).toBeNull();
    expect(sent).toEqual([]);
  });

  test('does nothing for a month before the billing start', async () => {
    expect(await autoCloseLastMonth(at('2026-11-01T09:00:00+07:00'))).toEqual({ month: '2026-10', did: 'before-start' });
    expect((await billingMonth('2026-10')).closed).toBeNull();
  });

  test('closes the previous month from 08:00 on day 1, as the system, and mails it once', async () => {
    larkOn();
    const done = await autoCloseLastMonth(at('2026-12-01T08:00:00+07:00'));
    expect(done).toEqual({ month: '2026-11', did: 'closed', lark: { sent: 1, failed: [] } });
    expect((await billingMonth('2026-11')).closed).toMatchObject({ by: null });
    expect(sent.filter((c) => (c as { url: string }).url.includes('/im/v1/files'))).toHaveLength(1);
    expect((await pool.query(`select actor_id, action from audit_entries where target = 'billing:2026-11' order by id`)).rows).toEqual([
      { actor_id: null, action: 'billing.close' },
      { actor_id: null, action: 'billing.send' },
    ]);
    // Every later hour finds it closed: no second close, no second mail.
    expect(await autoCloseLastMonth(at('2026-12-01T09:00:00+07:00'))).toEqual({ month: '2026-11', did: 'already' });
    expect(sent.filter((c) => (c as { url: string }).url.includes('/im/v1/files'))).toHaveLength(1);
  });

  test('a month an Admin reopened stays open', async () => {
    larkOn();
    await autoCloseLastMonth(at('2026-12-01T08:00:00+07:00'));
    expect(await reopenMonth('2026-11', admin.id)).toBe(true);
    expect(await autoCloseLastMonth(at('2026-12-01T10:00:00+07:00'))).toEqual({ month: '2026-11', did: 'already' });
    expect(await autoCloseLastMonth(at('2026-12-02T10:00:00+07:00'))).toEqual({ month: '2026-11', did: 'already' });
    expect((await billingMonth('2026-11')).closed).toBeNull();
  });

  test('closes later in the month when the server missed 08:00, and closes without Lark', async () => {
    expect(await autoCloseLastMonth(at('2026-12-20T03:00:00+07:00'))).toEqual({ month: '2026-11', did: 'closed', lark: 'off' });
    expect((await billingMonth('2026-11')).closed).toMatchObject({ by: null });
  });
});

describe('the forecast of the open month', () => {
  test('is the open month’s alone, for the ledger and each billing team, and never reaches a closed or past month', async () => {
    const thisMonth = (await pool.query(`select to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as m`)).rows[0].m as string;
    await row('fc-a', thisMonth, '3.0000', { user: sellerA.id }); // the ledger is append-only: the row stays, so this describe runs last
    const m = await billingMonth(thisMonth);
    expect(m.canClose).toBe(false);
    expect(Object.keys(m.forecast!.teams)).toEqual(['sales-a', 'sales-b']);
    // At least the total so far: the month cannot be shorter than its elapsed part (the maths itself is in lib/forecast.test.ts).
    expect(Number(m.forecast!.teams['sales-a'])).toBeGreaterThanOrEqual(Number(m.teams.find((t) => t.id === 'sales-a')!.totalUsd));
    expect(Number(m.forecast!.ledgerUsd)).toBeGreaterThanOrEqual(Number(m.totals.ledgerUsd));
    expect((await billingMonth('2026-09')).forecast).toBeNull(); // a past month, open
    expect((await billingMonth('2099-01')).forecast).toBeNull(); // a later month
  });

  test('a closed month carries none', async () => {
    expect((await CLOSE(req(admin, '/api/admin/billing/close', 'POST', { month: '2026-05' }))).status).toBe(200);
    try {
      expect((await billingMonth('2026-05')).forecast).toBeNull();
    } finally {
      await REOPEN(req(admin, '/api/admin/billing/close?month=2026-05', 'DELETE'));
    }
  });
});
