// Integration test of GET /api/admin/overview against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { reserve } = await import('@cvs/core/ledger');
const { audit } = await import('@cvs/core/audit');
const { GET } = await import('./overview/route');

const PASSWORD = 'correct-horse-battery';

async function newUser(email: string, role: 'member' | 'admin') {
  const id = (await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}

const call = (cookie: string | undefined) => new Request('http://localhost/api/admin/overview', { headers: cookie ? { cookie } : {} });

interface Overview {
  month: string;
  video: { usd: string; monthlyCapUsd: string };
  features: { usd: string; monthlyCapUsd: string };
  jobs: { today: number; succeeded: number; failed: number; running: number };
  users: { active: number; locked: number };
  models: { enabled: number; total: number };
  audit: { actorName: string; action: string; target: string }[];
}
let admin: Awaited<ReturnType<typeof newUser>>;
let member: Awaited<ReturnType<typeof newUser>>;
const overview = async () => {
  const res = await GET(call(admin.cookie));
  expect(res.status).toBe(200);
  return (await res.json()) as Overview;
};

const START_OF_TODAY = `(date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh')`;

/** A job of the member created at the SQL time `at`, holding `usd` on the ledger, then set to `status`. */
async function job(id: string, at: string, status: string, usd: string, feature = 'video') {
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, feature, created_at)
     values ($1, $2, 'ot', 'fal-test', 'fal', 'p', '9:16', 5, '{}', $3, ${at})`,
    [id, member.id, feature],
  );
  await reserve(pool, id, usd);
  await pool.query('update jobs set status = $2 where id = $1', [id, status]);
}

beforeAll(async () => {
  admin = await newUser('admin@example.test', 'admin');
  member = await newUser('member@example.test', 'member');
  await pool.query(`insert into teams (id, name) values ('ot', 'Overview Team')`);
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
     values ('fal-test', 'fal', 'x', 'Fal test', '{9:16}', '{5}', 2, '720p', 0.2, '{}', true)`,
  );
  await job('o1', 'now()', 'succeeded', '2.0000');
  await job('o2', 'now()', 'failed', '1.0000');
  await job('o3', 'now()', 'timed_out', '0.5000');
  await job('o4', 'now()', 'running', '0.2500');
  await job('o5', 'now()', 'succeeded', '0.7500', 'image');
  // A second before today began (ICT): not one of today's jobs, and a zero hold so the month totals do not depend on the run date.
  await job('o6', `${START_OF_TODAY} - interval '1 second'`, 'succeeded', '0.0000');
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

describe('GET /api/admin/overview', () => {
  test('answers 401 without a session and 403 to a Member', async () => {
    expect((await GET(call(undefined))).status).toBe(401);
    expect((await GET(call(member.cookie))).status).toBe(403);
  });

  test("splits this month's spend into the video and the image-and-apps budgets, with their caps", async () => {
    const o = await overview();
    expect(o.month).toMatch(/^\d{4}-\d{2}$/);
    expect(o.video).toEqual({ usd: '3.7500', monthlyCapUsd: expect.stringMatching(/^\d+\.\d{4}$/) });
    expect(o.features).toEqual({ usd: '0.7500', monthlyCapUsd: expect.stringMatching(/^\d+\.\d{4}$/) });
  });

  test("counts today's jobs by outcome (ICT day) and the jobs still in progress", async () => {
    expect((await overview()).jobs).toEqual({ today: 5, succeeded: 2, failed: 2, running: 1 });
  });

  test('counts active and locked accounts and enabled models', async () => {
    const before = await overview();
    await pool.query('update users set banned = true where id = $1', [member.id]);
    await pool.query(`update model_configs set enabled = false where id = 'fal-test'`);
    const after = await overview();
    expect(after.users).toEqual({ active: before.users.active - 1, locked: before.users.locked + 1 });
    expect(after.models).toEqual({ enabled: before.models.enabled - 1, total: before.models.total });
    await pool.query('update users set banned = false where id = $1', [member.id]);
  });

  test('lists the 5 newest audit entries, newest first, with the actor name', async () => {
    for (let i = 1; i <= 6; i++) await audit(pool, { actorId: admin.id, action: 'team.rename', target: `team:t${i}` });
    const entries = (await overview()).audit;
    expect(entries.map((e) => e.target)).toEqual(['team:t6', 'team:t5', 'team:t4', 'team:t3', 'team:t2']);
    expect(entries[0]).toMatchObject({ actorName: 'admin@example.test', action: 'team.rename' });
  });
});
