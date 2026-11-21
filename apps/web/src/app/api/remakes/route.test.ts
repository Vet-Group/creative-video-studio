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
process.env.REA_ANALYZE_ENABLED = '1';

const { auth, pool } = await import('@/lib/auth');
const { stopBoss } = await import('@/lib/queue');
const { GET: LIST, POST } = await import('./route');
const { GET: ONE, DELETE: REMOVE } = await import('./[id]/route');
const { DELETE: REMOVE_ANALYSIS } = await import('../analyses/[id]/route');

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
    `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values
       ('img', $1, 'input', 's3/img', 'shirt.png', 'image/png', 1, 'ws_vet'), ('vid', $1, 'input', 's3/vid', 'ref.mp4', 'video/mp4', 1, 'ws_vet'),
       ('img-theirs', $2, 'input', 's3/theirs', 't.png', 'image/png', 1, 'ws_vet')`,
    [userId, other.user.id],
  );
  await pool.query(`insert into stores (id, name, code, workspace_id) values ('store-ok', 'Shop', 'SOK', 'ws_vet')`);
  const shots = JSON.stringify({ shots: [1, 2, 3].map((index) => ({ index, start: index - 1, end: index, role: 'r', prompt: `p${index}` })) });
  await pool.query(
    `insert into analyses (id, user_id, team_id, store_id, source_key, status, result, workspace_id)
       select 'an-ok', u.id, u.team_id, 'store-ok', 's3/vid', 'succeeded', $3::jsonb, 'ws_vet' from users u where u.id = $1
       union all select 'an-running', u.id, u.team_id, null, 's3/vid', 'running', null, 'ws_vet' from users u where u.id = $1
       union all select 'an-theirs', u.id, u.team_id, null, 's3/theirs', 'succeeded', $3::jsonb, 'ws_vet' from users u where u.id = $2`,
    [userId, other.user.id, shots],
  );
  // Shots 1 and 2 share a prompt and a role, so they are one scene (mergeShots).
  const merged = JSON.stringify({ shots: [1, 2, 3].map((index) => ({ index, start: index - 1, end: index, role: 'r', prompt: index < 3 ? 'same' : 'other' })) });
  await pool.query(`insert into analyses (id, user_id, team_id, source_key, status, result, workspace_id) select 'an-merged', u.id, u.team_id, 's3/vid', 'succeeded', $2::jsonb, 'ws_vet' from users u where u.id = $1`, [userId, merged]);
  // The remakes these tests leave open count toward the member's caps; only the member cap test sets them low.
  await pool.query('update settings set member_daily_usd_cap = 1000, member_monthly_usd_cap = 1000 where id = 1');
});

afterAll(async () => {
  try {
    await stopBoss();
    await pool.end();
  } finally {
    await testDb.drop();
  }
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

test('drops the analysis’ store when the caller, now in a billing team, may no longer pick it (docs/BILLING.md)', async () => {
  const team = (await pool.query('select team_id from users where id = $1', [userId])).rows[0].team_id;
  await pool.query(`insert into teams (id, name, billable) values ('rm-sales', 'Sales', true)`);
  await pool.query(`update users set team_id = 'rm-sales' where id = $1`, [userId]);
  try {
    const res = await post(ok);
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await pool.query('select store_id from remakes where id = $1', [id])).rows[0].store_id).toBeNull(); // 'store-ok' belongs to no team
  } finally {
    await pool.query('update users set team_id = $2 where id = $1', [userId, team]);
  }
});

test('refuses another member’s or an unfinished analysis, shots it does not have or too many, and an image that is not the caller’s', async () => {
  expect(await errorOf(await post({}))).toBe('analysisId, productAssetId and shots are required');
  const theirs = await post({ ...ok, analysisId: 'an-theirs' });
  expect([theirs.status, await errorOf(theirs)]).toEqual([404, 'the analysis does not exist']);
  expect(await errorOf(await post({ ...ok, analysisId: 'an-running' }))).toBe('the analysis has not finished');
  expect(await errorOf(await post({ ...ok, shots: [1, 9] }))).toBe('shot 9 is not in the analysis');
  expect(await errorOf(await post({ ...ok, analysisId: 'an-merged', shots: [2] }))).toBe('shot 2 is not in the analysis'); // inside scene 1, not a scene of its own
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
    `insert into remakes (id, user_id, team_id, analysis_id, shots, workspace_id) select 'rm-theirs', u.id, u.team_id, 'an-theirs', '[1]', 'ws_vet' from users u where u.email = 'other@example.test'`,
  );
  expect((await ONE(call('/api/remakes/rm-theirs'), { params: Promise.resolve({ id: 'rm-theirs' }) })).status).toBe(404);
});

test('counts the open remakes against the company month and refuses one that would pass it, queuing nothing', async () => {
  const prev = (await pool.query('select monthly_cap_usd::text as cap from settings where id = 1')).rows[0].cap as string;
  const open = (await pool.query(`select coalesce(sum(jsonb_array_length(shots)), 0)::int as n from remakes where status in ('queued', 'running')`)).rows[0].n as number;
  const count = async () => (await pool.query('select count(*)::int as n from remakes')).rows[0].n as number;
  // An open remake's shots hold $2.00 each (10 s sent + 10 s made at $0.10); these 1 s shots cost $0.40 each (2 s sent + 2 s made), so there is room for 2 more.
  await pool.query('update settings set monthly_cap_usd = $1 where id = 1', [(open * 2 + 2 * 0.4).toFixed(4)]);
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

test('counts the caller’s open remakes against their own daily cap and refuses one that would pass it, queuing nothing', async () => {
  const mine = (await pool.query(`select coalesce(sum(jsonb_array_length(shots)), 0)::int as n from remakes where user_id = $1 and status in ('queued', 'running')`, [userId])).rows[0].n as number;
  const count = async () => (await pool.query('select count(*)::int as n from remakes')).rows[0].n as number;
  // As above: $2.00 held per open shot, $0.40 per 1 s shot of this one, so the caller has room for 2 more shots today.
  await pool.query('update settings set member_daily_usd_cap = $1 where id = 1', [(mine * 2 + 2 * 0.4).toFixed(4)]);
  try {
    const before = await count();
    const over = await post({ ...ok, shots: [1, 2, 3] });
    expect([over.status, await over.json()]).toEqual([429, { error: 'Bạn đã dùng hết hạn mức chi phí hôm nay' }]);
    expect(await count()).toBe(before);
    expect((await post({ ...ok, shots: [1, 2] })).status).toBe(201); // exactly the cap
  } finally {
    await pool.query('update settings set member_daily_usd_cap = 1000 where id = 1');
  }
});

test('lists the caller’s remakes newest first', async () => {
  const list = (await (await LIST(call('/api/remakes'))).json()) as { remakes: { id: string; createdAt: string }[] };
  expect(list.remakes.length).toBeGreaterThanOrEqual(2);
  expect(list.remakes.some((r) => r.id === 'rm-theirs')).toBe(false);
  const times = list.remakes.map((r) => Date.parse(r.createdAt));
  expect(times).toEqual([...times].sort((a, b) => b - a));
});

test('deletes a finished remake with its output assets, keeps the product image and the ledger, then lets the analysis go; refuses an open or another member’s one', async () => {
  const shots = JSON.stringify({ shots: [{ index: 1, start: 0, end: 1, role: 'r', prompt: 'p' }] });
  await pool.query(`insert into analyses (id, user_id, team_id, source_key, status, result, workspace_id) select 'an-del', u.id, u.team_id, 's3/vid', 'succeeded', $2::jsonb, 'ws_vet' from users u where u.id = $1`, [userId, shots]);
  await pool.query(
    `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values
       ('rm-out', $1, 'output', 'assets/rm-out', 'out.mp4', 'video/mp4', 1, 'ws_vet'), ('rm-cmp', $1, 'output', 'assets/rm-cmp', 'cmp.mp4', 'video/mp4', 1, 'ws_vet'), ('rm-full', $1, 'output', 'assets/rm-full', 'full.mp4', 'video/mp4', 1, 'ws_vet'), ('rm-clip', $1, 'output', 'assets/rm-clip', 'clip.mp4', 'video/mp4', 1, 'ws_vet')`,
    [userId],
  );
  const result = JSON.stringify({ shots: [{ index: 1, status: 'succeeded', clipAssetId: 'rm-clip', costUsd: 0.2 }], compareAssetId: 'rm-cmp', fullAssetId: 'rm-full' });
  await pool.query(
    `insert into remakes (id, user_id, team_id, analysis_id, product_asset_id, shots, status, result, output_asset_id, workspace_id)
       select 'rm-done', u.id, u.team_id, 'an-del', 'img', '[1]'::jsonb, 'succeeded', $2::jsonb, 'rm-out', 'ws_vet' from users u where u.id = $1
       union all select 'rm-open', u.id, u.team_id, 'an-del', 'img', '[1]'::jsonb, 'running', null::jsonb, null, 'ws_vet' from users u where u.id = $1`,
    [userId, result],
  );
  await pool.query(
    `insert into cost_entries (kind, usd, month, day, user_id, team_id, provider, is_final, ref, workspace_id) select 'llm', 0.2, '2026-11', '2026-11-13', u.id, u.team_id, 'fal', true, 'llm:remake:rm-done:1:video', 'ws_vet' from users u where u.id = $1`,
    [userId],
  );
  const remove = (id: string) => REMOVE(call(`/api/remakes/${id}`, 'DELETE'), { params: Promise.resolve({ id }) });
  const exists = async (table: string, id: string) => (await pool.query(`select 1 from ${table} where id = $1`, [id])).rowCount === 1;

  expect((await remove('rm-theirs')).status).toBe(404);
  const open = await remove('rm-open');
  expect([open.status, await errorOf(open)]).toEqual([409, 'Video đang được tạo nên chưa xoá được. Hãy đợi nó xong.']);
  expect(await exists('remakes', 'rm-open')).toBe(true);
  const analysis = (id: string) => REMOVE_ANALYSIS(call(`/api/analyses/${id}`, 'DELETE'), { params: Promise.resolve({ id }) });
  expect((await analysis('an-del')).status).toBe(409); // its remakes still hold it

  expect((await remove('rm-done')).status).toBe(200);
  expect(await exists('remakes', 'rm-done')).toBe(false);
  for (const id of ['rm-out', 'rm-cmp', 'rm-full', 'rm-clip']) expect(await exists('assets', id)).toBe(false);
  expect(await exists('assets', 'img')).toBe(true);
  expect((await pool.query(`select count(*)::int as n from cost_entries where ref = 'llm:remake:rm-done:1:video'`)).rows[0].n).toBe(1);
  expect((await remove('rm-done')).status).toBe(404);

  await pool.query(`update remakes set status = 'failed' where id = 'rm-open'`);
  expect((await remove('rm-open')).status).toBe(200);
  expect((await analysis('an-del')).status).toBe(204);
  expect(await exists('analyses', 'an-del')).toBe(false);
});

test('remakes another member’s analysis while an Admin shares it, with the caller’s own image and no store, and refuses it once unshared', async () => {
  await pool.query(
    `insert into analyses (id, user_id, team_id, store_id, source_key, status, result, shared_title, shared_at, workspace_id)
       select 'an-shared', u.id, u.team_id, 'store-ok', 's3/theirs', 'succeeded', a.result, 'Tee', now(), 'ws_vet' from analyses a, users u where a.id = 'an-theirs' and u.email = 'other@example.test'`,
  );
  const shared = { ...ok, analysisId: 'an-shared' };
  const storeOf = async (res: Response) => (await pool.query('select store_id from remakes where id = $1', [((await res.json()) as { id: string }).id])).rows[0].store_id;
  expect(await storeOf(await post(shared))).toBeNull(); // the sharer's store is not the caller's
  expect(await storeOf(await post({ ...shared, storeId: 'store-ok' }))).toBeNull(); // a store sent in the body is ignored
  expect((await post({ ...shared, productAssetId: 'img-theirs' })).status).toBe(403); // the product must still be the caller's own image
  expect(await errorOf(await post({ ...shared, shots: [9] }))).toBe('shot 9 is not in the analysis');
  await pool.query(`update analyses set shared_title = null, shared_at = null where id = 'an-shared'`);
  const unshared = await post(shared);
  expect([unshared.status, await errorOf(unshared)]).toEqual([404, 'the analysis does not exist']);
});

test("outside the company workspace a remake carries no cost, neither its own nor any shot's", async () => {
  await pool.query(`insert into workspaces (id, name) values ('ws_rm', 'Partner RM')`);
  await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_rm', $1, 'member')`, [userId]);
  const shots = JSON.stringify({ shots: [{ index: 1, start: 0, end: 1, role: 'r', prompt: 'p' }] });
  await pool.query(`insert into analyses (id, user_id, team_id, source_key, status, result, workspace_id) select 'an-rm', u.id, u.team_id, 's3/vid', 'succeeded', $2::jsonb, 'ws_rm' from users u where u.id = $1`, [userId, shots]);
  const result = JSON.stringify({ shots: [{ index: 1, status: 'succeeded', costUsd: 0.2 }, { index: 2, status: 'failed', costUsd: 0.05 }] });
  await pool.query(
    `insert into remakes (id, user_id, team_id, analysis_id, shots, status, result, cost_usd, workspace_id)
       select 'rm-partner', u.id, u.team_id, 'an-rm', '[1]'::jsonb, 'succeeded', $2::jsonb, 0.25, 'ws_rm' from users u where u.id = $1`,
    [userId, result],
  );
  const asPartner = (path: string) => new Request(`http://localhost${path}`, { headers: { cookie: `${cookie}; cvs_ws=ws_rm` } });
  const one = (await (await ONE(asPartner('/api/remakes/rm-partner'), { params: Promise.resolve({ id: 'rm-partner' }) })).json()) as { costUsd: unknown; result: { shots: object[] } };
  const listed = ((await (await LIST(asPartner('/api/remakes'))).json()) as { remakes: { id: string }[] }).remakes.find((r) => r.id === 'rm-partner')!;
  for (const r of [one, listed]) {
    expect(r).toMatchObject({ costUsd: null, result: { shots: [{ index: 1, status: 'succeeded' }, { index: 2, status: 'failed' }] } });
    expect(JSON.stringify(r)).not.toContain('costUsd":0');
  }
  // In the company workspace the same fields go out.
  await pool.query(`update remakes set workspace_id = 'ws_vet' where id = 'rm-partner'`);
  const company = (await (await ONE(call('/api/remakes/rm-partner'), { params: Promise.resolve({ id: 'rm-partner' }) })).json()) as { costUsd: string; result: { shots: { costUsd: number }[] } };
  expect([company.costUsd, company.result.shots.map((s) => s.costUsd)]).toEqual(['0.250000', [0.2, 0.05]]);
});
