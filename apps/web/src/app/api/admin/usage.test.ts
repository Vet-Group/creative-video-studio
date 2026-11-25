// Integration test of GET /api/admin/usage and its CSV against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { reserve } = await import('@cvs/core/ledger');
const { GET } = await import('./usage/route');
const { GET: GET_CSV } = await import('./usage/csv/route');

const PASSWORD = 'correct-horse-battery';

async function newUser(email: string, role: 'member' | 'admin') {
  const id = (await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}

const call = (cookie: string | undefined, query = '', path = 'usage') => new Request(`http://localhost/api/admin/${path}${query}`, { headers: cookie ? { cookie } : {} });

interface Person {
  id: string;
  name: string;
  tags: string[];
  status: string;
  usd: string;
  usdDisplay: string;
  usdAll: string;
  usdAllDisplay: string;
  jobs: number;
  jobsAll: number;
  analyses: number;
  analysesAll: number;
  lastUsedAt: string | null;
  lastSeenAt: string | null;
}
interface Usage {
  period: { from: string; to: string; label: string };
  real: boolean;
  totals: Record<string, number | string>;
  hidden: { people: number };
  teams: { id: string; name: string; excluded: boolean; people: number; using: number; usd: string; usdDisplay: string; users: Person[] }[];
}
let admin: Awaited<ReturnType<typeof newUser>>;
let member: Awaited<ReturnType<typeof newUser>>;
const NOVEMBER = '?from=2026-11-01&to=2026-11-30';
const usage = async (query = NOVEMBER) => {
  const res = await GET(call(admin.cookie, query));
  expect(res.status).toBe(200);
  return (await res.json()) as Usage;
};
const person = (u: Usage, id: string) => u.teams.flatMap((t) => t.users).find((p) => p.id === id);

/** A job of `userId` created at `createdAt` (+07) holding `usd` on the ledger. */
async function job(id: string, userId: string, team: string, createdAt: string, usd: string, isMock = false) {
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, created_at, is_mock, workspace_id)
     values ($1, $2, $3, 'fal-test', 'fal', 'p', '9:16', 5, '{}', $4, $5, 'ws_vet')`,
    [id, userId, team, createdAt, isMock],
  );
  await reserve(pool, id, usd);
}
const analysis = (id: string, userId: string, team: string, createdAt: string) =>
  pool.query(`insert into analyses (id, user_id, team_id, source_key, status, created_at, workspace_id) values ($1, $2, $3, 'k', 'succeeded', $4, 'ws_vet')`, [id, userId, team, createdAt]);

beforeAll(async () => {
  admin = await newUser('admin@example.test', 'admin');
  member = await newUser('member@example.test', 'member');
  await pool.query(`insert into teams (id, name) values ('ut', 'Usage Team')`);
  await pool.query(`insert into teams (id, name, excluded_from_reports) values ('ux', 'Usage Excluded', true)`);
  await pool.query(
    `insert into users (id, email, name, team_id, system, outside_lark, banned) values
       ('u-using', 'using@example.test', 'Using One', 'ut', false, false, false), ('u-lapsed', 'lapsed@example.test', 'Lapsed One', 'ut', false, false, false),
       ('u-analyst', 'analyst@example.test', 'Analyst One', 'ut', false, false, false), ('u-idle', 'idle@example.test', 'Idle One', 'ut', false, false, false),
       ('u-never', 'never@example.test', 'Never One', 'ut', false, false, false), ('u-mock', 'mock@example.test', 'Mock One', 'ut', false, false, false),
       ('u-partner', 'partner@example.test', 'Partner One', 'ut', false, true, false), ('u-sys', 'sys@example.test', 'System One', 'ut', true, false, false),
       ('u-ex', 'ex@example.test', 'Excluded One', 'ux', false, false, false), ('u-banned', 'banned@example.test', 'Banned One', 'ut', false, false, true)`,
  );
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
     values ('fal-test', 'fal', 'x', 'Fal test', '{9:16}', '{5}', 2, '720p', 0.2, '{}', true)`,
  );
  // November 2026 in ICT: its first second, a job inside, and the first second of December.
  await job('uj0', 'u-using', 'ut', '2026-11-01 00:00:00+07', '0.2500');
  await job('uj1', 'u-using', 'ut', '2026-11-10 10:00:00+07', '2.5000');
  await job('uj2', 'u-using', 'ut', '2026-12-01 00:00:00+07', '1.0000');
  // A translation run (an llm row without a job) counts toward its user.
  await pool.query(`insert into cost_entries (kind, usd, month, day, user_id, team_id, ref, is_final, workspace_id) values ('llm', 0.0004, '2026-11', '2026-11-12', 'u-using', 'ut', 'llm:test', true, 'ws_vet')`);
  // The last second of October: outside the period, cost included.
  await job('ul1', 'u-lapsed', 'ut', '2026-10-31 23:59:59+07', '1.0000');
  await analysis('ua1', 'u-analyst', 'ut', '2026-11-15 09:00:00+07');
  await analysis('ua0', 'u-analyst', 'ut', '2026-09-01 09:00:00+07');
  await pool.query(`insert into sessions (id, user_id, token, expires_at) values ('us1', 'u-idle', 'us1', now() + interval '1 hour')`);
  await job('um1', 'u-mock', 'ut', '2026-11-05 10:00:00+07', '0.5000', true); // a mock job is no use and books $0
  await job('up1', 'u-partner', 'ut', '2026-11-20 10:00:00+07', '0.1250'); // a tie: $0.12 shown, as the Costs page rounds
  await job('us1', 'u-sys', 'ut', '2026-11-20 11:00:00+07', '9.0000');
  await analysis('ue1', 'u-ex', 'ux', '2026-11-21 09:00:00+07');
  await job('ub1', 'u-banned', 'ut', '2026-11-21 10:00:00+07', '3.0000');
});

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

describe('GET /api/admin/usage', () => {
  test('answers 401 without a session and 403 to a Member, for the page and its CSV', async () => {
    for (const path of ['usage', 'usage/csv']) {
      const route = path === 'usage' ? GET : GET_CSV;
      expect((await route(call(undefined, NOVEMBER, path))).status).toBe(401);
      expect((await route(call(member.cookie, NOVEMBER, path))).status).toBe(403);
    }
  });

  test.each(['?from=2026-11-05', '?from=2026-11-30&to=2026-11-01', '?from=2026-02-30&to=2026-03-01', '?from=2025-01-01&to=2026-11-30', '?month=2026-13'])(
    'answers 400 for %s',
    async (query) => {
      expect((await GET(call(admin.cookie, query))).status).toBe(400);
      expect((await GET_CSV(call(admin.cookie, query, 'usage/csv'))).status).toBe(400);
    },
  );

  test('lists the real users by current team, with hand-computed figures for the period and of all time', async () => {
    const u = await usage();
    expect(u.period).toMatchObject({ from: '2026-11-01', to: '2026-11-30', label: 'Tháng 11/2026' });
    expect(u.real).toBe(true);
    expect(u.hidden).toEqual({ people: 2 }); // the system account and the excluded team's member; the banned one is nobody
    expect(u.teams.map((t) => [t.name, t.excluded, t.people, t.using, t.usd, t.usdDisplay])).toEqual([
      ['Usage Team', false, 7, 3, '2.8754', '2.88'],
      ['Chưa phân team', false, 2, 0, '0.0000', '0.00'],
    ]);
    // Using first by spend, then the lapsed, the idle and those never seen, by name.
    expect(u.teams[0]!.users.map((p) => [p.name, p.status])).toEqual([
      ['Using One', 'using'],
      ['Partner One', 'using'],
      ['Analyst One', 'using'],
      ['Lapsed One', 'lapsed'],
      ['Idle One', 'idle'],
      ['Mock One', 'never'],
      ['Never One', 'never'],
    ]);
    expect(person(u, 'u-using')).toEqual({
      id: 'u-using', name: 'Using One', email: 'using@example.test', role: 'member', tags: [], status: 'using',
      usd: '2.7504', usdDisplay: '2.75', usdAll: '3.7504', usdAllDisplay: '3.75', jobs: 2, jobsAll: 3, analyses: 0, analysesAll: 0,
      lastUsedAt: new Date('2026-12-01T00:00:00+07:00').toISOString(), lastSeenAt: null,
    });
    expect(person(u, 'u-partner')).toMatchObject({ tags: ['Đối tác'], usd: '0.1250', usdDisplay: '0.12', jobs: 1 });
    expect(person(u, 'u-lapsed')).toMatchObject({ usd: '0.0000', usdAll: '1.0000', jobs: 0, jobsAll: 1, lastUsedAt: new Date('2026-10-31T23:59:59+07:00').toISOString() });
    expect(person(u, 'u-analyst')).toMatchObject({ analyses: 1, analysesAll: 2, jobs: 0, usd: '0.0000' });
    expect(person(u, 'u-idle')).toMatchObject({ lastUsedAt: null, lastSeenAt: expect.any(String) });
    expect(person(u, 'u-mock')).toMatchObject({ jobs: 0, jobsAll: 0, usd: '0.0000', lastUsedAt: null, lastSeenAt: null });
    expect(person(u, admin.id)).toMatchObject({ role: 'admin', status: 'idle' });
    expect(u.totals).toEqual({ people: 9, using: 3, usingPct: 33, lapsed: 1, idle: 3, never: 2, usd: '2.8754', usdDisplay: '2.88', usdAll: '4.8754', usdAllDisplay: '4.88' });
  });

  test('real=0 lists everyone unlocked, tagging system accounts and the excluded teams', async () => {
    const u = await usage(`${NOVEMBER}&real=0`);
    expect(u.real).toBe(false);
    expect(u.hidden).toEqual({ people: 0 });
    expect(u.teams.map((t) => [t.name, t.excluded, t.people, t.using, t.usd])).toEqual([
      ['Usage Team', false, 8, 4, '11.8754'],
      ['Chưa phân team', false, 2, 0, '0.0000'],
      ['Usage Excluded', true, 1, 1, '0.0000'],
    ]);
    expect(u.teams[0]!.users[0]).toMatchObject({ name: 'System One', tags: ['Hệ thống'], status: 'using', usd: '9.0000' });
    expect(person(u, 'u-ex')).toMatchObject({ tags: ['Không tính báo cáo'], status: 'using', analyses: 1 });
    expect(person(u, 'u-banned')).toBeUndefined();
    expect(u.totals).toMatchObject({ people: 11, using: 5, usingPct: 45, usd: '11.8754', usdAll: '13.8754' });
  });

  test('a period before any use leaves the users lapsed or idle, with their all-time figures', async () => {
    const u = await usage('?from=2026-01-01&to=2026-01-31');
    expect(person(u, 'u-using')).toMatchObject({ status: 'lapsed', usd: '0.0000', usdAll: '3.7504', jobs: 0, jobsAll: 3 });
    expect(u.totals).toMatchObject({ using: 0, usd: '0.0000', usdDisplay: '0.00', usdAll: '4.8754' });
    expect(u.teams.map((t) => t.name)).toEqual(['Chưa phân team', 'Usage Team']); // no spend in the period: by name
  });

  test('the CSV starts with a BOM and has one line per person, in the page order, with the status in Vietnamese', async () => {
    const res = await GET_CSV(call(admin.cookie, NOVEMBER, 'usage/csv'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="cvs-usage-2026-11-01-2026-11-30.csv"');
    const body = new Uint8Array(await res.arrayBuffer());
    expect([...body.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(body.slice(3)).trimEnd().split('\r\n');
    expect(lines.slice(0, 4)).toEqual([
      'Creative Video Studio usage 2026-11-01 to 2026-11-30',
      'team,user,email,role,tags,status,spend USD in period,spend USD all time,creations in period,creations all time,video analyses in period,video analyses all time,last used,last signed in',
      'Usage Team,Using One,using@example.test,member,,Có dùng trong khoảng,2.7504,3.7504,2,3,0,0,2026-12-01,',
      'Usage Team,Partner One,partner@example.test,member,Đối tác,Có dùng trong khoảng,0.1250,0.1250,1,1,0,0,2026-11-20,',
    ]);
    expect(lines).toHaveLength(2 + 9);
    expect(lines).toContain('Usage Team,Lapsed One,lapsed@example.test,member,,Ngưng trước khoảng,0.0000,1.0000,0,1,0,0,2026-10-31,');
    const all = new TextDecoder().decode(await (await GET_CSV(call(admin.cookie, `${NOVEMBER}&real=0`, 'usage/csv'))).arrayBuffer());
    expect(all).toContain('Usage Team,System One,sys@example.test,member,Hệ thống,Có dùng trong khoảng,9.0000,9.0000,1,1,0,0,2026-11-20,');
    expect(all).toContain('(all accounts)');
  });
});
