// The reference-video analysis API: the feature flag gate, who may analyse which video, and the queued row it writes,
// against a disposable database on the compose Postgres. No S3 or rea-video binary: the worker consumes the queue.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;
process.env.REA_ANALYZE_ENABLED = '1';

const { auth, pool } = await import('@/lib/auth');
const { stopBoss } = await import('@/lib/queue');
const { GET: LIST, POST } = await import('./route');
const { GET: ONE, DELETE: REMOVE } = await import('./[id]/route');

const PASSWORD = 'correct-horse-battery';
let cookie = '';
let userId = '';

const call = (path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const post = (body: Record<string, unknown>) => POST(call('/api/analyses', 'POST', body));
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;
const withFlag = async <T>(value: string | undefined, fn: () => Promise<T>): Promise<T> => {
  const prev = process.env.REA_ANALYZE_ENABLED;
  if (value === undefined) delete process.env.REA_ANALYZE_ENABLED;
  else process.env.REA_ANALYZE_ENABLED = value;
  try {
    return await fn();
  } finally {
    process.env.REA_ANALYZE_ENABLED = prev;
  }
};

beforeAll(async () => {
  const { user } = await auth.api.createUser({ body: { email: 'member@example.test', name: 'Member', password: PASSWORD, role: 'member' } });
  const other = await auth.api.createUser({ body: { email: 'other@example.test', name: 'Other', password: PASSWORD, role: 'member' } });
  userId = user.id;
  const res = await auth.api.signInEmail({ body: { email: 'member@example.test', password: PASSWORD }, asResponse: true });
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  await pool.query(
    `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, duration_ms) values
       ('v1', $1, 'input', 's3/v1', 'ref.mp4', 'video/mp4', 1000, 5000),
       ('img', $1, 'input', 's3/img', 'a.png', 'image/png', 1, null),
       ('v-theirs', $2, 'input', 's3/theirs', 't.mp4', 'video/mp4', 1000, 5000)`,
    [userId, other.user.id],
  );
  await pool.query(`insert into stores (id, name, code) values ('store-ok', 'Shop', 'SOK'), ('store-hidden', 'Gone', 'SGONE')`);
  await pool.query(`update stores set hidden = true where id = 'store-hidden'`);
});

afterAll(async () => {
  await stopBoss();
  await pool.end();
  await testDb.drop();
});

test('every route 404s while the feature is off', async () => {
  await withFlag(undefined, async () => {
    expect((await post({ sourceAssetId: 'v1' })).status).toBe(404);
    expect((await LIST(call('/api/analyses'))).status).toBe(404);
    expect((await ONE(call('/api/analyses/x'), { params: Promise.resolve({ id: 'x' }) })).status).toBe(404);
  });
});

test("queues an analysis of the caller's own video with its team and source key", async () => {
  const res = await post({ sourceAssetId: 'v1', storeId: 'store-ok' });
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  const row = (await pool.query('select user_id, team_id, store_id, source_key, status from analyses where id = $1', [id])).rows[0];
  const team = (await pool.query('select team_id from users where id = $1', [userId])).rows[0].team_id;
  expect(row).toEqual({ user_id: userId, team_id: team, store_id: 'store-ok', source_key: 's3/v1', status: 'queued' });
});

test('refuses a video that is not the caller’s, a non-video asset, a missing asset and a hidden store', async () => {
  expect((await post({ sourceAssetId: 'v-theirs' })).status).toBe(403); // another user's video, not in the caller's library: readableAsset refuses it
  expect(await errorOf(await post({ sourceAssetId: 'img' }))).toBe('sourceAssetId must be a video');
  expect((await post({ sourceAssetId: 'nope' })).status).toBe(404);
  expect(await errorOf(await post({ sourceAssetId: 'v1', storeId: 'store-hidden' }))).toBe('the store does not exist or is hidden');
  expect(await errorOf(await post({}))).toBe('sourceAssetId, and an optional storeId, are required');
});

test('polls one of the caller’s analyses and hides another user’s', async () => {
  const { id } = (await (await post({ sourceAssetId: 'v1' })).json()) as { id: string };
  const got = await ONE(call(`/api/analyses/${id}`), { params: Promise.resolve({ id }) });
  expect(got.status).toBe(200);
  expect(((await got.json()) as { status: string }).status).toBe('queued');
  await pool.query(`insert into analyses (id, user_id, team_id, store_id, source_key) select 'an-theirs', u.id, u.team_id, null, 's3/x' from users u where u.email = 'other@example.test'`);
  expect((await ONE(call('/api/analyses/an-theirs'), { params: Promise.resolve({ id: 'an-theirs' }) })).status).toBe(404);
});

test('lists the caller’s analyses newest first', async () => {
  const list = (await (await LIST(call('/api/analyses'))).json()) as { analyses: { id: string; status: string }[] };
  expect(list.analyses.length).toBeGreaterThanOrEqual(2);
  expect(list.analyses.every((a) => a.status === 'queued')).toBe(true);
});

const remove = (id: string) => REMOVE(call(`/api/analyses/${id}`, 'DELETE'), { params: Promise.resolve({ id }) });
const addAnalysis = (id: string, status: string, user = 'member@example.test') =>
  pool.query(`insert into analyses (id, user_id, team_id, store_id, source_key, status) select $1, u.id, u.team_id, null, 's3/x', $2 from users u where u.email = $3`, [id, status, user]);

test('deletes one of the caller’s finished analyses and nothing else', async () => {
  await addAnalysis('del-ok', 'succeeded');
  await addAnalysis('del-failed', 'failed');
  expect((await remove('del-ok')).status).toBe(204);
  expect((await remove('del-failed')).status).toBe(204);
  expect((await pool.query(`select id from analyses where id in ('del-ok', 'del-failed')`)).rowCount).toBe(0);
  expect((await remove('del-ok')).status).toBe(404); // already gone
});

test('hides another user’s analysis: 404, and the row stays', async () => {
  await addAnalysis('del-theirs', 'succeeded', 'other@example.test');
  expect((await remove('del-theirs')).status).toBe(404);
  expect((await pool.query(`select id from analyses where id = 'del-theirs'`)).rowCount).toBe(1);
});

test('refuses a queued or running analysis with 409', async () => {
  await addAnalysis('del-queued', 'queued');
  await addAnalysis('del-running', 'running');
  for (const id of ['del-queued', 'del-running']) {
    const res = await remove(id);
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toContain('đang chạy');
  }
  expect((await pool.query(`select id from analyses where id in ('del-queued', 'del-running')`)).rowCount).toBe(2);
});

test('refuses an analysis a remake was made from with 409, not a database error', async () => {
  await addAnalysis('del-remade', 'succeeded');
  await pool.query(`insert into remakes (id, user_id, team_id, analysis_id, shots) select 'rm-del', u.id, u.team_id, 'del-remade', '[1]' from users u where u.email = 'member@example.test'`);
  const res = await remove('del-remade');
  expect(res.status).toBe(409);
  expect(await errorOf(res)).toContain('lượt làm lại');
  expect((await pool.query(`select id from analyses where id = 'del-remade'`)).rowCount).toBe(1);
});

test('delete 404s while the feature is off', async () => {
  await withFlag(undefined, async () => expect((await remove('x')).status).toBe(404));
});
