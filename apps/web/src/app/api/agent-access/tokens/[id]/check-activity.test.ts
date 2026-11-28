// Settings > "Connect AI": the per-connection check (tokens/[id]/check) and activity log (tokens/[id]/activity). Who may call them (an Admin's own cookie,
// never a member, a visitor, a "sign in as" session or a Bearer), what the check reports for each state without the secret, and that the log holds only
// that connection's rows, paged, labelled, and without bodies, digests, nonces or IPs. Real better-auth sign-in on a disposable database (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 60_000 });

const ORIGIN = 'http://localhost';
const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = ORIGIN;

const { auth, pool } = await import('@/lib/auth');
const tokens = await import('../route');
const check = await import('./check/route');
const activity = await import('./activity/route');
const { GET: limits } = await import('../../../me/limits/route');

const PASSWORD = 'correct-horse-battery';
afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

async function user(email: string, role: 'member' | 'admin') {
  const id = (await auth.api.createUser({ body: { email, name: email, role, password: PASSWORD, data: { emailVerified: true } } })).user.id;
  await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_vet', $1, 'member') on conflict do nothing`, [id]);
  return id;
}
async function signIn(email: string) {
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0]!)
    .join('; ');
}
const get = (path: string, headers: Record<string, string>) => new Request(`${ORIGIN}${path}`, { headers });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const checkOf = (id: string, headers: Record<string, string>) => check.GET(get(`/api/agent-access/tokens/${id}/check`, headers), ctx(id));
const activityOf = (id: string, headers: Record<string, string>, query = '') => activity.GET(get(`/api/agent-access/tokens/${id}/activity${query}`, headers), ctx(id));
const errorOf = async (res: Response) => ((await res.clone().json()) as { error: string }).error;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
type Check = { id: string; ok: boolean; status: string; reason: string | null; lastUsedAt: string | null; lastUsedIp: string | null; monthSpendUsd: string };
type Item = { id: string; at: string; action: string; label: string; method: string | null; path: string | null; ok: boolean };
type Page = { items: Item[]; next: string | null };

let admin: string;
let adminCookie = '', memberCookie = '';
let mine: { id: string; token: string }, theirs: { id: string; token: string };

async function make(cookie: string, name: string) {
  const res = await tokens.POST(
    new Request(`${ORIGIN}/api/agent-access/tokens`, { method: 'POST', headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ name }) }),
  );
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; token: string };
}

beforeAll(async () => {
  admin = await user('admin@example.test', 'admin');
  await user('other@example.test', 'admin');
  await user('member@example.test', 'member');
  let otherCookie: string;
  [adminCookie, otherCookie, memberCookie] = await Promise.all([signIn('admin@example.test'), signIn('other@example.test'), signIn('member@example.test')]);
  mine = await make(adminCookie, 'Claude Code');
  theirs = await make(otherCookie, 'OpenMausBot');
});

describe('who may call the check and the activity log', () => {
  test('a member, a visitor and a Bearer are refused; the Bearer refusal is logged against that connection only', async () => {
    const cookie = { cookie: adminCookie };
    expect((await checkOf(mine.id, { cookie: memberCookie })).status).toBe(403);
    expect((await activityOf(mine.id, { cookie: memberCookie })).status).toBe(403);
    expect((await checkOf(mine.id, {})).status).toBe(401);
    expect((await activityOf(mine.id, {})).status).toBe(401);
    for (const res of [await checkOf(mine.id, bearer(mine.token)), await activityOf(mine.id, bearer(mine.token)), await checkOf(theirs.id, bearer(mine.token))]) {
      expect([res.status, await errorOf(res)]).toEqual([403, 'not_allowed_for_agent']);
    }
    const page = (await (await activityOf(mine.id, cookie)).json()) as Page;
    expect(page.items.filter((i) => i.action === 'agent.refused').map((i) => [i.label, i.method, i.path, i.ok])).toEqual([
      ['Bị chặn: không được phép', 'GET', `/api/agent-access/tokens/${theirs.id}/check`, false],
      ['Bị chặn: không được phép', 'GET', `/api/agent-access/tokens/${mine.id}/activity`, false],
      ['Bị chặn: không được phép', 'GET', `/api/agent-access/tokens/${mine.id}/check`, false],
    ]);
    const other = (await (await activityOf(theirs.id, cookie)).json()) as Page;
    expect(other.items.map((i) => i.action)).toEqual(['agent.token_create']);
  });

  test('a session an Admin opened with "sign in as" is refused on both routes', async () => {
    const dev = await user('dev@example.test', 'admin');
    await pool.query('update users set can_impersonate = true where id = $1', [dev]);
    const cookie = await signIn('admin@example.test');
    const session = decodeURIComponent(cookie.match(/better-auth\.session_token=([^;]+)/)![1]!).split('.')[0];
    await pool.query('update sessions set impersonated_by = $1 where token = $2', [dev, session]);
    expect(await errorOf(await checkOf(mine.id, { cookie }))).toBe('not_allowed_while_impersonating');
    expect(await errorOf(await activityOf(mine.id, { cookie }))).toBe('not_allowed_while_impersonating');
  });
});

describe('the check', () => {
  test('a new key is ready but unused; after a Bearer call it reports the time and IP, never the secret', async () => {
    const cookie = { cookie: adminCookie };
    const fresh = await make(adminCookie, 'Script');
    const before = (await (await checkOf(fresh.id, cookie)).json()) as Check;
    expect(before).toEqual({ id: fresh.id, ok: true, status: 'active', reason: null, lastUsedAt: null, lastUsedIp: null, monthSpendUsd: '0.0000' });
    expect((await limits(get('/api/me/limits', { ...bearer(fresh.token), 'cf-connecting-ip': '203.0.113.7' }))).status).toBe(200);
    const res = await checkOf(fresh.id, cookie);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(text).not.toContain(fresh.token.slice(-43));
    const after = JSON.parse(text) as Check;
    expect(after).toMatchObject({ ok: true, status: 'active', lastUsedIp: '203.0.113.7' });
    expect(Date.now() - new Date(after.lastUsedAt!).getTime()).toBeLessThan(60_000);
  });

  test('another Admin may check any connection; an unknown id is 404', async () => {
    expect(((await (await checkOf(theirs.id, { cookie: adminCookie })).json()) as Check).status).toBe('active');
    expect((await checkOf('nosuchtoken0', { cookie: adminCookie })).status).toBe(404);
    expect((await activityOf('nosuchtoken0', { cookie: adminCookie })).status).toBe(404);
  });

  test('it names why a connection is refused: paused owner, kill switch, revoked, expired', async () => {
    const cookie = { cookie: adminCookie };
    const t = await make(adminCookie, 'Paused');
    const other = (await pool.query('select user_id from api_tokens where id = $1', [theirs.id])).rows[0].user_id as string;
    await pool.query(`update users set role = 'member' where id = $1`, [other]);
    try {
      expect((await (await checkOf(theirs.id, cookie)).json()) as Check).toMatchObject({ ok: false, status: 'paused', reason: 'not_admin' });
    } finally {
      await pool.query(`update users set role = 'admin' where id = $1`, [other]);
    }
    process.env.CVS_AGENT_API = '0';
    try {
      expect((await (await checkOf(t.id, cookie)).json()) as Check).toMatchObject({ ok: false, status: 'active', reason: 'agent_api_off' });
    } finally {
      delete process.env.CVS_AGENT_API;
    }
    await pool.query(`update api_tokens set expires_at = now() - interval '1 minute' where id = $1`, [t.id]);
    expect((await (await checkOf(t.id, cookie)).json()) as Check).toMatchObject({ ok: false, status: 'expired', reason: 'expired' });
    await pool.query(`update api_tokens set revoked_at = now(), revoked_by = $2, revoke_reason = 'owner' where id = $1`, [t.id, admin]);
    expect((await (await checkOf(t.id, cookie)).json()) as Check).toMatchObject({ ok: false, status: 'revoked', reason: 'revoked' });
  });
});

describe('the activity log', () => {
  test('rows get short labels and carry only the method and path: no body, digest, nonce, IP or workspace', async () => {
    const t = await make(adminCookie, 'Labels');
    const target = `api_token:${t.id}`;
    const rows: [string, Record<string, unknown>][] = [
      ['agent.request', { method: 'POST', path: '/api/jobs', workspaceId: 'ws_vet', via: 'mcp', nonce: 'NONCE_abcdefghijklmnopq' }],
      ['agent.request', { method: 'PATCH', path: '/api/admin/settings', workspaceId: 'ws_vet', via: 'pat', nonce: null }],
      ['agent.request', { method: 'DELETE', path: '/api/library/items/x1', workspaceId: 'ws_vet', via: 'pat', nonce: null }],
      ['agent.read', { method: 'GET', path: '/api/admin/costs', workspaceId: 'ws_vet', via: 'pat' }],
      ['agent.refused', { method: 'POST', path: '/api/jobs', reason: 'confirm_expired', workspaceId: 'ws_vet', via: 'pat' }],
      ['agent.tool', { tool: 'whoami', args: 'deadbeefcafef00d', outcome: 'ok', workspaceId: 'ws_vet', via: 'mcp' }],
      ['agent.tool', { tool: 'job_create', args: '0123456789abcdef', outcome: 'rate_limited', workspaceId: 'ws_vet', via: 'mcp' }],
      ['agent.token_update', { name: 'Labels 2', ownerId: admin }],
      ['agent.token_revoke', { reason: 'owner', ownerId: admin }],
    ];
    for (const [action, value] of rows) {
      await pool.query('insert into audit_entries (actor_id, action, target, new_value) values ($1, $2, $3, $4)', [admin, action, target, value]);
    }
    await pool.query(`insert into audit_entries (actor_id, action, target, new_value) values ($1, 'verdict.set', $2, '{}')`, [admin, target]); // not an agent row
    const res = await activityOf(t.id, { cookie: adminCookie });
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    for (const secret of ['NONCE_abcdefghijklmnopq', 'deadbeefcafef00d', 'ws_vet', 'Labels 2', admin]) expect(text).not.toContain(secret);
    const page = JSON.parse(text) as Page;
    expect(page.next).toBeNull();
    expect(page.items.map((i) => [i.label, i.method, i.path, i.ok])).toEqual([
      ['Thu hồi khoá', null, null, false],
      ['Đổi tên', null, null, true],
      ['Gọi công cụ job_create (lỗi)', null, null, false],
      ['Gọi công cụ whoami', null, null, true],
      ['Bị chặn: xác nhận đã hết hạn', 'POST', '/api/jobs', false],
      ['Xem trang quản trị', 'GET', '/api/admin/costs', true],
      ['Xoá dữ liệu', 'DELETE', '/api/library/items/x1', true],
      ['Sửa cài đặt', 'PATCH', '/api/admin/settings', true],
      ['Tạo ảnh hoặc video', 'POST', '/api/jobs', true],
      ['Tạo khoá', null, null, true],
    ]);
    expect(Object.keys(page.items[0]!).sort()).toEqual(['action', 'at', 'id', 'label', 'method', 'ok', 'path']);
  });

  test('pages run newest first with a cursor, never repeat or skip a row, and refuse a bad limit or cursor', async () => {
    const t = await make(adminCookie, 'Pages');
    for (let i = 0; i < 4; i++) {
      await pool.query(`insert into audit_entries (actor_id, action, target, new_value) values ($1, 'agent.read', $2, $3)`, [admin, `api_token:${t.id}`, { method: 'GET', path: `/api/admin/p${i}` }]);
    }
    const cookie = { cookie: adminCookie };
    const one = (await (await activityOf(t.id, cookie, '?limit=2')).json()) as Page;
    expect(one.items.map((i) => i.path)).toEqual(['/api/admin/p3', '/api/admin/p2']);
    expect(one.next).toBe(one.items[1]!.id);
    const two = (await (await activityOf(t.id, cookie, `?limit=2&before=${one.next}`)).json()) as Page;
    expect(two.items.map((i) => i.path)).toEqual(['/api/admin/p1', '/api/admin/p0']);
    const three = (await (await activityOf(t.id, cookie, `?limit=2&before=${two.next}`)).json()) as Page;
    expect([three.items.map((i) => i.label), three.next]).toEqual([['Tạo khoá'], null]);
    for (const q of ['?limit=0', '?limit=51', '?limit=x', '?before=abc', '?before=1;drop', '?before=0']) expect((await activityOf(t.id, cookie, q)).status).toBe(400);
  });

  test("an app that signed in shows a revoke as Ngắt kết nối", async () => {
    const t = await make(adminCookie, 'App');
    await pool.query(`update api_tokens set kind = 'oauth' where id = $1`, [t.id]);
    await pool.query(`insert into audit_entries (actor_id, action, target, new_value) values (null, 'agent.token_revoke', $1, '{"reason":"admin"}')`, [`api_token:${t.id}`]);
    const page = (await (await activityOf(t.id, { cookie: adminCookie })).json()) as Page;
    expect(page.items[0]!.label).toBe('Ngắt kết nối');
  });
});
