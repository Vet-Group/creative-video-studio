// Integration test of GET /api/admin/report against a disposable database on the compose Postgres (`pnpm services:up`).
// The fixture has jobs on both sides of ICT week boundaries (Monday 00:00 +07), with hand-computed expected numbers.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { reserve } = await import('@cvs/core/ledger');
const { GET } = await import('./report/route');
const { GET: GET_CSV } = await import('./report/csv/route');

const PASSWORD = 'correct-horse-battery';

async function newUser(email: string, role: 'member' | 'admin') {
  const id = (await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}

const call = (cookie: string | undefined, query = '') => new Request(`http://localhost/api/admin/report${query}`, { headers: cookie ? { cookie } : {} });

interface Report {
  week: { start: string; end: string };
  cap: { month: string; monthlyCapUsd: string; usedUsd: string; memberDailyClipCap: number };
  users: { userId: string; name: string; team: string; jobs: number; acceptedClips: number; spendUsd: string; costPerAcceptedUsd: string | null; medianRunSeconds: number | null; failureRate: number | null; spendOfCap: string }[];
}
let admin: Awaited<ReturnType<typeof newUser>>;
let member: Awaited<ReturnType<typeof newUser>>;
const report = async (query = '') => {
  const res = await GET(call(admin.cookie, query));
  expect(res.status).toBe(200);
  return (await res.json()) as Report;
};

/** A job of the user created at `createdAt` (+07), with a ledger estimate of `usd`, ended with `status` after `seconds`, and an optional verdict. */
async function job(id: string, userId: string, createdAt: string, status: string, seconds: number, usd: string, verdict?: 'pass' | 'fail') {
  await pool.query(
    `insert into jobs (id, user_id, team_id, store_id, model, provider, prompt, aspect, duration_s, input_asset_ids, created_at)
     values ($1, $2, 'rt', 'rs', 'fal-test', 'fal', 'p', '9:16', 5, '{}', $3)`,
    [id, userId, createdAt],
  );
  await reserve(pool, id, usd);
  await pool.query(`update jobs set status = $2, finished_at = created_at + make_interval(secs => $3) where id = $1`, [id, status, seconds]);
  if (verdict) {
    await pool.query(`insert into verdicts (id, job_id, verdict, fault, marked_by) values ($1, $2, $3, $4, $5)`, [`v-${id}`, id, verdict, verdict === 'fail' ? 'other' : null, admin.id]);
  }
}

beforeAll(async () => {
  admin = await newUser('admin@example.test', 'admin');
  member = await newUser('member@example.test', 'member');
  await pool.query(`insert into teams (id, name) values ('rt', 'Report Team')`);
  await pool.query(`insert into stores (id, name, code) values ('rs', 'Report Shop', 'RS')`);
  await pool.query(`insert into users (id, email, name, team_id) values ('rep1', 'rep1@example.test', 'Rep One', 'rt'), ('rep2', 'rep2@example.test', 'Rep Two', 'rt')`);
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
     values ('fal-test', 'fal', 'x', 'Fal test', '{9:16}', '{5}', 2, '720p', 0.2, '{}', true)`,
  );
  // Week of Monday 2026-10-12 (ICT): its first and last second, and a job that ends after the week does.
  await job('r1', 'rep1', '2026-10-12 00:00:00+07', 'succeeded', 100, '2.0000', 'pass');
  await job('r2', 'rep1', '2026-10-18 23:59:59+07', 'succeeded', 200, '3.0000', 'pass');
  await job('r3', 'rep1', '2026-10-15 12:00:00+07', 'failed', 50, '1.0000');
  await job('r4', 'rep1', '2026-10-16 09:00:00+07', 'succeeded', 300, '2.0000', 'fail');
  await job('r5', 'rep2', '2026-10-13 10:00:00+07', 'succeeded', 60, '1.5000', 'pass');
  await job('r6', 'rep2', '2026-10-14 10:00:00+07', 'timed_out', 600, '1.5000');
  // One second before and exactly at the boundaries of that week.
  await job('r7', 'rep1', '2026-10-11 23:59:59+07', 'succeeded', 30, '9.0000', 'pass');
  await job('r8', 'rep1', '2026-10-19 00:00:00+07', 'succeeded', 10, '7.0000', 'pass');
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

describe('GET /api/admin/report', () => {
  test('answers 401 without a session and 403 to a Member', async () => {
    expect((await GET(call(undefined))).status).toBe(401);
    expect((await GET(call(member.cookie))).status).toBe(403);
  });

  test('gives the weekly KPIs per user for the week of any date in it, with hand-computed numbers', async () => {
    const r = await report('?week=2026-10-14');
    expect(r.week).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    // The cap is the ledger usage of the month the week starts in: 2 + 3 + 1 + 2 + 1.5 + 1.5 + 9 + 7, plus the bake-off rows
    // migration 0012 books for October (5.6 + 13.872).
    expect(r.cap).toEqual({ month: '2026-10', monthlyCapUsd: '200.0000', usedUsd: '46.4720', memberDailyClipCap: 5 });
    expect(r.users).toEqual([
      // r1..r4: 2 accepted (r1, r2); spend 2 + 3 + 1 + 2 = 8; 8 / 2 = 4; succeeded times 100, 200, 300 -> median 200; 1 of 4 failed; 8 / 200 of the cap.
      { userId: 'rep1', name: 'Rep One', email: 'rep1@example.test', team: 'Report Team', jobs: 4, acceptedClips: 2, spendUsd: '8.0000', costPerAcceptedUsd: '4.0000', medianRunSeconds: 200, failureRate: 0.25, spendOfCap: '0.0400' },
      // r5, r6: 1 accepted; spend 3; 3 / 1; one succeeded in 60 s; the timed-out job is 1 of 2; 3 / 200.
      { userId: 'rep2', name: 'Rep Two', email: 'rep2@example.test', team: 'Report Team', jobs: 2, acceptedClips: 1, spendUsd: '3.0000', costPerAcceptedUsd: '3.0000', medianRunSeconds: 60, failureRate: 0.5, spendOfCap: '0.0150' },
    ]);
  });

  test('puts a job at 00:00:00 ICT on Monday in the new week and one a second earlier in the old week', async () => {
    const next = await report('?week=2026-10-19');
    expect(next.week).toEqual({ start: '2026-10-19', end: '2026-10-25' });
    expect(next.users).toEqual([
      { userId: 'rep1', name: 'Rep One', email: 'rep1@example.test', team: 'Report Team', jobs: 1, acceptedClips: 1, spendUsd: '7.0000', costPerAcceptedUsd: '7.0000', medianRunSeconds: 10, failureRate: 0, spendOfCap: '0.0350' },
    ]);
    const before = await report('?week=2026-10-05');
    expect(before.week).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    expect(before.users).toEqual([
      { userId: 'rep1', name: 'Rep One', email: 'rep1@example.test', team: 'Report Team', jobs: 1, acceptedClips: 1, spendUsd: '9.0000', costPerAcceptedUsd: '9.0000', medianRunSeconds: 30, failureRate: 0, spendOfCap: '0.0450' },
    ]);
    expect((await report('?week=2026-09-28')).users).toEqual([]);
  });

  test('defaults to the current week, which starts on a Monday', async () => {
    const r = await report();
    expect(new Date(`${r.week.start}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(new Date(`${r.week.end}T00:00:00Z`).getUTCDay()).toBe(0);
  });

  test.each(['x', '2026-13-01', '2026-02-30', '2026-10-1'])('answers 400 for ?week=%s', async (week) => {
    expect((await GET(call(admin.cookie, `?week=${week}`))).status).toBe(400);
  });

  test('the CSV starts with a BOM, has the columns in order and one hand-computed line per user; a Member gets 403', async () => {
    const csvCall = (cookie: string | undefined, query = '') => GET_CSV(new Request(`http://localhost/api/admin/report/csv${query}`, { headers: cookie ? { cookie } : {} }));
    expect((await csvCall(undefined)).status).toBe(401);
    expect((await csvCall(member.cookie)).status).toBe(403);
    expect((await csvCall(admin.cookie, '?week=2026-02-30')).status).toBe(400);

    const res = await csvCall(admin.cookie, '?week=2026-10-14');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="cvs-report-2026-10-12.csv"');
    const bytes = Buffer.from(await res.arrayBuffer()); // text() would drop the BOM
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.toString('utf8').slice(1).split('\r\n')).toEqual([
      'Creative Video Studio report 2026-10-12 to 2026-10-18',
      'week start,user,email,team,jobs,accepted clips,spend USD,cost per accepted clip USD,median run seconds,failure rate,spend of cap',
      '2026-10-12,Rep One,rep1@example.test,Report Team,4,2,8.0000,4.0000,200,0.25,0.0400',
      '2026-10-12,Rep Two,rep2@example.test,Report Team,2,1,3.0000,3.0000,60,0.5,0.0150',
      '',
    ]);
  });

  test('a hidden team and a hidden store keep their history in the report', async () => {
    const before = await report('?week=2026-10-14');
    await pool.query(`update teams set hidden = true where id = 'rt'`);
    await pool.query(`update stores set hidden = true where id = 'rs'`);
    expect(await report('?week=2026-10-14')).toEqual(before);
    expect(before.users.map((u) => u.team)).toEqual(['Report Team', 'Report Team']);
  });
});
