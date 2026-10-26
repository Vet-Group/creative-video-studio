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

  test('stores Enhance for a free prompt (off when left out) and refuses it with a preset, a non-boolean or another feature', async () => {
    const m = await newMember();
    const on = (await (await runAs(m, { presetId: null, prompt: 'A slow turn.', enhance: true })).json()) as { id: string };
    const off = (await (await runAs(m, { presetId: null, prompt: 'A slow turn.' })).json()) as { id: string };
    const rows = (await pool.query('select id, enhance, enhanced_prompt from jobs where id = any($1) order by enhance desc', [[on.id, off.id]])).rows;
    expect(rows).toEqual([{ id: on.id, enhance: true, enhanced_prompt: null }, { id: off.id, enhance: false, enhanced_prompt: null }]);
    const before = await jobCount();
    expect((await runAs(m, { enhance: true })).status).toBe(400); // a preset's tested prompt is not rewritten
    expect((await runAs(m, { presetId: null, prompt: 'A slow turn.', enhance: 'yes' })).status).toBe(400);
    const marketing = await run(m.cookie, { feature: 'marketing', modelId: base.modelId, ratio: base.ratio, durationSec: 5, prompt: 'p', assetIds: [m.asset, 'own-1'], enhance: true });
    expect([marketing.status, ((await marketing.json()) as { error: string }).error]).toEqual([400, expect.stringMatching(/^Enhance/)]);
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
    ['a disabled model', { assetIds: ['own-1'], modelId: 'seedance-2.5' }],
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

  test('keeps Enhance and the brief the original already paid for, so the retry is not rewritten again', async () => {
    const m = await newMember();
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, prompt, enhance, enhanced_prompt, aspect, duration_s, input_asset_ids, status) values ($1, $2, 'team-unassigned', 'fal-test', 'fal', 'turn', true, 'A slow turn brief.', '9:16', 5, $3, 'failed')`,
      [`enh-${m.id}`, m.id, [m.asset]],
    );
    const { id } = (await (await runAs(m, { retryOf: `enh-${m.id}` })).json()) as { id: string };
    expect((await pool.query('select prompt, enhance, enhanced_prompt from jobs where id = $1', [id])).rows[0]).toEqual({ prompt: 'turn', enhance: true, enhanced_prompt: 'A slow turn brief.' });
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

describe('POST /api/jobs for an image feature', () => {
  const image = { modelId: 'img-pro', feature: 'image', prompt: 'a bottle on marble', ratio: '3:4', params: { resolution: '2K' } };
  const runImage = (m: Member, extra: Record<string, unknown> = {}) => run(m.cookie, { ...image, assetIds: [m.asset], ...extra });
  const error = async (res: Response) => ((await res.json()) as { error: string }).error;

  beforeAll(async () => {
    await pool.query(
      `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, image_prices, sources, enabled) values
         ('img-pro', 'fal', 'x', 'Img pro', 'image', '{image,try_on}', '{auto,1:1,3:4}', '{}', 2, '{"1K": "0.1500", "2K": "0.3000"}', '{}', true),
         ('img-only', 'fal', 'x', 'Img only', 'image', '{image}', '{auto,1:1}', '{}', 2, '{"1K": "0.0398"}', '{}', true),
         ('img-off', 'fal', 'x', 'Img off', 'image', '{image}', '{auto}', '{}', 2, '{"1K": "0.1"}', '{}', false),
         ('img-mock', 'mock', 'mock', 'Img mock', 'image', '{image}', '{auto,1:1}', '{}', 2, '{"1K": "0.2000"}', '{}', true)`,
    );
  });

  test('creates a queued image job with the per-image estimate, 0 seconds, the params and the feature', async () => {
    const m = await newMember();
    const res = await runImage(m);
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await pool.query('select feature, model, provider, preset_id, prompt, aspect, duration_s, params, status, is_mock from jobs where id = $1', [id])).rows).toEqual([
      { feature: 'image', model: 'img-pro', provider: 'fal', preset_id: null, prompt: 'a bottle on marble', aspect: '3:4', duration_s: 0, params: { resolution: '2K' }, status: 'queued', is_mock: false },
    ]);
    expect((await pool.query('select kind, usd::text as usd from cost_entries where job_id = $1', [id])).rows).toEqual([{ kind: 'estimate', usd: '0.3000' }]);
    expect(await sentCount(m.id)).toBe(1);
  });

  test('takes a quality, ignores durationSec, and books a mock image model at 0', async () => {
    const m = await newMember();
    const { id } = (await (await runImage(m, { params: { resolution: '1K', quality: 'low' }, durationSec: 99 })).json()) as { id: string };
    expect((await pool.query('select duration_s, params from jobs where id = $1', [id])).rows).toEqual([{ duration_s: 0, params: { resolution: '1K', quality: 'low' } }]);
    const mock = (await (await runImage(m, { modelId: 'img-mock', ratio: 'auto', params: { resolution: '1K' } })).json()) as { id: string };
    expect((await pool.query('select usd::text from cost_entries where job_id = $1', [mock.id])).rows).toEqual([{ usd: '0.0000' }]);
  });

  test.each([
    ['a model that does not list the feature', { modelId: 'img-only', feature: 'try_on', two: true }, /does not offer this feature/],
    ['a video model', { modelId: 'fal-test' }, /does not offer this feature/],
    ['a disabled model', { modelId: 'img-off', ratio: 'auto', params: { resolution: '1K' } }, /not enabled/],
    ['a ratio the model lacks', { ratio: '16:9' }, /ratio, resolution or number of images/],
    ['a resolution the model lacks', { params: { resolution: '4K' } }, /ratio, resolution or number of images/],
    ['a prototype key as the resolution', { params: { resolution: 'constructor' } }, /ratio, resolution or number of images/],
    ['no resolution', { params: {} }, /params\.resolution is required/],
    ['a param that is not allowed', { params: { resolution: '1K', seed: '1' } }, /only resolution and quality/],
    ['a quality that does not exist', { params: { resolution: '1K', quality: 'ultra' } }, /params\.quality must be one of/],
    ['a preset', { presetId: 'gentle-push-in', prompt: undefined }, /takes a prompt and no preset/],
    ['no prompt', { prompt: undefined }, /takes a prompt and no preset/],
    ['an unknown feature', { feature: 'telepathy' }, /feature must be one of/],
  ])('refuses %s, books nothing and sends nothing', async (_what, extra, message) => {
    const m = await newMember();
    const { two, ...fields } = extra as { two?: boolean };
    if (two) await insertAsset(`${m.id}-b`, m.id);
    const res = await runImage(m, { ...fields, ...(two && { assetIds: [m.asset, `${m.id}-b`] }) });
    expect(res.status).toBe(400);
    expect(await error(res)).toMatch(message);
    expect((await pool.query('select count(*)::int as n from jobs where user_id = $1', [m.id])).rows[0].n).toBe(0);
    expect(await sentCount(m.id)).toBe(0);
  });

  test('refuses more inputs than the model takes, and an input the caller cannot use', async () => {
    const m = await newMember();
    for (const n of [2, 3]) await insertAsset(`${m.id}-extra-${n}`, m.id);
    expect((await runImage(m, { assetIds: [m.asset, `${m.id}-extra-2`] })).status).toBe(201); // img-pro takes 2
    const res = await runImage(m, { assetIds: [m.asset, `${m.id}-extra-2`, `${m.id}-extra-3`] });
    expect([res.status, await error(res)]).toEqual([400, 'the model does not allow this ratio, resolution or number of images']);
    expect((await runImage(m, { assetIds: ['theirs-1'] })).status).toBe(400);
  });

  test('Try On needs two images, and runs without a prompt on a default one', async () => {
    const m = await newMember();
    await insertAsset(`${m.id}-garment`, m.id);
    const tryOn = { feature: 'try_on', prompt: undefined };
    expect(await error(await runImage(m, tryOn))).toMatch(/at least one garment image/);
    const res = await runImage(m, { ...tryOn, assetIds: [m.asset, `${m.id}-garment`] });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const job = (await pool.query('select feature, prompt from jobs where id = $1', [id])).rows[0];
    expect(job.feature).toBe('try_on');
    expect(job.prompt).toMatch(/^Dress the person in the first image/);
    expect((await runImage(m, { ...tryOn, prompt: '  Put the red dress on her ', assetIds: [m.asset, `${m.id}-garment`] })).status).toBe(201);
  });

  describe('the image apps', () => {
    const appModels: [string, string, number, string][] = [
      ['app-char', 'character_swap', 2, 'auto'], ['app-model', 'model_swap', 2, 'auto'], ['app-bg', 'background_changer', 2, 'auto'], ['app-reframe', 'reframe', 1, '1:1,16:9'],
      ['app-up', 'image_upscale', 1, 'auto'], ['app-face', 'face_swap', 2, 'auto'], ['app-rm', 'background_remover', 1, 'auto'],
    ];
    beforeAll(async () => {
      for (const [id, feature, max, ratios] of appModels) {
        await pool.query(
          `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, image_prices, sources, enabled)
           values ($1, 'mock', 'mock', $1, 'image', $2::text[], $3::text[], '{}', $4, '{"1K": "0.0500", "2K": "0.0400"}', '{}', true)`,
          [id, `{${feature}}`, `{${ratios}}`, max],
        );
      }
    });
    /** Runs `feature` on its model with `n` images (the first is the member's own, the rest are made for the run) and returns the response and the stored job. */
    async function app(feature: string, n: number, extra: Record<string, unknown> = {}) {
      const m = await newMember();
      const ids = [m.asset];
      for (let i = 1; i < n; i++) {
        ids.push(`${m.id}-i${i}`);
        await insertAsset(ids[i]!, m.id);
      }
      const modelId = appModels.find((a) => a[1] === feature)?.[0];
      const res = await run(m.cookie, { assetIds: ids, modelId, feature, ratio: 'auto', params: { resolution: '1K' }, ...extra });
      const body = (await res.json()) as { id?: string; error?: string };
      const job = body.id ? (await pool.query('select feature, model, prompt, aspect, params from jobs where id = $1', [body.id])).rows[0] : undefined;
      return { status: res.status, error: body.error, job };
    }

    test.each([
      ['character_swap', 'replace the whole person in the second image with the person from the first image, keep the background'],
      ['model_swap', 'replace the person in the second image with the model from the first image, keep the clothing, pose and background exactly'],
    ])('%s needs exactly two images and stores its fixed instruction when the prompt is empty', async (feature, instruction) => {
      expect(await app(feature, 1)).toMatchObject({ status: 400, error: `${feature} needs 2 images` });
      expect((await app(feature, 3)).error).toMatch(/number of images/);
      const ok = await app(feature, 2);
      expect([ok.status, ok.job]).toEqual([201, { feature, model: appModels.find((a) => a[1] === feature)![0], prompt: instruction, aspect: 'auto', params: { resolution: '1K' } }]);
    });

    test('Face Swap needs two images and takes no prompt; Background Remover and Upscale take one image', async () => {
      expect((await app('face_swap', 1)).error).toBe('face_swap needs 2 images');
      expect(await app('face_swap', 2)).toMatchObject({ status: 201, job: { prompt: 'Swap the face from the first image onto the person in the second image.' } });
      expect(await app('background_remover', 1)).toMatchObject({ status: 201, job: { prompt: 'Remove the background.' } });
      expect((await app('background_remover', 2)).status).toBe(400);
      expect(await app('image_upscale', 1, { params: { resolution: '2K' } })).toMatchObject({ status: 201, job: { params: { resolution: '2K' } } });
      expect((await app('image_upscale', 1, { params: { resolution: '4K' } })).status).toBe(400); // this model has no 4K price
    });

    test('Reframe takes one of its ratios and a default prompt', async () => {
      expect(await app('reframe', 1, { ratio: '16:9' })).toMatchObject({ status: 201, job: { aspect: '16:9', prompt: 'Extend the image to the new aspect ratio.' } });
      expect((await app('reframe', 1, { ratio: '9:16' })).status).toBe(400);
    });

    test('Background Changer takes a prompt with one image or a reference image with two, not both and not neither', async () => {
      expect(await app('background_changer', 1, { prompt: 'a marble table' })).toMatchObject({ status: 201, job: { prompt: 'a marble table' } });
      expect(await app('background_changer', 2)).toMatchObject({ status: 201, job: { prompt: 'Replace the background with the one in the reference image.' } });
      const message = /prompt or a reference image/;
      expect((await app('background_changer', 1)).error).toMatch(message);
      expect((await app('background_changer', 2, { prompt: 'a marble table' })).error).toMatch(message);
    });

    test("a swap adds the member's prompt to its fixed instruction; the other apps keep the member's prompt as it is, trimmed", async () => {
      const fixed = 'replace the whole person in the second image with the person from the first image, keep the background';
      expect(await app('character_swap', 2, { prompt: '  keep the hat ' })).toMatchObject({ status: 201, job: { prompt: `${fixed}. keep the hat` } });
      expect(await app('reframe', 1, { prompt: '  wide shot ', ratio: '1:1' })).toMatchObject({ status: 201, job: { prompt: 'wide shot' } });
    });

    test.each([['reframe', 1, 'Extend the image to the new aspect ratio.'], ['model_swap', 2, 'replace the person in the second image with the model from the first image, keep the clothing, pose and background exactly'], ['background_changer', 2, 'Replace the background with the one in the reference image.']])(
      'an empty or blank prompt on %s means no prompt, so the default applies',
      async (feature, n, instruction) => {
        for (const prompt of ['', '   ']) expect(await app(feature, n, { prompt, ratio: feature === 'reframe' ? '1:1' : 'auto' })).toMatchObject({ status: 201, job: { prompt: instruction } });
      },
    );

    test('a blank prompt on a feature without a default is still refused', async () => {
      expect((await app('image', 1, { prompt: '  ', modelId: 'img-pro', ratio: '1:1' })).error).toMatch(/takes a prompt and no preset/);
    });
  });

  test('keeps the video path to its own rules: no params', async () => {
    const m = await newMember();
    expect((await runAs(m, { params: { resolution: '1K' } })).status).toBe(400);
  });

  describe('the marketing feature', () => {
    const error = async (res: Response) => ((await res.json()) as { error: string }).error;
    const prompt = 'The person in [Image1] wears the product in [Image2].';
    async function marketing(m: Member, extra: Record<string, unknown> = {}) {
      await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, $2, 'input', $1, 'p.png', 'image/png', 1) on conflict (id) do nothing`, [`${m.id}-product`, m.id]);
      return runAs(m, { feature: 'marketing', presetId: null, prompt, assetIds: [m.asset, `${m.id}-product`], ...extra });
    }
    const withMarketing = async (fn: () => Promise<void>) => {
      await pool.query(`update model_configs set features = '{video,marketing}' where id = 'fal-test'`);
      try {
        await fn();
      } finally {
        await pool.query(`update model_configs set features = '{video}' where id = 'fal-test'`);
      }
    };

    test('needs a model that lists it', async () => {
      expect((await marketing(await newMember())).status).toBe(400); // fal-test lists only video
    });

    test('takes the model photo and the product photo in that order, stores the prompt and books the video estimate', () =>
      withMarketing(async () => {
        const m = await newMember();
        const res = await marketing(m);
        expect(res.status).toBe(201);
        const { id } = (await res.json()) as { id: string };
        expect((await pool.query('select feature, preset_id, prompt, duration_s, input_asset_ids from jobs where id = $1', [id])).rows).toEqual([
          { feature: 'marketing', preset_id: null, prompt, duration_s: 5, input_asset_ids: [m.asset, `${m.id}-product`] },
        ]);
        expect((await pool.query(`select usd::text from cost_entries where job_id = $1`, [id])).rows).toEqual([{ usd: '1.0000' }]);
      }));

    test('refuses anything but exactly 2 images, a preset, and a missing or blank prompt, in English', () =>
      withMarketing(async () => {
        const m = await newMember();
        const before = await jobCount();
        expect(await error(await runAs(m, { feature: 'marketing', presetId: null, prompt }))).toMatch(/exactly 2 images/);
        await insertAsset(`${m.id}-third`, m.id);
        expect(await error(await marketing(m, { assetIds: [m.asset, `${m.id}-product`, `${m.id}-third`] }))).toMatch(/exactly 2 images/);
        expect(await error(await marketing(m, { presetId: 'gentle-push-in', prompt: null }))).toMatch(/prompt and no preset/);
        expect(await error(await marketing(m, { presetId: 'gentle-push-in' }))).toMatch(/prompt and no preset/);
        expect(await error(await marketing(m, { prompt: null }))).toMatch(/prompt and no preset/);
        expect(await error(await marketing(m, { prompt: undefined }))).toMatch(/prompt and no preset/);
        expect(await error(await marketing(m, { prompt: '   ' }))).toMatch(/prompt and no preset/);
        expect(await jobCount()).toBe(before);
      }));

    test('a retry copies the two inputs and the prompt of the original and is not held to the new-Run checks', () =>
      withMarketing(async () => {
        const m = await newMember();
        const { id } = (await (await marketing(m)).json()) as { id: string };
        await pool.query(`update jobs set status = 'failed' where id = $1`, [id]);
        const res = await run(m.cookie, { retryOf: id });
        expect(res.status).toBe(201);
        const retry = ((await res.json()) as { id: string }).id;
        expect((await pool.query('select feature, prompt, input_asset_ids, retry_of from jobs where id = $1', [retry])).rows).toEqual([
          { feature: 'marketing', prompt, input_asset_ids: [m.asset, `${m.id}-product`], retry_of: id },
        ]);
      }));
  });

  describe('the image and apps caps', () => {
    const cap = (sql: string) => pool.query(`update settings set ${sql}`);
    const reset = () => cap(`features_monthly_cap_usd = 260, member_daily_usd_cap = 10, member_monthly_usd_cap = 50`);

    test("refuses a Run past the member's day, their month and the company month with the cap messages, one image Run at a time", async () => {
      const m = await newMember();
      try {
        await cap(`member_daily_usd_cap = 0.5`); // two 0.3000 estimates do not fit
        expect((await runImage(m)).status).toBe(201);
        const day = await runImage(m);
        expect([day.status, await error(day)]).toEqual([429, 'Bạn đã dùng hết hạn mức chi phí hôm nay']);
        await reset();
        await cap(`member_monthly_usd_cap = 0.5`);
        const month = await runImage(m);
        expect([month.status, await error(month)]).toEqual([429, 'Bạn đã dùng hết hạn mức chi phí tháng này']);
        await reset();
        const used = Number((await pool.query(`select coalesce(sum(usd), 0)::text as usd from cost_entries ce where month = to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') and exists (select 1 from jobs j where j.id = ce.job_id and j.feature not in ('video', 'marketing'))`)).rows[0].usd);
        await cap(`features_monthly_cap_usd = ${(used + 0.2).toFixed(4)}`);
        const company = await runImage(m);
        expect([company.status, await error(company)]).toEqual([429, 'Đã hết ngân sách tháng cho ảnh và ứng dụng']);
        expect(await sentCount(m.id)).toBe(1);
      } finally {
        await reset();
      }
    });

    test('keeps the video caps apart: a spent image budget does not stop a video Run, and the daily clip cap does not count images', async () => {
      const m = await newMember();
      try {
        await cap(`member_daily_usd_cap = 0, member_monthly_usd_cap = 0, features_monthly_cap_usd = 0`);
        expect((await runAs(m)).status).toBe(201);
        await reset();
        await seedJobs(m.id, 3);
        for (let i = 0; i < 3; i++) expect((await runImage(m)).status).toBe(201); // 4 jobs today and the clip cap is 5, but images are not clips
        expect((await runAs(m)).status).toBe(201);
        expect((await runAs(m)).status).toBe(429); // the 6th clip
      } finally {
        await reset();
      }
    });
  });

  test('retries an image job from its own feature, params and model price', async () => {
    const m = await newMember();
    const { id } = (await (await runImage(m)).json()) as { id: string };
    await pool.query(`update jobs set status = 'failed' where id = $1`, [id]);
    await pool.query(`update model_configs set image_prices = '{"1K": "0.1500", "2K": "0.4000"}' where id = 'img-pro'`);
    try {
      const res = await run(m.cookie, { retryOf: id });
      expect(res.status).toBe(201);
      const retry = ((await res.json()) as { id: string }).id;
      expect((await pool.query('select feature, aspect, duration_s, params from jobs where id = $1', [retry])).rows).toEqual([{ feature: 'image', aspect: '3:4', duration_s: 0, params: { resolution: '2K' } }]);
      expect((await pool.query('select usd::text from cost_entries where job_id = $1', [retry])).rows).toEqual([{ usd: '0.4000' }]);
    } finally {
      await pool.query(`update model_configs set image_prices = '{"1K": "0.1500", "2K": "0.3000"}' where id = 'img-pro'`);
    }
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
