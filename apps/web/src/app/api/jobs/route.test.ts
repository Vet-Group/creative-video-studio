// Integration test against a disposable database on the compose Postgres (`pnpm services:up`); the pg-boss job lands in the same database.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { stopBoss } = await import('@/lib/queue');
const { POST } = await import('./route');
const { GET } = await import('../stores/route');
const { settle } = await import('@cvs/core/ledger');

const PASSWORD = 'correct-horse-battery';

async function signIn(email: string): Promise<string> {
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  expect(res.status).toBe(200);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

const base = { modelId: 'fal-test', presetId: 'gentle-push-in', ratio: '9:16', durationSec: 5 };
function run(cookie: string | undefined, body: unknown) {
  return POST(new Request('http://localhost/api/jobs', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } }));
}

async function insertAsset(id: string, ownerId: string, extra = '') {
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes${extra ? ', deleted_at' : ''}) values ($1, $2, 'input', $1, 'a.png', 'image/png', 1${extra ? ', now()' : ''})`, [id, ownerId]);
}

const jobCount = async () => (await pool.query('select count(*)::int as n from jobs')).rows[0].n as number;

let ownerId = '';
let ownerCookie = '';
let otherCookie = '';

beforeAll(async () => {
  await pool.query(`insert into teams (id, name) values ('team-b', 'Team B')`);
  await pool.query(`insert into stores (id, name, code, hidden) values ('store-ok', 'Store', 'S1', false), ('store-hidden', 'Hidden', 'S2', true)`);
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled) values
       ('fal-test', 'fal', 'x', 'Fal test', '{9:16,1:1}', '{5,10}', 2, '720p', 0.2, '{}', true),
       ('mock-sample', 'mock', 'mock', 'Mock', '{9:16}', '{5}', 4, '720p', 0.1, '{}', true)`,
  );
  ownerId = (await auth.api.createUser({ body: { email: 'owner@example.test', name: 'Owner', password: PASSWORD, role: 'member', data: { teamId: 'team-b' } } })).user.id;
  await auth.api.createUser({ body: { email: 'other@example.test', name: 'Other', password: PASSWORD, role: 'member' } });
  ownerCookie = await signIn('owner@example.test');
  otherCookie = await signIn('other@example.test');
  const otherId = (await pool.query(`select id from users where email = 'other@example.test'`)).rows[0].id;
  await insertAsset('own-1', ownerId);
  await insertAsset('own-2', ownerId);
  await insertAsset('own-3', ownerId);
  await insertAsset('own-deleted', ownerId, 'deleted');
  await insertAsset('theirs-1', otherId);
});

afterAll(async () => {
  await stopBoss();
  await pool.end();
  await testDb.drop();
});

describe('users.team_id', () => {
  test('is the unassigned team by default and the given team when an Admin sets it', async () => {
    const { rows } = await pool.query(`select email, team_id from users order by email`);
    expect(rows).toEqual([{ email: 'other@example.test', team_id: 'team-unassigned' }, { email: 'owner@example.test', team_id: 'team-b' }]);
  });

  test('cannot be changed by the user through update-user', async () => {
    const body = { name: 'Owner 2', teamId: 'team-unassigned' } as { name: string };
    await auth.api.updateUser({ headers: new Headers({ cookie: ownerCookie }), body }).catch(() => undefined);
    expect((await pool.query(`select team_id from users where id = $1`, [ownerId])).rows[0].team_id).toBe('team-b');
  });
});

describe('POST /api/jobs', () => {
  test('rejects a request without a session', async () => {
    expect((await run(undefined, { ...base, assetIds: ['own-1'] })).status).toBe(401);
  });

  test('creates a queued job with the caller team, the preset prompt and an estimate, and sends it to pg-boss', async () => {
    const res = await run(ownerCookie, { ...base, assetIds: ['own-1', 'own-2'], storeId: 'store-ok' });
    expect(res.status).toBe(201);
    const { id, status } = (await res.json()) as { id: string; status: string };
    expect(status).toBe('queued');

    const job = (await pool.query('select * from jobs where id = $1', [id])).rows[0];
    expect(job).toMatchObject({
      user_id: ownerId, team_id: 'team-b', store_id: 'store-ok', model: 'fal-test', provider: 'fal', preset_id: 'gentle-push-in',
      aspect: '9:16', duration_s: 5, input_asset_ids: ['own-1', 'own-2'], status: 'queued', is_mock: false,
    });
    expect(job.prompt).toMatch(/^Slow, gentle push-in/);
    const { rows } = await pool.query(`select kind, usd::text as usd, team_id, store_id, month, is_final from cost_entries where job_id = $1`, [id]);
    expect(rows).toEqual([{ kind: 'estimate', usd: '1.0000', team_id: 'team-b', store_id: 'store-ok', month: expect.stringMatching(/^\d{4}-\d{2}$/), is_final: false }]);

    const sent = (await pool.query(`select data, group_id from pgboss.job where name = 'video' and singleton_key = $1`, [id])).rows;
    expect(sent).toEqual([{ data: { jobId: id }, group_id: ownerId }]);
  });

  test('books 0 USD for a job on a mock model, and takes no store', async () => {
    const res = await run(ownerCookie, { ...base, modelId: 'mock-sample', assetIds: ['own-1'] });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await pool.query('select is_mock, store_id from jobs where id = $1', [id])).rows[0]).toEqual({ is_mock: true, store_id: null });
    expect((await pool.query(`select usd::text from cost_entries where job_id = $1`, [id])).rows).toEqual([{ usd: '0.0000' }]);
  });

  test("lets another Member reuse the inputs of a succeeded Library clip but not those of an unfinished job or an unused asset", async () => {
    const insertJob = (id: string, assets: string[], status: string) =>
      pool.query(
        `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status) values ($1, $2, 'team-b', 'fal-test', 'fal', 'p', '9:16', 5, $3, $4)`,
        [id, ownerId, assets, status],
      );
    await insertJob('queued-job', ['own-3'], 'queued');
    expect((await run(otherCookie, { ...base, assetIds: ['own-3'] })).status).toBe(400); // the input of another user's queued job
    await insertJob('clip-job', ['own-2'], 'succeeded');
    expect((await run(otherCookie, { ...base, assetIds: ['own-2'] })).status).toBe(201); // the input of a Library clip
    await pool.query(`update jobs set deleted_at = now() where id = 'clip-job'`);
    expect((await run(otherCookie, { ...base, assetIds: ['own-2'] })).status).toBe(400); // the clip left the Library
    expect((await run(ownerCookie, { ...base, assetIds: ['theirs-1'] })).status).toBe(400);
  });

  test('takes a free prompt instead of a preset: trimmed, stored with a null preset', async () => {
    const m = await newMember(); // its own daily count, so the owner keeps room for the cap tests
    const res = await runAs(m, { presetId: null, prompt: '  Một chiếc áo xoay chậm.  ' });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await pool.query('select preset_id, prompt from jobs where id = $1', [id])).rows[0]).toEqual({ preset_id: null, prompt: 'Một chiếc áo xoay chậm.' });
    const noPreset = { modelId: base.modelId, ratio: base.ratio, durationSec: base.durationSec, prompt: 'A slow turn.', assetIds: [m.asset] };
    expect((await run(m.cookie, noPreset)).status).toBe(201); // presetId may be left out
  });

  test.each([
    ['an empty prompt', { presetId: null, prompt: '' }],
    ['a blank prompt', { presetId: null, prompt: ' \n\t ' }],
    ['a prompt over 2000 characters', { presetId: null, prompt: 'x'.repeat(2001) }],
    ['a prompt that is not text', { presetId: null, prompt: 5 }],
    ['both a preset and a prompt', { prompt: 'A slow turn.' }],
    ['neither a preset nor a prompt', { presetId: null }],
  ])('answers 400 for %s, creating nothing', async (_, body) => {
    const before = await jobCount();
    expect((await run(ownerCookie, { ...base, assetIds: ['own-1'], ...body })).status).toBe(400);
    expect(await jobCount()).toBe(before);
  });

  test('accepts a prompt of exactly 2000 characters', async () => {
    const m = await newMember(); // its own daily count, so the owner keeps room for the cap tests above
    expect((await runAs(m, { presetId: null, prompt: 'x'.repeat(2000) })).status).toBe(201);
  });

  test.each([
    ['no assets', { assetIds: [] }],
    ['five assets', { assetIds: ['own-1', 'own-2', 'own-3', 'a4', 'a5'] }],
    ['the same asset twice', { assetIds: ['own-1', 'own-1'] }],
    ['an unknown asset', { assetIds: ['own-1', 'nope'] }],
    ['a deleted asset', { assetIds: ['own-deleted'] }],
    ['more images than the model takes', { assetIds: ['own-1', 'own-2', 'own-3'] }],
    ['an unknown store', { assetIds: ['own-1'], storeId: 'nope' }],
    ['a hidden store', { assetIds: ['own-1'], storeId: 'store-hidden' }],
    ['a disabled model', { assetIds: ['own-1'], modelId: 'kling-o3-pro' }],
    ['an unknown model', { assetIds: ['own-1'], modelId: 'nope' }],
    ['a ratio the model lacks', { assetIds: ['own-1'], ratio: '16:9' }],
    ['a duration the model lacks', { assetIds: ['own-1'], durationSec: 7 }],
    ['an unknown preset', { assetIds: ['own-1'], presetId: 'nope' }],
    ['a duration that is not a whole number', { assetIds: ['own-1'], durationSec: '5' }],
  ])('answers 400 for %s, creating nothing', async (_, body) => {
    const before = await jobCount();
    const res = await run(ownerCookie, { ...base, ...body });
    expect(res.status).toBe(400);
    expect(await jobCount()).toBe(before);
  });

  test('answers 400 for a body that is not JSON', async () => {
    const res = await POST(new Request('http://localhost/api/jobs', { method: 'POST', body: 'hello', headers: { cookie: ownerCookie } }));
    expect(res.status).toBe(400);
  });
});

let memberSeq = 0;
/** A fresh user with one input asset, so each cap test has its own daily count. */
async function newMember(teamId?: string, role = 'member') {
  const email = `m${++memberSeq}@example.test`;
  const { user } = await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role: role as 'member', ...(teamId ? { data: { teamId } } : {}) } });
  await insertAsset(`${user.id}-asset`, user.id);
  return { id: user.id, asset: `${user.id}-asset`, cookie: await signIn(email) };
}
type Member = Awaited<ReturnType<typeof newMember>>;
const runAs = (m: Member, extra: Record<string, unknown> = {}) => run(m.cookie, { ...base, assetIds: [m.asset], ...extra });

/** Jobs created today by the user, as if earlier Runs had finished; they take daily slots only. */
async function seedJobs(userId: string, n: number, status = 'succeeded', extra: { teamId?: string; storeId?: string | null; assets?: string[] } = {}): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `seed-${userId}-${status}-${i}`;
    ids.push(id);
    await pool.query(
      `insert into jobs (id, user_id, team_id, store_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status) values ($1, $2, $3, $4, 'fal-test', 'fal', 'p', '9:16', 5, $6, $5)`,
      [id, userId, extra.teamId ?? 'team-unassigned', extra.storeId ?? null, status, extra.assets ?? []],
    );
  }
  return ids;
}
const sentCount = async (userId: string) => (await pool.query(`select count(*)::int as n from pgboss.job where name = 'video' and group_id = $1`, [userId])).rows[0].n as number;
const dayFull = 'Bạn đã dùng hết số clip trong ngày hôm nay';

describe('the daily clip cap', () => {
  test('lets exactly one of two parallel Runs take the last slot, and sends nothing for the other', async () => {
    const m = await newMember();
    await seedJobs(m.id, 4);
    const results = await Promise.all([runAs(m), runAs(m)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 429]);
    const refused = results.find((r) => r.status === 429)!;
    expect(await refused.json()).toEqual({ error: dayFull });
    expect((await pool.query('select count(*)::int as n from jobs where user_id = $1', [m.id])).rows[0].n).toBe(5);
    expect(await sentCount(m.id)).toBe(1); // the queue, and so the provider adapter, was never reached for the refused Run
  });

  test('accepts at most 5 of 10 simultaneous Runs from one Member', async () => {
    const m = await newMember();
    const results = await Promise.all(Array.from({ length: 10 }, () => runAs(m)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(5);
    expect(await sentCount(m.id)).toBe(5);
    expect((await pool.query(`select count(*)::int as n from cost_entries where user_id = $1 and kind = 'estimate'`, [m.id])).rows[0].n).toBe(5);
  });

  test('gives the slot back after an unbilled failure, but not after a billed one or a timeout', async () => {
    const m = await newMember();
    await seedJobs(m.id, 3);
    await seedJobs(m.id, 1, 'timed_out');
    const first = (await (await runAs(m)).json()) as { id: string };
    expect((await runAs(m)).status).toBe(429); // 5 today, one of them timed_out

    await pool.query(`update jobs set status = 'running' where id = $1`, [first.id]);
    expect(await settle(pool, first.id, { status: 'failed', costUsd: 0, error: 'rejected' })).toBe(true); // failed + release => total 0
    expect((await pool.query('select usd::text from job_costs where job_id = $1', [first.id])).rows).toEqual([{ usd: '0.0000' }]);
    const second = (await (await runAs(m)).json()) as { id: string };
    expect(second.id).toBeTruthy();

    await pool.query(`update jobs set status = 'running' where id = $1`, [second.id]);
    expect(await settle(pool, second.id, { status: 'failed', costUsd: '0.7000', error: 'crashed late', billed: true })).toBe(true);
    expect((await runAs(m)).status).toBe(429); // a failure the provider billed keeps its slot
  });
});

describe('the monthly USD cap', () => {
  const monthUsd = async () => (await pool.query(`select coalesce(sum(usd), 0)::text as usd from cost_entries where month = to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM')`)).rows[0].usd as string;
  const setCap = (usd: string) => pool.query('update settings set monthly_cap_usd = $1', [usd]);

  test('refuses a Run whose estimate would pass the cap, counting the reservation of a running job, and a mock job still passes', async () => {
    const m = await newMember();
    const used = Number(await monthUsd());
    try {
      await setCap((used + 1).toFixed(4)); // room for exactly one 1.0000 estimate
      const first = (await (await runAs(m)).json()) as { id: string };
      await pool.query(`update jobs set status = 'running' where id = $1`, [first.id]);
      const sentBefore = await sentCount(m.id);
      const refused = await runAs(m);
      expect(refused.status).toBe(429);
      expect(await refused.json()).toEqual({ error: 'Đã hết ngân sách tháng của công ty' });
      expect(await sentCount(m.id)).toBe(sentBefore);
      expect((await pool.query('select count(*)::int as n from jobs where user_id = $1', [m.id])).rows[0].n).toBe(1);

      expect((await runAs(m, { modelId: 'mock-sample' })).status).toBe(201); // a mock job books 0 USD
      expect(Number(await monthUsd())).toBeCloseTo(used + 1, 4);
    } finally {
      await setCap('200');
    }
  });
});

describe('the monthly USD cap under contention', () => {
  test('lets exactly one of two parallel Runs take the last dollars of the month', async () => {
    const m = await newMember();
    const used = Number((await pool.query(`select coalesce(sum(usd), 0)::text as usd from cost_entries where month = to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM')`)).rows[0].usd);
    await pool.query('update settings set monthly_cap_usd = $1', [(used + 1).toFixed(4)]); // room for exactly one 1.0000 estimate
    try {
      const results = await Promise.all([runAs(m), runAs(m)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 429]);
      expect(await sentCount(m.id)).toBe(1);
      expect((await pool.query(`select count(*)::int as n from cost_entries where user_id = $1 and kind = 'estimate'`, [m.id])).rows[0].n).toBe(1);
    } finally {
      await pool.query('update settings set monthly_cap_usd = 200');
    }
  });
});

describe('POST /api/jobs with retryOf', () => {
  test('refuses a job that is not failed, unknown, or not the caller own', async () => {
    const m = await newMember();
    const other = await newMember();
    const [running] = await seedJobs(m.id, 1, 'running');
    const [ok] = await seedJobs(m.id, 1, 'failed');
    expect((await runAs(m, { retryOf: running })).status).toBe(409);
    expect((await runAs(m, { retryOf: 'nope' })).status).toBe(404);
    expect((await runAs(other, { retryOf: ok })).status).toBe(403);
    expect((await runAs(m, { retryOf: 5 })).status).toBe(400);
    expect((await pool.query('select count(*)::int as n from jobs where retry_of is not null and user_id = any($1)', [[m.id, other.id]])).rows[0].n).toBe(0);
  });

  test.each(['failed', 'timed_out', 'failed_unknown'])('retries a %s job once, and refuses a second retry and a retry of the retry', async (status) => {
    const m = await newMember();
    const [original] = await seedJobs(m.id, 1, status);
    const res = await runAs(m, { retryOf: original });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await pool.query('select retry_of from jobs where id = $1', [id])).rows[0].retry_of).toBe(original);

    expect((await runAs(m, { retryOf: original })).status).toBe(409); // a second retry of the same job
    await pool.query(`update jobs set status = 'failed' where id = $1`, [id]);
    expect((await runAs(m, { retryOf: id })).status).toBe(409); // a retry of a retry
    expect((await pool.query('select count(*)::int as n from jobs where retry_of is not null and user_id = $1', [m.id])).rows[0].n).toBe(1);
  });

  test('two parallel retries of one job book only one', async () => {
    const m = await newMember();
    const [original] = await seedJobs(m.id, 1, 'failed');
    const results = await Promise.all([runAs(m, { retryOf: original }), runAs(m, { retryOf: original })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  test('inherits the team and store of the original even after the user changes team, and ignores the store in the body', async () => {
    const m = await newMember('team-b');
    const [original] = await seedJobs(m.id, 1, 'failed', { teamId: 'team-b', storeId: 'store-ok' });
    await pool.query(`update stores set hidden = true where id = 'store-ok'`); // hidden since, still inherited
    await pool.query(`update users set team_id = 'team-unassigned' where id = $1`, [m.id]);
    try {
      const res = await runAs(m, { retryOf: original, storeId: 'store-hidden' });
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };
      expect((await pool.query('select team_id, store_id from jobs where id = $1', [id])).rows[0]).toEqual({ team_id: 'team-b', store_id: 'store-ok' });
      expect((await pool.query(`select team_id, store_id from cost_entries where job_id = $1`, [id])).rows).toEqual([{ team_id: 'team-b', store_id: 'store-ok' }]);
    } finally {
      await pool.query(`update stores set hidden = false where id = 'store-ok'`);
    }
  });

  test('refuses an Admin who is not the owner: only the owner may retry', async () => {
    const m = await newMember('team-b');
    const admin = await newMember(undefined, 'admin');
    const [original] = await seedJobs(m.id, 1, 'failed', { teamId: 'team-b' });
    expect((await runAs(admin, { retryOf: original })).status).toBe(403);
    expect((await pool.query('select count(*)::int as n from jobs where retry_of = $1', [original])).rows[0].n).toBe(0);
  });

  test('takes the inputs, model, preset, prompt, ratio and duration from the original and ignores those in the body', async () => {
    const m = await newMember();
    const [original] = await seedJobs(m.id, 1, 'failed', { assets: [m.asset] });
    const res = await run(m.cookie, { retryOf: original, assetIds: ['theirs-1'], modelId: 'mock-sample', presetId: 'nope', ratio: '1:1', durationSec: 10 });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await pool.query('select model, provider, is_mock, prompt, aspect, duration_s, input_asset_ids from jobs where id = $1', [id])).rows[0]).toEqual({
      model: 'fal-test', provider: 'fal', is_mock: false, prompt: 'p', aspect: '9:16', duration_s: 5, input_asset_ids: [m.asset],
    });
    expect((await pool.query(`select usd::text from cost_entries where job_id = $1`, [id])).rows).toEqual([{ usd: '1.0000' }]);
  });

  test('keeps the free prompt of the original and its null preset', async () => {
    const m = await newMember();
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, preset_id, prompt, aspect, duration_s, input_asset_ids, status) values ($1, $2, 'team-unassigned', 'fal-test', 'fal', null, 'My own prompt.', '9:16', 5, $3, 'failed')`,
      [`free-${m.id}`, m.id, [m.asset]],
    );
    const res = await runAs(m, { retryOf: `free-${m.id}` });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await pool.query('select preset_id, prompt from jobs where id = $1', [id])).rows[0]).toEqual({ preset_id: null, prompt: 'My own prompt.' });
  });

  test('books the estimate at the current price of the model', async () => {
    const m = await newMember();
    const [original] = await seedJobs(m.id, 1, 'failed', { assets: [m.asset] });
    await pool.query(`update model_configs set usd_per_second = 0.5 where id = 'fal-test'`);
    try {
      const { id } = (await (await run(m.cookie, { retryOf: original })).json()) as { id: string };
      expect((await pool.query(`select usd::text from cost_entries where job_id = $1`, [id])).rows).toEqual([{ usd: '2.5000' }]);
    } finally {
      await pool.query(`update model_configs set usd_per_second = 0.2 where id = 'fal-test'`);
    }
  });

  test('refuses a retry whose model is disabled since or whose input asset was deleted', async () => {
    const m = await newMember();
    const [original] = await seedJobs(m.id, 1, 'failed', { assets: [m.asset] });
    await pool.query(`update model_configs set enabled = false where id = 'fal-test'`);
    try {
      expect((await run(m.cookie, { retryOf: original })).status).toBe(400);
    } finally {
      await pool.query(`update model_configs set enabled = true where id = 'fal-test'`);
    }
    await pool.query(`update assets set deleted_at = now() where id = $1`, [m.asset]);
    expect((await run(m.cookie, { retryOf: original })).status).toBe(400);
    expect((await pool.query('select count(*)::int as n from jobs where retry_of = $1', [original])).rows[0].n).toBe(0);
  });
});

describe('moving a user to another team', () => {
  test('leaves the earlier jobs and their ledger rows on the old team', async () => {
    const m = await newMember('team-b');
    const first = (await (await runAs(m)).json()) as { id: string };
    await pool.query(`update users set team_id = 'team-unassigned' where id = $1`, [m.id]);
    const second = (await (await runAs(m)).json()) as { id: string };
    const teams = async (jobId: string) => (await pool.query(`select team_id from jobs where id = $1 union all select team_id from cost_entries where job_id = $1`, [jobId])).rows.map((r) => r.team_id);
    expect(await teams(first.id)).toEqual(['team-b', 'team-b']);
    expect(await teams(second.id)).toEqual(['team-unassigned', 'team-unassigned']);
  });
});

describe('GET /api/stores', () => {
  test('rejects a request without a session', async () => {
    expect((await GET(new Request('http://localhost/api/stores'))).status).toBe(401);
  });

  test('lists the visible stores and leaves out a hidden one', async () => {
    const res = await GET(new Request('http://localhost/api/stores', { headers: { cookie: ownerCookie } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stores: [{ id: 'store-ok', name: 'Store', code: 'S1' }] });
  });
});
