// Billing teams (docs/BILLING.md): a member of a billing team, an Admin too, runs company jobs only for their team's stores, on every path that sets a
// job's store; everyone else keeps every open store. Against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { stopBoss } = await import('@/lib/queue');
const { POST } = await import('./route');
const { GET: JOB } = await import('./[id]/route');
const { GET: PICKER } = await import('../stores/route');
const { PUT: REASSIGN } = await import('../admin/jobs/[id]/store/route');
const { ApiError, errorText, STORE_TEAM_TEXT } = await import('@/lib/api');

const PASSWORD = 'correct-horse-battery';
const base = { modelId: 'fal-test', presetId: 'gentle-push-in', ratio: '9:16', durationSec: 5 };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let seq = 0;
async function newUser(teamId: string, role: 'member' | 'admin' = 'member') {
  const email = `b${++seq}@example.test`;
  const { user } = await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role, data: { teamId } } });
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, $2, 'input', $1, 'a.png', 'image/png', 1, 'ws_vet')`, [`${user.id}-a`, user.id]);
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id: user.id, asset: `${user.id}-a`, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}
type User = Awaited<ReturnType<typeof newUser>>;
const req = (u: User, path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { cookie: u.cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const run = (u: User, extra: Record<string, unknown> = {}) => POST(req(u, '/api/jobs', 'POST', { ...base, assetIds: [u.asset], ...extra }));
const picker = async (u: User) => ((await (await PICKER(req(u, '/api/stores'))).json()) as { stores: { id: string }[] }).stores.map((s) => s.id);
const storeOf = async (job: string) => (await pool.query('select store_id from jobs where id = $1', [job])).rows[0].store_id as string | null;
async function oldJob(u: User, status: string, storeId: string) {
  const id = `old-${u.id}-${status}`;
  await pool.query(
    `insert into jobs (id, user_id, team_id, store_id, model, provider, preset_id, prompt, aspect, duration_s, input_asset_ids, status, workspace_id)
     values ($1, $2, 'sales-a', $3, 'fal-test', 'fal', 'gentle-push-in', 'p', '9:16', 5, $5, $4, 'ws_vet')`,
    [id, u.id, storeId, status, [u.asset]],
  );
  if (status === 'succeeded') await pool.query(`update jobs set output_asset_id = $2 where id = $1`, [id, u.asset]);
  return id;
}

let sellerA: User; // in billing team A
let adminA: User; // an Admin in billing team A
let designer: User; // in a team that is not billed

beforeAll(async () => {
  await pool.query(`insert into teams (id, name, billable) values ('sales-a', 'Sales A', true), ('sales-b', 'Sales B', true), ('design', 'Design', false)`);
  await pool.query(
    `insert into stores (id, name, code, workspace_id, team_id) values
       ('st-a', 'A Shop', 'A', 'ws_vet', 'sales-a'), ('st-b', 'B Shop', 'B', 'ws_vet', 'sales-b'), ('st-free', 'No-team Shop', 'F', 'ws_vet', null)`,
  );
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
     values ('fal-test', 'fal', 'x', 'Fal test', '{9:16}', '{5}', 2, '720p', 0.2, '{}', true)`,
  );
  await pool.query(`update model_configs set enabled = false where id in ('veo-3.1', 'veo-3.1-vertex')`);
  [sellerA, adminA, designer] = [await newUser('sales-a'), await newUser('sales-a', 'admin'), await newUser('design')];
});
afterAll(async () => {
  try {
    await stopBoss();
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

describe('the store picker', () => {
  test('lists only the team’s stores to a member or an Admin of a billing team, and every open store to anyone else', async () => {
    expect(await picker(sellerA)).toEqual(['st-a']);
    expect(await picker(adminA)).toEqual(['st-a']);
    expect((await picker(designer)).sort()).toEqual(['st-a', 'st-b', 'st-free']);
  });

  test('follows the team: a store given to the team appears, and a member moved out of the billing team sees every store again', async () => {
    await pool.query(`update stores set team_id = 'sales-a' where id = 'st-free'`);
    try {
      expect((await picker(sellerA)).sort()).toEqual(['st-a', 'st-free']);
    } finally {
      await pool.query(`update stores set team_id = null where id = 'st-free'`);
    }
    const mover = await newUser('sales-a');
    await pool.query(`update users set team_id = 'design' where id = $1`, [mover.id]);
    expect((await picker(mover)).sort()).toEqual(['st-a', 'st-b', 'st-free']);
  });
});

describe('POST /api/jobs with a store', () => {
  test('a member of a billing team runs for their team’s store or none, and is refused another team’s or a store of no team with 403', async () => {
    expect((await run(sellerA, { storeId: 'st-a' })).status).toBe(201);
    expect((await run(sellerA)).status).toBe(201); // not choosing a store stays allowed
    for (const storeId of ['st-b', 'st-free']) {
      const res = await run(sellerA, { storeId });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'a member of a billing team runs jobs only for the stores of their team', code: 'store_not_in_team' });
    }
    expect((await pool.query(`select count(*)::int as n from jobs where user_id = $1 and store_id is distinct from 'st-a' and store_id is not null`, [sellerA.id])).rows[0].n).toBe(0);
  });

  test('holds for an Admin in a billing team too, and not for a member of another team', async () => {
    expect((await run(adminA, { storeId: 'st-b' })).status).toBe(403);
    expect((await run(designer, { storeId: 'st-b' })).status).toBe(201);
    expect((await run(designer, { storeId: 'st-free' })).status).toBe(201);
  });

  test('the form shows the refusal in Vietnamese', () => {
    expect(errorText(new ApiError(403, 'x', null, 'store_not_in_team'), 'fallback')).toBe(STORE_TEAM_TEXT);
    expect(errorText(new ApiError(403, 'x'), 'fallback')).toBe('fallback');
  });
});

describe('retry, rerun and reuse of a job whose store now belongs to another team', () => {
  // Decision: the store is dropped (the job runs with no store), as a rerun drops a store hidden since, so the run never bills the other team.
  test('a retry keeps the job but drops the store; a retry of a job of the team’s own store keeps it', async () => {
    const other = await newUser('sales-a');
    const failed = await oldJob(other, 'failed', 'st-b');
    const res = await run(other, { retryOf: failed });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(await storeOf(id)).toBeNull();
    expect((await pool.query(`select store_id from cost_entries where job_id = $1`, [id])).rows).toEqual([{ store_id: null }]);

    const own = await newUser('sales-a');
    const ok = await oldJob(own, 'timed_out', 'st-a');
    expect(await storeOf(((await (await run(own, { retryOf: ok })).json()) as { id: string }).id)).toBe('st-a');
  });

  test('a rerun drops it too, and a member outside billing teams keeps it', async () => {
    const seller = await newUser('sales-a');
    const done = await oldJob(seller, 'succeeded', 'st-b');
    const res = await run(seller, { rerunOf: done, maxUsd: 100 });
    expect(res.status).toBe(201);
    expect(await storeOf(((await res.json()) as { id: string }).id)).toBeNull();
    expect((await pool.query(`select count(*)::int as n from user_stores where user_id = $1`, [seller.id])).rows[0].n).toBe(0);

    const free = await newUser('design');
    const theirs = await oldJob(free, 'succeeded', 'st-b');
    expect(await storeOf(((await (await run(free, { rerunOf: theirs, maxUsd: 100 })).json()) as { id: string }).id)).toBe('st-b');
  });

  test('Reuse gets no store and is told the store is lost, so the form never sends it', async () => {
    const seller = await newUser('sales-a');
    const done = await oldJob(seller, 'succeeded', 'st-b');
    expect(await (await JOB(req(seller, `/api/jobs/${done}`), ctx(done))).json()).toMatchObject({ storeId: null, storeLost: true });
    // Another member may reuse a Library clip: they get the store when they may pick it.
    expect(await (await JOB(req(designer, `/api/jobs/${done}`), ctx(done))).json()).toMatchObject({ storeId: 'st-b', storeLost: false });
  });

  test('the Admin store tool still moves a job to any store', async () => {
    const job = await oldJob(sellerA, 'succeeded', 'st-a');
    const res = await REASSIGN(req(adminA, `/api/admin/jobs/${job}/store`, 'PUT', { storeId: 'st-b' }), ctx(job));
    expect(res.status).toBe(200);
    expect(await storeOf(job)).toBe('st-b');
  });
});
