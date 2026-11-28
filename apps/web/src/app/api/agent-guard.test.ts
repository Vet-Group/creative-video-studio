// Agent access in guard() (lib/agent-access.ts): who a Bearer token is, what it may never touch, the write confirm every non-exempt agent write needs,
// and the limits, against real route handlers on a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 60_000 });

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;

// Everything the routes and the guard log is kept, to check that no secret reaches a log line.
const logged: string[] = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  const original = console[level].bind(console);
  vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
    logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    original(...args);
  });
}

const { pool } = await import('@/lib/auth');
const { agentContext, agentSession, bodyHash, newPat, signConfirm } = await import('@/lib/agent-access');
const { bucketName, ensureBucket, s3 } = await import('@/lib/storage');
const { stopBoss } = await import('@/lib/queue');
const { default: sharp } = await import('sharp');
const limits = await import('./me/limits/route');
const stores = await import('./stores/route');
const settings = await import('./admin/settings/route');
const costs = await import('./admin/costs/route');
const billingClose = await import('./admin/billing/close/route');
const jobStore = await import('./admin/jobs/[id]/store/route');
const adminUsers = await import('./admin/users/route');
const adminWorkspaces = await import('./admin/workspaces/route');
const sessionsRoute = await import('./me/sessions/route');
const stopImpersonating = await import('./me/stop-impersonating/route');
const profile = await import('./me/profile/route');
const members = await import('./workspaces/[id]/members/route');
const assets = await import('./assets/route');
const copy = await import('./assets/copy/route');
const compress = await import('./assets/[id]/compress/route');
const reframe = await import('./assets/[id]/reframe/route');
const cancel = await import('./jobs/[id]/cancel/route');
const job = await import('./jobs/[id]/route');
const zip = await import('./library/zip/route');
const lookbook = await import('./library/lookbook/route');

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
type Init = { method?: string; body?: unknown; headers?: Record<string, string>; raw?: BodyInit };
const req = (path: string, init: Init = {}) =>
  new Request(`http://localhost${path}`, {
    method: init.method ?? 'GET',
    headers: { ...(init.body !== undefined && { 'content-type': 'application/json' }), ...init.headers },
    body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
  });
const as = (token: string, path: string, init: Init = {}) => req(path, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });
const errorOf = async (res: Response) => ((await res.clone().json()) as { error: string }).error;

let seq = 0;
/** A user in ws_vet, made in SQL (no password: a token is all an agent has). */
async function user(role: 'admin' | 'member' = 'admin'): Promise<string> {
  const id = `u-agent-${++seq}`;
  await pool.query(`insert into users (id, email, name, role) values ($1, $2, $1, $3)`, [id, `${id}@example.test`, role]);
  await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_vet', $1, 'member') on conflict do nothing`, [id]);
  return id;
}
/** A PAT row for `userId`, inserted directly so a test may make it expired or bound elsewhere. */
async function token(userId: string, o: { workspaceId?: string; expired?: boolean } = {}): Promise<{ id: string; token: string }> {
  const { id, token: secret, hash } = newPat();
  await pool.query(
    `insert into api_tokens (id, user_id, workspace_id, kind, name, secret_hash, expires_at) values ($1, $2, $3, 'pat', 'test', $4, now() + $5 * interval '1 day')`,
    [id, userId, o.workspaceId ?? 'ws_vet', hash, o.expired ? -1 : 30],
  );
  return { id, token: secret };
}
const fresh = async (role: 'admin' | 'member' = 'admin') => {
  const userId = await user(role);
  return { userId, ...(await token(userId)) };
};
/** Resends a write with the confirm token its 428 gave. */
const confirmed = (first: Response, path: string, init: Init & { token: string }) =>
  first.json().then((b: { confirmToken: string }) => as(init.token, path, { ...init, headers: { 'x-cvs-confirm': b.confirmToken, ...init.headers } }));

async function insertJob(userId: string, status = 'queued'): Promise<string> {
  const id = `job-agent-${++seq}`;
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, workspace_id) values ($1, $2, 'team-unassigned', 'mock-agent', 'mock', 'p', '9:16', 5, '{}', $3, 'ws_vet')`,
    [id, userId, status],
  );
  return id;
}
/** A succeeded picture job of `userId` whose output is a real PNG in the bucket. */
async function pictureJob(userId: string): Promise<string> {
  const id = await insertJob(userId, 'succeeded');
  const key = `outputs/${id}.png`;
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#808080' } }).png().toBuffer();
  await s3().send(new PutObjectCommand({ Bucket: bucketName(), Key: key, Body: png, ContentType: 'image/png' }));
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, $2, 'output', $3, 'p.png', 'image/png', $4, 'ws_vet')`, [
    `out-${id}`,
    userId,
    key,
    png.length,
  ]);
  await pool.query(`update jobs set output_asset_id = $2, finished_at = now() where id = $1`, [id, `out-${id}`]);
  return id;
}
const settingsRow = async () => (await pool.query('select monthly_cap_usd::text as cap from settings where id = 1')).rows[0].cap as string;

beforeAll(async () => {
  await ensureBucket();
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled) values ('mock-agent', 'mock', 'mock', 'Mock', '{9:16}', '{5}', 4, '720p', 0.1, '{}', true)`,
  );
  await pool.query(`insert into workspaces (id, name) values ('ws_b', 'Partner B')`);
  await pool.query(`insert into stores (id, name, code, workspace_id) values ('store-vet', 'Vet store', 'SV', 'ws_vet'), ('store-b', 'B store', 'SB', 'ws_b')`);
});

afterAll(async () => {
  try {
    const Bucket = bucketName();
    const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
    const keys = Contents.flatMap(({ Key }) => (Key ? [{ Key }] : []));
    if (keys.length > 0) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys } }));
    await s3().send(new DeleteBucketCommand({ Bucket }));
    await stopBoss();
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

describe('who a token is', () => {
  test('a valid token acts as its Admin; revoked, expired, banned, temporary-password, demoted, removed, disabled-workspace and kill-switch requests are 401', async () => {
    const ok = await fresh();
    expect((await limits.GET(as(ok.token, '/api/me/limits'))).status).toBe(200);
    expect((await pool.query('select last_used_at is not null as used from api_tokens where id = $1', [ok.id])).rows[0].used).toBe(true);

    const cases: [string, (t: { userId: string; id: string }) => Promise<unknown>][] = [
      ['revoked', (t) => pool.query('update api_tokens set revoked_at = now() where id = $1', [t.id])],
      ['banned', (t) => pool.query('update users set banned = true where id = $1', [t.userId])],
      ['temporary password', (t) => pool.query('update users set must_change_password = true where id = $1', [t.userId])],
      ['demoted', (t) => pool.query(`update users set role = 'member' where id = $1`, [t.userId])],
      ['removed from the workspace', (t) => pool.query(`delete from workspace_members where user_id = $1`, [t.userId])],
    ];
    for (const [, change] of cases) {
      const t = await fresh();
      expect((await limits.GET(as(t.token, '/api/me/limits', { headers: { 'cf-connecting-ip': '198.51.100.1' } }))).status).toBe(200);
      await change(t);
      expect((await limits.GET(as(t.token, '/api/me/limits', { headers: { 'cf-connecting-ip': '198.51.100.1' } }))).status).toBe(401);
    }
    const expired = await token(await user(), { expired: true });
    expect((await limits.GET(as(expired.token, '/api/me/limits', { headers: { 'cf-connecting-ip': '198.51.100.2' } }))).status).toBe(401);

    const partner = await user();
    await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_b', $1, 'member')`, [partner]);
    const bound = await token(partner, { workspaceId: 'ws_b' });
    expect((await limits.GET(as(bound.token, '/api/me/limits'))).status).toBe(200);
    await pool.query(`update workspaces set disabled_at = now() where id = 'ws_b'`);
    expect((await limits.GET(as(bound.token, '/api/me/limits', { headers: { 'cf-connecting-ip': '198.51.100.2' } }))).status).toBe(401);
    await pool.query(`update workspaces set disabled_at = null where id = 'ws_b'`);

    process.env.CVS_AGENT_API = '0';
    try {
      const off = await limits.GET(as(ok.token, '/api/me/limits'));
      expect([off.status, await errorOf(off)]).toEqual([401, 'agent_api_off']);
    } finally {
      delete process.env.CVS_AGENT_API;
    }
    expect((await limits.GET(as(ok.token, '/api/me/limits'))).status).toBe(200);
  });

  test('a demotion pauses the token and a re-promotion restores it', async () => {
    const t = await fresh();
    await pool.query(`update users set role = 'member' where id = $1`, [t.userId]);
    expect((await limits.GET(as(t.token, '/api/me/limits', { headers: { 'cf-connecting-ip': '198.51.100.3' } }))).status).toBe(401);
    await pool.query(`update users set role = 'admin' where id = $1`, [t.userId]);
    expect((await limits.GET(as(t.token, '/api/me/limits'))).status).toBe(200);
  });

  test("the token's workspace wins over a cvs_ws cookie sent without a session", async () => {
    const t = await fresh();
    await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_b', $1, 'member')`, [t.userId]);
    const res = await stores.GET(as(t.token, '/api/stores', { headers: { cookie: 'cvs_ws=ws_b' } }));
    expect(res.status).toBe(200);
    const names = ((await res.json()) as { stores: { id: string }[] }).stores.map((s) => s.id);
    expect(names).toContain('store-vet');
    expect(names).not.toContain('store-b');
  });

  test('a Bearer token with a session cookie is 400; another Origin does not stop a token', async () => {
    const t = await fresh();
    for (const cookie of ['better-auth.session_token=abc', 'x=1; __Secure-better-auth.session_token=abc']) {
      const res = await limits.GET(as(t.token, '/api/me/limits', { headers: { cookie } }));
      expect([res.status, await errorOf(res)]).toEqual([400, 'ambiguous_credentials']);
    }
    const foreign = { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' };
    expect((await limits.GET(as(t.token, '/api/me/limits', { headers: foreign }))).status).toBe(200);
    const write = await settings.PUT(as(t.token, '/api/admin/settings', { method: 'PUT', body: { monthlyCapUsd: '1' }, headers: foreign }));
    expect(write.status).toBe(428);
  });

  test('a request run in an MCP agent context may carry neither a cookie nor an Authorization header', async () => {
    const t = await fresh();
    const resolved = await agentSession(as(t.token, '/api/me/limits'));
    const session = resolved!.session!;
    expect(await agentContext.run(session, async () => (await limits.GET(req('/api/me/limits'))).status)).toBe(200);
    for (const headers of [{ cookie: 'cvs_ws=ws_b' }, { authorization: 'Bearer anything' }] as Record<string, string>[]) {
      const res = await agentContext.run(session, () => limits.GET(req('/api/me/limits', { headers })));
      expect([res.status, await errorOf(res)]).toEqual([400, 'ambiguous_credentials']);
    }
  });
});

describe('what a token may never touch', () => {
  test('identity routes are 403 not_allowed_for_agent for every method; other admin routes answer', async () => {
    const t = await fresh();
    const denied: [string, Promise<Response>][] = [
      ['GET /api/admin/users', adminUsers.GET(as(t.token, '/api/admin/users'))],
      ['POST /api/admin/users', adminUsers.POST(as(t.token, '/api/admin/users', { method: 'POST', body: { email: 'x@example.test', name: 'X', role: 'admin' } }))],
      ['POST /api/admin/workspaces', adminWorkspaces.POST(as(t.token, '/api/admin/workspaces', { method: 'POST', body: { name: 'New', ownerEmail: 'o@example.test' } }))],
      ['GET /api/me/sessions', sessionsRoute.GET(as(t.token, '/api/me/sessions'))],
      ['POST /api/me/stop-impersonating', stopImpersonating.POST(as(t.token, '/api/me/stop-impersonating', { method: 'POST' }))],
      ['PATCH /api/me/profile', profile.PATCH(as(t.token, '/api/me/profile', { method: 'PATCH', body: { name: 'Mallory' } }))],
      ['POST /api/workspaces/ws_vet/members', members.POST(as(t.token, '/api/workspaces/ws_vet/members', { method: 'POST', body: { email: 'n@example.test' } }), ctx('ws_vet'))],
    ];
    for (const [name, pending] of denied) {
      const res = await pending;
      expect([name, res.status, await errorOf(res)]).toEqual([name, 403, 'not_allowed_for_agent']);
    }
    expect((await pool.query(`select count(*)::int as n from users where email in ('x@example.test', 'o@example.test', 'n@example.test')`)).rows[0].n).toBe(0);
    expect((await adminWorkspaces.GET(as(t.token, '/api/admin/workspaces'))).status).toBe(200);
    expect((await members.GET(as(t.token, '/api/workspaces/ws_vet/members'), ctx('ws_vet'))).status).not.toBe(403);
  });

  test('an Admin read is audited once as agent.read', async () => {
    const t = await fresh();
    expect((await costs.GET(as(t.token, '/api/admin/costs'))).status).toBe(200);
    const rows = (await pool.query(`select actor_id, new_value from audit_entries where action = 'agent.read' and target = $1`, [`api_token:${t.id}`])).rows;
    expect(rows).toEqual([{ actor_id: t.userId, new_value: { method: 'GET', path: '/api/admin/costs', workspaceId: 'ws_vet', via: 'bearer' } }]);
    await limits.GET(as(t.token, '/api/me/limits'));
    expect((await pool.query(`select count(*)::int as n from audit_entries where target = $1`, [`api_token:${t.id}`])).rows[0].n).toBe(1);
  });
});

describe('rate limits', () => {
  test('the 121st request of a minute on one token is 429 with X-Retry-After', async () => {
    const t = await fresh();
    for (let i = 0; i < 120; i++) expect((await limits.GET(as(t.token, '/api/me/limits'))).status).toBe(200);
    const res = await limits.GET(as(t.token, '/api/me/limits'));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('x-retry-after'))).toBeGreaterThan(0);
  });

  test('the 21st failed sign-in of a minute from one IP is 429', async () => {
    const wrong = `cvs_pat_${'A'.repeat(12)}_${'B'.repeat(43)}`;
    const headers = { 'cf-connecting-ip': '203.0.113.21' };
    for (let i = 0; i < 20; i++) expect((await limits.GET(as(wrong, '/api/me/limits', { headers }))).status).toBe(401);
    const res = await limits.GET(as(wrong, '/api/me/limits', { headers }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('x-retry-after'))).toBeGreaterThan(0);
    const t = await fresh();
    expect((await limits.GET(as(t.token, '/api/me/limits', { headers }))).status).toBe(429); // the IP waits, whoever it is
    expect((await limits.GET(as(t.token, '/api/me/limits', { headers: { 'cf-connecting-ip': '203.0.113.22' } }))).status).toBe(200);
  });

  test('the 31st dry run of a minute is 429', async () => {
    const t = await fresh();
    for (let i = 0; i < 30; i++) expect((await settings.PUT(as(t.token, '/api/admin/settings', { method: 'PUT', body: { monthlyCapUsd: String(i) } }))).status).toBe(428);
    expect((await settings.PUT(as(t.token, '/api/admin/settings', { method: 'PUT', body: { monthlyCapUsd: '31' } }))).status).toBe(429);
  });
});

describe('the write confirm', () => {
  const put = (t: string, body: unknown, headers: Record<string, string> = {}) => settings.PUT(as(t, '/api/admin/settings', { method: 'PUT', body, headers }));

  test('a write is 428 until resent with its confirm, which is single-use and bound to the body', async () => {
    const t = await fresh();
    const before = await settingsRow();
    const body = { monthlyCapUsd: '777.5', memberDailyClipCap: 8 };
    const first = await put(t.token, body);
    expect(first.status).toBe(428);
    const dry = (await first.clone().json()) as { error: string; method: string; path: string; summary: unknown; confirmToken: string; expiresAt: string };
    expect(dry).toMatchObject({ error: 'confirm_required', method: 'PUT', path: '/api/admin/settings', summary: body });
    expect(await settingsRow()).toBe(before);

    // Key order and spacing do not change the body's hash.
    const ok = await settings.PUT(as(t.token, '/api/admin/settings', { method: 'PUT', raw: '{ "memberDailyClipCap": 8, "monthlyCapUsd": "777.5" }', headers: { 'x-cvs-confirm': dry.confirmToken } }));
    expect(ok.status).toBe(200);
    expect(await settingsRow()).toBe('777.5000');
    const nonce = dry.confirmToken.split('.')[0];
    const audited = (await pool.query(`select new_value from audit_entries where action = 'agent.request' and target = $1`, [`api_token:${t.id}`])).rows;
    expect(audited).toEqual([{ new_value: { method: 'PUT', path: '/api/admin/settings', workspaceId: 'ws_vet', via: 'bearer', nonce } }]);

    const again = await put(t.token, body, { 'x-cvs-confirm': dry.confirmToken });
    expect([again.status, await errorOf(again)]).toEqual([409, 'confirm_used']);
    const edited = await put(t.token, { ...body, monthlyCapUsd: '9999' }, { 'x-cvs-confirm': ((await (await put(t.token, body)).json()) as { confirmToken: string }).confirmToken });
    expect([edited.status, await errorOf(edited)]).toEqual([409, 'confirm_invalid']);
    const old = signConfirm({ tokenId: t.id, method: 'PUT', path: '/api/admin/settings', hash: bodyHash(Buffer.from(JSON.stringify(body))) }, '-', Date.now() - 11 * 60_000);
    const expired = await put(t.token, body, { 'x-cvs-confirm': old.confirmToken });
    expect([expired.status, await errorOf(expired)]).toEqual([409, 'confirm_expired']);
    expect(await settingsRow()).toBe('777.5000');
  });

  test('admin writes with no transaction of their own (billing close, a job store move) are held the same way, with no route edit', async () => {
    const t = await fresh();
    const closeInit = { method: 'POST', body: { month: '2026-01' } };
    const first = await billingClose.POST(as(t.token, '/api/admin/billing/close', closeInit));
    expect(first.status).toBe(428);
    expect((await pool.query(`select count(*)::int as n from billing_month_closes where month = '2026-01'`)).rows[0].n).toBe(0);
    const ok = await billingClose.POST(await confirmed(first, '/api/admin/billing/close', { ...closeInit, token: t.token }));
    expect(ok.status).toBe(200);
    expect((await pool.query(`select count(*)::int as n from billing_month_closes where month = '2026-01'`)).rows[0].n).toBe(1);

    const id = await insertJob(t.userId);
    const moveInit = { method: 'PUT', body: { storeId: 'store-vet' } };
    const dry = await jobStore.PUT(as(t.token, `/api/admin/jobs/${id}/store`, moveInit), ctx(id));
    expect(dry.status).toBe(428);
    const sent = await confirmed(dry, `/api/admin/jobs/${id}/store`, { ...moveInit, token: t.token });
    expect((await jobStore.PUT(sent.clone(), ctx(id))).status).toBe(200);
    expect((await pool.query('select store_id from jobs where id = $1', [id])).rows[0].store_id).toBe('store-vet');
    const reused = await jobStore.PUT(sent, ctx(id));
    expect([reused.status, await errorOf(reused)]).toEqual([409, 'confirm_used']);
  });

  test('a bodyless write is 428, then goes through with its confirm', async () => {
    const t = await fresh();
    const id = await pictureJob(t.userId);
    const first = await job.DELETE(as(t.token, `/api/jobs/${id}`, { method: 'DELETE' }), ctx(id));
    expect(first.status).toBe(428);
    expect((await pool.query('select deleted_at from jobs where id = $1', [id])).rows[0].deleted_at).toBeNull();
    const ok = await job.DELETE(await confirmed(first, `/api/jobs/${id}`, { method: 'DELETE', token: t.token }), ctx(id));
    expect(ok.status).toBe(200);
    expect((await pool.query('select deleted_at from jobs where id = $1', [id])).rows[0].deleted_at).not.toBeNull();
  });

  test('chunked, oversized and multipart bodies are refused before the handler runs', async () => {
    const t = await fresh();
    const before = await settingsRow();
    const chunked = await settings.PUT(as(t.token, '/api/admin/settings', { method: 'PUT', body: { monthlyCapUsd: '5' }, headers: { 'transfer-encoding': 'chunked' } }));
    expect([chunked.status, await errorOf(chunked)]).toEqual([413, 'body_too_large_for_confirm']);
    const big = JSON.stringify({ monthlyCapUsd: '5', pad: 'x'.repeat(1_000_000) });
    const declared = await settings.PUT(as(t.token, '/api/admin/settings', { method: 'PUT', raw: big, headers: { 'content-type': 'application/json', 'content-length': String(big.length) } }));
    expect([declared.status, await errorOf(declared)]).toEqual([413, 'body_too_large_for_confirm']);
    const undeclared = await settings.PUT(as(t.token, '/api/admin/settings', { method: 'PUT', raw: big, headers: { 'content-type': 'application/json' } }));
    expect([undeclared.status, await errorOf(undeclared)]).toEqual([413, 'body_too_large_for_confirm']);
    expect(await settingsRow()).toBe(before);

    const form = new FormData();
    form.append('assetId', 'x');
    const assetsBefore = (await pool.query('select count(*)::int as n from assets')).rows[0].n;
    const multipart = await copy.POST(as(t.token, '/api/assets/copy', { method: 'POST', raw: form }));
    expect([multipart.status, await errorOf(multipart)]).toEqual([415, 'multipart_not_confirmable']);
    expect((await pool.query('select count(*)::int as n from assets')).rows[0].n).toBe(assetsBefore);
  });

  test('only the exact exempt routes skip the confirm', async () => {
    const t = await fresh();
    const id = await pictureJob(t.userId);
    const asset = `out-${id}`;
    expect((await copy.POST(as(t.token, '/api/assets/copy', { method: 'POST', body: { assetId: asset } }))).status).toBe(428);
    expect((await compress.POST(as(t.token, `/api/assets/${asset}/compress`, { method: 'POST' }), ctx(asset))).status).toBe(428);
    expect((await reframe.POST(as(t.token, `/api/assets/${asset}/reframe`, { method: 'POST', body: { ratio: '1:1' } }), ctx(asset))).status).toBe(428);

    const form = new FormData();
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).png().toBuffer();
    form.append('file', new File([new Uint8Array(png)], 'agent.png', { type: 'image/png' }));
    expect((await assets.POST(as(t.token, '/api/assets', { method: 'POST', raw: form }))).status).toBe(201);

    const queued = await insertJob(t.userId);
    const canceled = await cancel.POST(as(t.token, `/api/jobs/${queued}/cancel`, { method: 'POST' }), ctx(queued));
    expect(canceled.status).toBe(200);
    expect((await pool.query('select status from jobs where id = $1', [queued])).rows[0].status).toBe('failed');

    expect((await zip.POST(as(t.token, '/api/library/zip', { method: 'POST', body: { ids: [id] } }))).status).toBe(200);
    const other = await pictureJob(t.userId);
    expect((await lookbook.POST(as(t.token, '/api/library/lookbook', { method: 'POST', body: { ids: [id, other] } }))).status).toBe(200);
  });
});

test('no token, secret or hash reaches a log line', () => {
  const joined = logged.join('\n');
  expect(joined).not.toMatch(/cvs_(pat|oat|ort)_/);
  expect(joined).not.toMatch(/[0-9a-f]{64}/);
});
