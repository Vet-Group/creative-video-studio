// The Smart Remake API: the feature flag gate, which analysis, shots and image a member may remake with, and the queued row it
// writes, against a disposable database on the compose Postgres. No S3 or fal call: the worker consumes the queue.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;
process.env.REA_REMAKE_ENABLED = '1';

const { auth, pool } = await import('@/lib/auth');
const { stopBoss } = await import('@/lib/queue');
const { GET: LIST, POST } = await import('./route');
const { GET: ONE } = await import('./[id]/route');

const PASSWORD = 'correct-horse-battery';
let cookie = '';
let userId = '';

const call = (path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const post = (body: Record<string, unknown>) => POST(call('/api/remakes', 'POST', body));
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;
const ok = { analysisId: 'an-ok', productAssetId: 'img', shots: [3, 1] };

beforeAll(async () => {
  const { user } = await auth.api.createUser({ body: { email: 'member@example.test', name: 'Member', password: PASSWORD, role: 'member' } });
  const other = await auth.api.createUser({ body: { email: 'other@example.test', name: 'Other', password: PASSWORD, role: 'member' } });
  userId = user.id;
  const res = await auth.api.signInEmail({ body: { email: 'member@example.test', password: PASSWORD }, asResponse: true });
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  await pool.query(
    `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values
       ('img', $1, 'input', 's3/img', 'shirt.png', 'image/png', 1), ('vid', $1, 'input', 's3/vid', 'ref.mp4', 'video/mp4', 1),
       ('img-theirs', $2, 'input', 's3/theirs', 't.png', 'image/png', 1)`,
    [userId, other.user.id],
  );
  await pool.query(`insert into stores (id, name, code) values ('store-ok', 'Shop', 'SOK')`);
  const shots = JSON.stringify({ shots: [1, 2, 3].map((index) => ({ index, start: index - 1, end: index, role: 'r', prompt: 'p' })) });
  await pool.query(
    `insert into analyses (id, user_id, team_id, store_id, source_key, status, result)
       select 'an-ok', u.id, u.team_id, 'store-ok', 's3/vid', 'succeeded', $3::jsonb from users u where u.id = $1
       union all select 'an-running', u.id, u.team_id, null, 's3/vid', 'running', null from users u where u.id = $1
       union all select 'an-theirs', u.id, u.team_id, null, 's3/theirs', 'succeeded', $3::jsonb from users u where u.id = $2`,
    [userId, other.user.id, shots],
  );
});

afterAll(async () => {
  await stopBoss();
  await pool.end();
  await testDb.drop();
});

test('every route 404s while the feature is off', async () => {
  delete process.env.REA_REMAKE_ENABLED;
  try {
    expect((await post(ok)).status).toBe(404);
    expect((await LIST(call('/api/remakes'))).status).toBe(404);
    expect((await ONE(call('/api/remakes/x'), { params: Promise.resolve({ id: 'x' }) })).status).toBe(404);
  } finally {
    process.env.REA_REMAKE_ENABLED = '1';
  }
});

test("queues a remake of the caller's own analysis and image, with the analysis' store and the shots in shot order", async () => {
  const res = await post(ok);
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  const row = (await pool.query('select user_id, team_id, store_id, analysis_id, product_asset_id, shots, status from remakes where id = $1', [id])).rows[0];
  const team = (await pool.query('select team_id from users where id = $1', [userId])).rows[0].team_id;
  expect(row).toEqual({ user_id: userId, team_id: team, store_id: 'store-ok', analysis_id: 'an-ok', product_asset_id: 'img', shots: [1, 3], status: 'queued' });
});

test('refuses another member’s or an unfinished analysis, shots it does not have or too many, and an image that is not the caller’s', async () => {
  expect(await errorOf(await post({}))).toBe('analysisId, productAssetId and shots are required');
  const theirs = await post({ ...ok, analysisId: 'an-theirs' });
  expect([theirs.status, await errorOf(theirs)]).toEqual([404, 'the analysis does not exist']);
  expect(await errorOf(await post({ ...ok, analysisId: 'an-running' }))).toBe('the analysis has not finished');
  expect(await errorOf(await post({ ...ok, shots: [1, 9] }))).toBe('shot 9 is not in the analysis');
  expect(await errorOf(await post({ ...ok, shots: [1, 2, 3, 4, 5, 6, 7] }))).toBe('at most 6 shots per remake');
  expect(await errorOf(await post({ ...ok, productAssetId: 'vid' }))).toBe('productAssetId must be an image');
  expect((await post({ ...ok, productAssetId: 'img-theirs' })).status).toBe(403);
  expect((await post({ ...ok, productAssetId: 'nope' })).status).toBe(404);
});

test('polls one of the caller’s remakes and hides another member’s', async () => {
  const { id } = (await (await post(ok)).json()) as { id: string };
  const got = await ONE(call(`/api/remakes/${id}`), { params: Promise.resolve({ id }) });
  expect(got.status).toBe(200);
  expect((await got.json()) as object).toMatchObject({ id, analysisId: 'an-ok', productAssetId: 'img', shots: [1, 3], status: 'queued', outputAssetId: null });
  await pool.query(
    `insert into remakes (id, user_id, team_id, analysis_id, shots) select 'rm-theirs', u.id, u.team_id, 'an-theirs', '[1]' from users u where u.email = 'other@example.test'`,
  );
  expect((await ONE(call('/api/remakes/rm-theirs'), { params: Promise.resolve({ id: 'rm-theirs' }) })).status).toBe(404);
});

test('counts the open remakes against the company month and refuses one that would pass it, queuing nothing', async () => {
  const prev = (await pool.query('select monthly_cap_usd::text as cap from settings where id = 1')).rows[0].cap as string;
  const open = (await pool.query(`select coalesce(sum(jsonb_array_length(shots)), 0)::int as n from remakes where status in ('queued', 'running')`)).rows[0].n as number;
  const count = async () => (await pool.query('select count(*)::int as n from remakes')).rows[0].n as number;
  await pool.query('update settings set monthly_cap_usd = $1 where id = 1', [((open + 2) * 0.1478).toFixed(4)]); // room for 2 more shots at 0.1478 each
  try {
    const before = await count();
    const over = await post({ ...ok, shots: [1, 2, 3] });
    expect([over.status, await over.json()]).toEqual([429, { error: 'Đã hết ngân sách tháng của công ty' }]); // shown to the member as is (errorText)
    expect(await count()).toBe(before);
    expect((await post({ ...ok, shots: [1, 2] })).status).toBe(201); // exactly the cap
  } finally {
    await pool.query('update settings set monthly_cap_usd = $1 where id = 1', [prev]);
  }
});

test('lists the caller’s remakes newest first', async () => {
  const list = (await (await LIST(call('/api/remakes'))).json()) as { remakes: { id: string; createdAt: string }[] };
  expect(list.remakes.length).toBeGreaterThanOrEqual(2);
  expect(list.remakes.some((r) => r.id === 'rm-theirs')).toBe(false);
  const times = list.remakes.map((r) => Date.parse(r.createdAt));
  expect(times).toEqual([...times].sort((a, b) => b - a));
});
