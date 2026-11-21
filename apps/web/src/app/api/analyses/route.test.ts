// The reference-video analysis API: the feature flag gate, who may analyse which video, and the queued row it writes,
// against a disposable database on the compose Postgres. No S3 or rea-video binary: the worker consumes the queue.
import { randomBytes } from 'node:crypto';
import { bookLlm } from '@cvs/core/ledger';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

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
const { PUT: SHARE, DELETE: UNSHARE } = await import('./[id]/share/route');
const { GET: ASSET } = await import('../assets/[id]/route');
const { GET: CONTENT } = await import('../assets/[id]/content/route');

const PASSWORD = 'correct-horse-battery';
let cookie = '';
let adminCookie = '';
let userId = '';
let otherId = '';

const call = (path: string, method = 'GET', body?: unknown, as = cookie) =>
  new Request(`http://localhost${path}`, { method, headers: { cookie: as, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
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
  await auth.api.createUser({ body: { email: 'admin@example.test', name: 'Admin', password: PASSWORD, role: 'admin' } });
  userId = user.id;
  otherId = other.user.id;
  const signIn = async (email: string) =>
    (await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true })).headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
  cookie = await signIn('member@example.test');
  adminCookie = await signIn('admin@example.test');
  await pool.query(
    `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, duration_ms, workspace_id) values
       ('v1', $1, 'input', 's3/v1', 'ref.mp4', 'video/mp4', 1000, 5000, 'ws_vet'),
       ('img', $1, 'input', 's3/img', 'a.png', 'image/png', 1, null, 'ws_vet'),
       ('v-theirs', $2, 'input', 's3/theirs', 't.mp4', 'video/mp4', 1000, 5000, 'ws_vet'),
       ('v-shared', $2, 'input', 's3/shared', 'tee-front.mp4', 'video/mp4', 1000, 8000, 'ws_vet')`,
    [userId, other.user.id],
  );
  await pool.query(`insert into stores (id, name, code, workspace_id) values ('store-ok', 'Shop', 'SOK', 'ws_vet'), ('store-hidden', 'Gone', 'SGONE', 'ws_vet')`);
  await pool.query(`update stores set hidden = true where id = 'store-hidden'`);
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

/** Finishes the member's unfinished analyses, so the next one may start. */
const settle = () => pool.query(`update analyses set status = 'succeeded', finished_at = now() where user_id = $1 and status in ('queued', 'running')`, [userId]);

test('refuses a new analysis while the member already has one queued or running, in words for the member (429)', async () => {
  const queued = await post({ sourceAssetId: 'v1' });
  expect(queued.status).toBe(429);
  expect(await errorOf(queued)).toBe('Bạn đang có một phân tích chưa xong. Hãy đợi nó xong rồi phân tích video tiếp theo.');
  await pool.query(`update analyses set status = 'running' where user_id = $1 and status = 'queued'`, [userId]);
  expect((await post({ sourceAssetId: 'v1' })).status).toBe(429);
  await settle();
  // Two quick sends: the per-member lock lets only one through.
  const both = await Promise.all([post({ sourceAssetId: 'v1' }), post({ sourceAssetId: 'v1' })]);
  expect(both.map((r) => r.status).sort()).toEqual([201, 429]);
  expect((await pool.query(`select count(*)::int as n from analyses where user_id = $1 and status = 'queued'`, [userId])).rows[0].n).toBe(1);
  // A queued row older than the queue's expiry lost its queue job (nothing ever starts it), so it no longer holds the member back.
  await pool.query(`update analyses set created_at = now() - interval '1 hour' where user_id = $1 and status = 'queued'`, [userId]);
  expect((await post({ sourceAssetId: 'v1' })).status).toBe(201);
  // Another member is not held back by this one's analysis.
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, duration_ms, workspace_id) values ('v-other', $1, 'input', 's3/other', 'o.mp4', 'video/mp4', 1000, 5000, 'ws_vet')`, [otherId]);
  const otherCookie = (await auth.api.signInEmail({ body: { email: 'other@example.test', password: PASSWORD }, asResponse: true })).headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  expect((await POST(call('/api/analyses', 'POST', { sourceAssetId: 'v-other' }, otherCookie))).status).toBe(201);
  await pool.query(`delete from analyses where user_id = $1`, [otherId]);
  await settle();
});

test('refuses the 21st analysis of the ICT day (the daily cap, 20 by default), not counting a failed one with no cost booked or one from yesterday', async () => {
  const { user } = await auth.api.createUser({ body: { email: 'daily@example.test', name: 'Daily', password: PASSWORD, role: 'member' } });
  const dailyCookie = (await auth.api.signInEmail({ body: { email: 'daily@example.test', password: PASSWORD }, asResponse: true })).headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, duration_ms, workspace_id) values ('v-daily', $1, 'input', 's3/daily', 'd.mp4', 'video/mp4', 1000, 5000, 'ws_vet')`, [user.id]);
  const add = (name: string, n: number, status: string, created = 'now()') =>
    pool.query(
      `insert into analyses (id, user_id, team_id, source_key, status, workspace_id, created_at) select $2 || '-' || g, u.id, u.team_id, 's3/daily', $3, 'ws_vet', ${created}
         from users u, generate_series(1, $4::int) g where u.id = $1`,
      [user.id, name, status, n],
    );
  const send = () => POST(call('/api/analyses', 'POST', { sourceAssetId: 'v-daily' }, dailyCookie));
  await add('daily-done', 18, 'succeeded');
  await add('daily-paid', 1, 'failed'); // failed after its call was paid: it counts
  await bookLlm(pool, { analysis: 'daily-paid-1' }, { costUsd: 0.1, provider: 'gemini', model: 'flash' });
  await add('daily-free', 3, 'failed'); // failed with nothing booked: free, not counted
  await add('daily-yesterday', 5, 'succeeded', `now() - interval '1 day'`); // the ICT day before
  expect((await send()).status).toBe(201); // the 20th of today
  await pool.query(`update analyses set status = 'succeeded' where user_id = $1 and status = 'queued'`, [user.id]);
  const refused = await send();
  expect(refused.status).toBe(429);
  expect(await errorOf(refused)).toBe('Hôm nay bạn đã dùng hết 20 lượt phân tích. Mai bạn dùng tiếp được.');
  expect((await pool.query(`select count(*)::int as n from analyses where user_id = $1`, [user.id])).rows[0].n).toBe(28);
});

test('refuses a video that is not the caller’s, a non-video asset, a missing asset and a hidden store', async () => {
  expect((await post({ sourceAssetId: 'v-theirs' })).status).toBe(403); // another user's video, not in the caller's library: readableAsset refuses it
  expect(await errorOf(await post({ sourceAssetId: 'img' }))).toBe('sourceAssetId must be a video');
  expect((await post({ sourceAssetId: 'nope' })).status).toBe(404);
  expect(await errorOf(await post({ sourceAssetId: 'v1', storeId: 'store-hidden' }))).toBe('the store does not exist or is hidden');
  expect(await errorOf(await post({}))).toBe('sourceAssetId, and an optional storeId, are required');
});

test('refuses another billing team’s store to a member of a billing team (docs/BILLING.md)', async () => {
  const team = (await pool.query('select team_id from users where id = $1', [userId])).rows[0].team_id;
  await pool.query(`insert into teams (id, name, billable) values ('an-sales-a', 'Sales A', true), ('an-sales-b', 'Sales B', true)`);
  await pool.query(`insert into stores (id, name, code, workspace_id, team_id) values ('an-st-a', 'A', 'ANA', 'ws_vet', 'an-sales-a'), ('an-st-b', 'B', 'ANB', 'ws_vet', 'an-sales-b')`);
  await pool.query(`update users set team_id = 'an-sales-a' where id = $1`, [userId]);
  try {
    const refused = await post({ sourceAssetId: 'v1', storeId: 'an-st-b' });
    expect([refused.status, ((await refused.json()) as { code: string }).code]).toEqual([403, 'store_not_in_team']);
    expect((await post({ sourceAssetId: 'v1', storeId: 'store-ok' })).status).toBe(403); // a store of no team is not the team's either
    expect((await post({ sourceAssetId: 'v1', storeId: 'an-st-a' })).status).toBe(201);
    await settle();
    expect((await post({ sourceAssetId: 'v1' })).status).toBe(201);
    await settle();
  } finally {
    await pool.query('update users set team_id = $2 where id = $1', [userId, team]);
  }
});

test('polls one of the caller’s analyses and hides another user’s', async () => {
  const { id } = (await (await post({ sourceAssetId: 'v1' })).json()) as { id: string };
  const got = await ONE(call(`/api/analyses/${id}`), { params: Promise.resolve({ id }) });
  expect(got.status).toBe(200);
  expect(((await got.json()) as { status: string }).status).toBe('queued');
  await pool.query(`insert into analyses (id, user_id, team_id, store_id, source_key, workspace_id) select 'an-theirs', u.id, u.team_id, null, 's3/x', 'ws_vet' from users u where u.email = 'other@example.test'`);
  expect((await ONE(call('/api/analyses/an-theirs'), { params: Promise.resolve({ id: 'an-theirs' }) })).status).toBe(404);
});

test('lists the caller’s analyses newest first', async () => {
  const list = (await (await LIST(call('/api/analyses'))).json()) as { analyses: { id: string; status: string; createdAt: string }[] };
  expect(list.analyses.length).toBeGreaterThanOrEqual(2);
  expect(list.analyses[0]!.status).toBe('queued'); // the one the previous test sent
  const times = list.analyses.map((a) => Date.parse(a.createdAt));
  expect(times).toEqual([...times].sort((a, b) => b - a));
  expect(list.analyses.some((a) => a.id === 'an-theirs')).toBe(false);
});

const remove = (id: string) => REMOVE(call(`/api/analyses/${id}`, 'DELETE'), { params: Promise.resolve({ id }) });
const addAnalysis = (id: string, status: string, user = 'member@example.test') =>
  pool.query(`insert into analyses (id, user_id, team_id, store_id, source_key, status, workspace_id) select $1, u.id, u.team_id, null, 's3/x', $2, 'ws_vet' from users u where u.email = $3`, [id, status, user]);

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
  await pool.query(`insert into remakes (id, user_id, team_id, analysis_id, shots, workspace_id) select 'rm-del', u.id, u.team_id, 'del-remade', '[1]', 'ws_vet' from users u where u.email = 'member@example.test'`);
  const res = await remove('del-remade');
  expect(res.status).toBe(409);
  expect(await errorOf(res)).toContain('lượt làm lại');
  expect((await pool.query(`select id from analyses where id = 'del-remade'`)).rowCount).toBe(1);
});

test('delete 404s while the feature is off', async () => {
  await withFlag(undefined, async () => expect((await remove('x')).status).toBe(404));
});

describe('shared reference videos', () => {
  const shots = JSON.stringify({ durationS: 8, shots: [1, 2, 3].map((index) => ({ index, start: index - 1, end: index, role: 'r', prompt: index < 3 ? 'same' : 'other' })) });
  const share = (id: string, body: unknown, as = adminCookie) => SHARE(call(`/api/analyses/${id}/share`, 'PUT', body, as), { params: Promise.resolve({ id }) });
  const unshare = (id: string, as = adminCookie) => UNSHARE(call(`/api/analyses/${id}/share`, 'DELETE', undefined, as), { params: Promise.resolve({ id }) });
  const audits = async (id: string) => (await pool.query(`select action, new_value from audit_entries where target = $1 order by id`, [`analysis:${id}`])).rows;
  const shared = async () => ((await (await LIST(call('/api/analyses?shared=1'))).json()) as { analyses: Record<string, unknown>[] }).analyses;
  const one = (id: string) => ONE(call(`/api/analyses/${id}`), { params: Promise.resolve({ id }) });
  const asset = (id: string, route = ASSET) => route(call(`/api/assets/${id}`), { params: Promise.resolve({ id }) });
  // Another member's analysis of `source`, finished unless a status is given.
  const theirs = (id: string, source: string, status = 'succeeded') =>
    pool.query(
      `insert into analyses (id, user_id, team_id, source_key, status, result, provider, model, cost_usd, workspace_id) select $1, u.id, u.team_id, $3, $4, $5::jsonb, 'gemini', 'flash', 0.5, 'ws_vet' from users u where u.id = $2`,
      [id, otherId, source, status, status === 'succeeded' ? shots : null],
    );

  beforeAll(async () => {
    await pool.query(
      `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, deleted_at, workspace_id) values
         ('v-gone', $1, 'input', 's3/gone', 'gone.mp4', 'video/mp4', 1, now(), 'ws_vet'), ('v-later', $1, 'input', 's3/later', 'later.mp4', 'video/mp4', 1, null, 'ws_vet')`,
      [otherId],
    );
    await theirs('an-share', 's3/shared');
    await theirs('an-unshared', 's3/theirs');
    await theirs('an-share-running', 's3/theirs', 'running');
    await theirs('an-no-source', 's3/none');
    await theirs('an-gone', 's3/gone');
    await theirs('an-later', 's3/later');
  });

  test('only an Admin shares, only a finished analysis whose source video is still there, under a trimmed title of 1 to 80 characters', async () => {
    expect((await share('an-share', { title: 'Tee' }, cookie)).status).toBe(403);
    expect((await unshare('an-share', cookie)).status).toBe(403);
    expect(await errorOf(await share('an-share-running', { title: 'Tee' }))).toBe('only a finished analysis can be shared');
    expect(await errorOf(await share('an-no-source', { title: 'Tee' }))).toBe('the analysis has no source video to share');
    expect(await errorOf(await share('an-gone', { title: 'Tee' }))).toBe('the analysis has no source video to share'); // soft-deleted
    for (const title of ['   ', 'x'.repeat(81), 7, undefined]) expect(await errorOf(await share('an-share', { title }))).toBe('title must be 1 to 80 characters');
    expect((await share('nope', { title: 'Tee' })).status).toBe(404);
    expect((await pool.query(`select count(*)::int as n from analyses where shared_title is not null`)).rows[0].n).toBe(0);
    await withFlag(undefined, async () => expect((await share('an-share', { title: 'Tee' })).status).toBe(404));
  });

  test('shares, renames in place and unshares, each change audited once', async () => {
    const first = await share('an-share', { title: '  Áo thun trơn  ' });
    expect(first.status).toBe(200);
    const { sharedAt } = (await first.json()) as { sharedTitle: string; sharedAt: string };
    expect(sharedAt).toBeTruthy();
    expect((await (await share('an-share', { title: 'Áo thun trơn' })).json()) as object).toEqual({ sharedTitle: 'Áo thun trơn', sharedAt }); // a repeat
    expect((await (await share('an-share', { title: 'Tee' })).json()) as object).toEqual({ sharedTitle: 'Tee', sharedAt }); // renamed, same place on the shelf
    expect((await (await unshare('an-share')).json()) as object).toEqual({ sharedTitle: null, sharedAt: null });
    expect((await unshare('an-share')).status).toBe(200); // a repeat
    expect(await audits('an-share')).toEqual([
      { action: 'analysis.share', new_value: { sharedTitle: 'Áo thun trơn' } },
      { action: 'analysis.share', new_value: { sharedTitle: 'Tee' } },
      { action: 'analysis.unshare', new_value: { sharedTitle: null } },
    ]);
  });

  test('every member lists the shared ones, newest share first, with only what a card shows, and none whose source video was deleted', async () => {
    expect(await shared()).toEqual([]);
    await pool.query(
      `insert into analyses (id, user_id, team_id, source_key, status, result, provider, workspace_id) select 'an-mine-shared', u.id, u.team_id, 's3/v1', 'succeeded', $2::jsonb, 'gemini', 'ws_vet' from users u where u.id = $1`,
      [userId, shots],
    );
    await share('an-later', { title: 'Later' });
    await share('an-mine-shared', { title: 'Mine' });
    await share('an-share', { title: 'Tee' });
    expect((await shared()).map((a) => a.id)).toEqual(['an-share', 'an-mine-shared', 'an-later']);
    await pool.query(`update assets set deleted_at = now() where id = 'v-later'`);
    const list = await shared();
    expect(list.map((a) => a.id)).toEqual(['an-share', 'an-mine-shared']);
    expect(list[0]).toEqual({ id: 'an-share', title: 'Tee', sharedAt: expect.any(String), sourceAssetId: 'v-shared', durationS: 8, sceneCount: 2 }); // no owner, cost or result
    const own = ((await (await LIST(call('/api/analyses'))).json()) as { analyses: { id: string; sharedTitle: string | null }[] }).analyses;
    expect(own.some((a) => a.id === 'an-share')).toBe(false); // the own list stays the caller's
    expect(own.find((a) => a.id === 'an-mine-shared')?.sharedTitle).toBe('Mine');
  });

  test('a shared analysis opens for any member without its owner’s cost, provider, model or error; the owner still sees them', async () => {
    const got = await one('an-share');
    expect(got.status).toBe(200);
    expect((await got.json()) as object).toMatchObject({ id: 'an-share', status: 'succeeded', sharedTitle: 'Tee', sourceAssetId: 'v-shared', costUsd: null, provider: null, model: null, error: null });
    expect((await (await one('an-mine-shared')).json()) as object).toMatchObject({ id: 'an-mine-shared', provider: 'gemini' });
    expect((await one('an-unshared')).status).toBe(404); // another member's finished analysis that is not shared
  });

  test('the source video of a shared analysis is readable by any member while it is shared, and nothing else of its owner is', async () => {
    expect((await asset('v-shared')).status).toBe(200);
    expect((await asset('v-theirs')).status).toBe(403); // the owner's other video, the source of a finished analysis that is not shared
    expect((await asset('v-theirs', CONTENT)).status).toBe(403);
    await unshare('an-share');
    expect((await asset('v-shared')).status).toBe(403);
    expect((await asset('v-shared', CONTENT)).status).toBe(403);
    expect((await one('an-share')).status).toBe(404); // unsharing also closes the analysis itself
    await share('an-share', { title: 'Tee' });
  });

  test('the owner of a shared analysis that another member remade gets its own refusal; their own remake keeps the usual one', async () => {
    await pool.query(`insert into remakes (id, user_id, team_id, analysis_id, shots, workspace_id) select 'rm-by-other', u.id, u.team_id, 'an-mine-shared', '[1]', 'ws_vet' from users u where u.id = $1`, [otherId]);
    const byOther = await remove('an-mine-shared');
    expect([byOther.status, await errorOf(byOther)]).toEqual([409, 'Video mẫu này đã có người dùng để làm lại nên không xoá được.']);
    await pool.query(`insert into remakes (id, user_id, team_id, analysis_id, shots, workspace_id) select 'rm-by-owner', u.id, u.team_id, 'an-mine-shared', '[1]', 'ws_vet' from users u where u.id = $1`, [userId]);
    const own = await remove('an-mine-shared');
    expect([own.status, await errorOf(own)]).toEqual([409, 'Phân tích này đã có lượt làm lại nên không xoá được.']);
    expect((await pool.query(`select id from analyses where id = 'an-mine-shared'`)).rowCount).toBe(1);
  });

  describe('an Admin viewing every member’s analyses', () => {
    const oneAs = (id: string, as: string) => ONE(call(`/api/analyses/${id}`, 'GET', undefined, as), { params: Promise.resolve({ id }) });
    const all = (as: string) => LIST(call('/api/analyses?scope=all', 'GET', undefined, as));

    test('opens any member’s analysis, shared or not, with its cost, provider and creator; a member still gets 404 for an unshared one', async () => {
      const got = await oneAs('an-unshared', adminCookie);
      expect(got.status).toBe(200);
      expect((await got.json()) as object).toMatchObject({ id: 'an-unshared', provider: 'gemini', model: 'flash', costUsd: expect.anything(), creatorName: 'Other' });
      expect((await (await oneAs('an-mine-shared', adminCookie)).json()) as object).toMatchObject({ provider: 'gemini', creatorName: 'Member' });
      expect((await oneAs('an-unshared', cookie)).status).toBe(404);
      expect((await oneAs('an-mine-shared', cookie).then((r) => r.json())) as object).toMatchObject({ creatorName: null }); // a member never learns who made another's
      expect(((await oneAs('an-share', cookie).then((r) => r.json())) as { creatorName: unknown }).creatorName).toBeNull();
    });

    test('scope=all lists every member’s analyses with their creators for an Admin only; a plain list stays the caller’s', async () => {
      expect((await all(cookie)).status).toBe(403);
      const list = ((await (await all(adminCookie)).json()) as { analyses: { id: string; creatorName: string | null }[] }).analyses;
      expect(list.find((a) => a.id === 'an-unshared')?.creatorName).toBe('Other');
      expect(list.find((a) => a.id === 'an-mine-shared')?.creatorName).toBe('Member');
      const own = ((await (await LIST(call('/api/analyses', 'GET', undefined, adminCookie))).json()) as { analyses: unknown[] }).analyses;
      expect(own).toEqual([]); // the Admin made none
      const mine = ((await (await LIST(call('/api/analyses'))).json()) as { analyses: { id: string; creatorName: string | null }[] }).analyses;
      expect(mine.every((a) => a.creatorName === null)).toBe(true);
    });

    test('an Admin still cannot delete another member’s analysis', async () => {
      const res = await REMOVE(call('/api/analyses/an-unshared', 'DELETE', undefined, adminCookie), { params: Promise.resolve({ id: 'an-unshared' }) });
      expect(res.status).toBe(404);
      expect((await pool.query(`select id from analyses where id = 'an-unshared'`)).rowCount).toBe(1);
    });
  });
});
