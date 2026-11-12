// Integration test of POST /api/jobs/:id/cancel against a disposable database (needs the compose Postgres: `pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { CANCELED_ERROR } from '@cvs/core/ledger';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { POST } = await import('./[id]/cancel/route');
const { GET: GET_MINE } = await import('./route');
const { dailyClips } = await import('@cvs/core/limits');

const PASSWORD = 'correct-horse-battery';
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const cancel = (id: string, cookie?: string) => POST(new Request(`http://localhost/api/jobs/${id}/cancel`, { method: 'POST', headers: cookie ? { cookie } : {} }), ctx(id));

async function newUser(email: string) {
  const id = (await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role: 'member' } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}

/** A job of the user with its estimate booked. */
async function job(userId: string, status = 'queued'): Promise<string> {
  const id = `job-${randomBytes(4).toString('hex')}`;
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status)
     values ($1, $2, 'team-unassigned', 'kling-o3-pro', 'fal', 'p', '9:16', 5, '{}', $3)`,
    [id, userId, status],
  );
  await pool.query(
    `insert into cost_entries (kind, usd, month, day, user_id, team_id, job_id, is_final)
     select 'estimate', '1.5000', to_char(created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM'), (created_at at time zone 'Asia/Ho_Chi_Minh')::date, user_id, team_id, id, false from jobs where id = $1`,
    [id],
  );
  return id;
}

let alice: Awaited<ReturnType<typeof newUser>>;
let bob: Awaited<ReturnType<typeof newUser>>;

beforeAll(async () => {
  alice = await newUser('alice@example.test');
  bob = await newUser('bob@example.test');
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

describe('POST /api/jobs/:id/cancel', () => {
  test('the owner cancels a queued job: 200, failed with the canceled marker, costing 0, and it frees the daily clip', async () => {
    const id = await job(alice.id);
    expect((await dailyClips(pool, alice.id)).today).toBe(1);
    const res = await cancel(id, alice.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id, status: 'failed', canceled: true });
    expect((await pool.query('select status, error from jobs where id = $1', [id])).rows[0]).toEqual({ status: 'failed', error: CANCELED_ERROR });
    expect((await pool.query('select usd::text, is_final from job_costs where job_id = $1', [id])).rows[0]).toEqual({ usd: '0.0000', is_final: true });
    expect((await dailyClips(pool, alice.id)).today).toBe(0);
    const tray = (await (await GET_MINE(new Request('http://localhost/api/jobs?mine', { headers: { cookie: alice.cookie } }))).json()) as { jobs: { id: string; status: string; error: string }[] };
    expect(tray.jobs.find((j) => j.id === id)).toMatchObject({ status: 'failed', error: CANCELED_ERROR });
  });

  test('a job that already started is 409 with a Vietnamese message, and stays as it was', async () => {
    for (const status of ['submitting', 'running', 'succeeded', 'failed']) {
      const id = await job(alice.id, status);
      const res = await cancel(id, alice.cookie);
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toBe('Job đã bắt đầu chạy, không huỷ được nữa.');
      expect((await pool.query('select status, error from jobs where id = $1', [id])).rows[0]).toEqual({ status, error: null });
    }
  });

  test("another member's job and an unknown id are 404, and a visitor is 401", async () => {
    const id = await job(alice.id);
    expect((await cancel(id, bob.cookie)).status).toBe(404);
    expect((await cancel('no-such-job', bob.cookie)).status).toBe(404);
    expect((await cancel(id)).status).toBe(401);
    expect((await pool.query('select status from jobs where id = $1', [id])).rows[0].status).toBe('queued');
  });

  test('two cancels at once: one wins and the other is told the job is no longer queued', async () => {
    const id = await job(alice.id);
    const codes = (await Promise.all([cancel(id, alice.cookie), cancel(id, alice.cookie)])).map((r) => r.status).sort();
    expect(codes).toEqual([200, 409]);
    expect((await pool.query('select count(*)::int as n from cost_entries where job_id = $1', [id])).rows[0].n).toBe(2);
  });
});
