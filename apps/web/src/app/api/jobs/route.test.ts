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

  test("lets another Member reuse the inputs of a Library clip but not an unused asset of someone else", async () => {
    expect((await run(otherCookie, { ...base, assetIds: ['own-1'] })).status).toBe(201); // own-1 is an input of the owner's jobs
    expect((await run(otherCookie, { ...base, assetIds: ['own-3'] })).status).toBe(400); // own-3 is in no job
    expect((await run(ownerCookie, { ...base, assetIds: ['theirs-1'] })).status).toBe(400);
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
