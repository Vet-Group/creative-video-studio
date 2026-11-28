// Settings > "Kết nối AI" (app/api/agent-access/tokens): who may list, create, change and revoke agent access tokens, the secret shown once, and the
// cookie-only rule, against the real better-auth sign-in and a disposable database on the compose Postgres (`pnpm services:up`).
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
const tokens = await import('./route');
const one = await import('./[id]/route');
const { GET: limits } = await import('../../me/limits/route');

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
type Init = { method?: string; body?: unknown; headers?: Record<string, string> };
const req = (path: string, cookie: string, init: Init = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: init.method ?? 'GET',
    headers: { cookie, ...(init.method && init.method !== 'GET' && { origin: ORIGIN }), ...(init.body !== undefined && { 'content-type': 'application/json' }), ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const list = (cookie: string, all = false) => tokens.GET(req(`/api/agent-access/tokens${all ? '?all=1' : ''}`, cookie));
const create = (cookie: string, body: unknown = { name: 'Claude Code' }, headers?: Record<string, string>) =>
  tokens.POST(req('/api/agent-access/tokens', cookie, { method: 'POST', body, headers }));
const revoke = (cookie: string, id: string) => one.DELETE(req(`/api/agent-access/tokens/${id}`, cookie, { method: 'DELETE' }), ctx(id));
const patch = (cookie: string, id: string, body: unknown) => one.PATCH(req(`/api/agent-access/tokens/${id}`, cookie, { method: 'PATCH', body }), ctx(id));
const errorOf = async (res: Response) => ((await res.clone().json()) as { error: string }).error;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const audits = async (action: string) => (await pool.query('select actor_id, target, new_value from audit_entries where action = $1 order by id', [action])).rows;
type Row = { id: string; name: string; owner: { id: string }; mine: boolean; status: string; paused: boolean; capUsd: string; monthSpendUsd: string; expiresAt: string };

let admin: string, other: string;
let adminCookie = '', otherCookie = '', memberCookie = '';

beforeAll(async () => {
  admin = await user('admin@example.test', 'admin');
  other = await user('other@example.test', 'admin');
  await user('member@example.test', 'member');
  [adminCookie, otherCookie, memberCookie] = await Promise.all([signIn('admin@example.test'), signIn('other@example.test'), signIn('member@example.test')]);
});

describe('who may use the routes', () => {
  test('a member, a visitor and a cross-origin write are refused', async () => {
    expect((await list(memberCookie)).status).toBe(403);
    expect((await create(memberCookie)).status).toBe(403);
    expect((await list('')).status).toBe(401);
    expect(await errorOf(await create(adminCookie, { name: 'x' }, { origin: 'https://evil.example' }))).toBe('forbidden origin');
    expect((await pool.query('select count(*)::int as n from api_tokens')).rows[0].n).toBe(0);
  });

  test('a session an Admin opened with "sign in as" is refused on every method', async () => {
    const dev = await user('dev@example.test', 'admin');
    await pool.query('update users set can_impersonate = true where id = $1', [dev]);
    const cookie = await signIn('other@example.test');
    const token = decodeURIComponent(cookie.match(/better-auth\.session_token=([^;]+)/)![1]!).split('.')[0];
    await pool.query('update sessions set impersonated_by = $1 where token = $2', [dev, token]);
    expect(await errorOf(await list(cookie))).toBe('not_allowed_while_impersonating');
    expect(await errorOf(await create(cookie))).toBe('not_allowed_while_impersonating');
  });

  test('a sign-in older than 10 minutes must sign in again before it creates a token', async () => {
    const cookie = await signIn('admin@example.test');
    const token = decodeURIComponent(cookie.match(/better-auth\.session_token=([^;]+)/)![1]!).split('.')[0];
    await pool.query(`update sessions set created_at = now() - interval '11 minutes' where token = $1`, [token]);
    const res = await create(cookie);
    expect([res.status, await errorOf(res)]).toEqual([403, 'reauth_required']);
    expect((await list(cookie)).status).toBe(200); // reading the list needs no fresh sign-in
  });
});

describe('creating, listing, changing and revoking', () => {
  test('the secret is answered once and never listed; the token works as Bearer but not on these routes', async () => {
    const res = await create(adminCookie, { name: '  Claude Code  ', days: 7, capUsd: 5 });
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const made = (await res.json()) as { id: string; token: string; expiresAt: string };
    expect(made.token).toMatch(/^cvs_pat_[A-Za-z0-9]{12}_[A-Za-z0-9_-]{43}$/);
    expect(new Date(made.expiresAt).getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);

    const text = await (await list(adminCookie)).text();
    expect(text).not.toContain(made.token);
    expect(text).not.toContain(made.token.split('_').at(-1));
    const row = (JSON.parse(text) as { enabled: boolean; tokens: Row[] }).tokens.find((t) => t.id === made.id)!;
    expect(row).toMatchObject({ name: 'Claude Code', mine: true, status: 'active', paused: false, capUsd: '5.0000', monthSpendUsd: '0.0000' });

    expect((await limits(new Request(`${ORIGIN}/api/me/limits`, { headers: bearer(made.token) }))).status).toBe(200);
    const asAgent = await tokens.GET(new Request(`${ORIGIN}/api/agent-access/tokens`, { headers: bearer(made.token) }));
    expect([asAgent.status, await errorOf(asAgent)]).toEqual([403, 'not_allowed_for_agent']);
    const createAsAgent = await tokens.POST(new Request(`${ORIGIN}/api/agent-access/tokens`, { method: 'POST', headers: { ...bearer(made.token), 'content-type': 'application/json' }, body: '{"name":"x"}' }));
    expect([createAsAgent.status, await errorOf(createAsAgent)]).toEqual([403, 'not_allowed_for_agent']);

    const created = await audits('agent.token_create');
    expect(created.at(-1)).toMatchObject({ actor_id: admin, target: `api_token:${made.id}` });
    expect(JSON.stringify(created)).not.toContain(made.token);
  });

  test('bad input is refused', async () => {
    expect(await errorOf(await create(adminCookie, { name: '' }))).toBe('name must have 1 to 60 characters');
    expect(await errorOf(await create(adminCookie, { name: 'x'.repeat(61) }))).toBe('name must have 1 to 60 characters');
    expect(await errorOf(await create(adminCookie, { name: 'x', days: 14 }))).toBe('days must be 7, 30 or 90');
    expect(await errorOf(await create(adminCookie, { name: 'x', capUsd: 1000.01 }))).toBe('capUsd must be 0 to 1000');
    expect(await errorOf(await create(adminCookie, { name: 'x', capUsd: -1 }))).toBe('capUsd must be 0 to 1000');
  });

  test('a cap that is not a plain number from 0 to 1000 is refused on create and change', async () => {
    const made = (await (await create(adminCookie, { name: 'nan' })).json()) as { id: string };
    for (const capUsd of ['NaN', 'Infinity', '-0.5', '1e3', ' ', null, true]) {
      expect(await errorOf(await create(adminCookie, { name: 'x', capUsd }))).toBe('capUsd must be 0 to 1000');
      expect(await errorOf(await patch(adminCookie, made.id, { capUsd }))).toBe('capUsd must be 0 to 1000');
    }
    expect((await pool.query('select monthly_cap_usd::text as cap from api_tokens where id = $1', [made.id])).rows[0].cap).toBe('20.0000');
  });

  test('the defaults are 30 days and 20 USD, and an 11th active token is refused', async () => {
    const res = await create(otherCookie, { name: 'first' });
    const made = (await res.json()) as { id: string; expiresAt: string };
    expect(Math.round((new Date(made.expiresAt).getTime() - Date.now()) / 86_400_000)).toBe(30);
    expect((await pool.query('select monthly_cap_usd::text as cap from api_tokens where id = $1', [made.id])).rows[0].cap).toBe('20.0000');
    for (let i = 2; i <= 10; i++) expect((await create(otherCookie, { name: `t${i}` })).status).toBe(201);
    const eleventh = await create(otherCookie, { name: 't11' });
    expect([eleventh.status, await errorOf(eleventh)]).toEqual([409, 'too_many_tokens']);
  });

  test("an Admin lists everyone's tokens with ?all=1 and revokes another Admin's; the token then gets 401", async () => {
    const made = (await (await create(adminCookie, { name: 'to revoke' })).json()) as { id: string; token: string };
    const mine = (await (await list(otherCookie)).json()) as { tokens: Row[] };
    expect(mine.tokens.some((t) => t.id === made.id)).toBe(false);
    const everyone = (await (await list(otherCookie, true)).json()) as { tokens: Row[] };
    expect(everyone.tokens.find((t) => t.id === made.id)).toMatchObject({ mine: false, owner: { id: admin } });

    expect((await revoke(otherCookie, made.id)).status).toBe(200);
    expect((await limits(new Request(`${ORIGIN}/api/me/limits`, { headers: bearer(made.token) }))).status).toBe(401);
    expect((await revoke(otherCookie, made.id)).status).toBe(200); // again: nothing changes, no second audit row
    expect((await audits('agent.token_revoke')).filter((a) => a.target === `api_token:${made.id}`)).toEqual([
      { actor_id: other, target: `api_token:${made.id}`, new_value: { reason: 'admin', ownerId: admin } },
    ]);
    const after = (await (await list(adminCookie)).json()) as { tokens: Row[] };
    expect(after.tokens.at(-1)).toMatchObject({ id: made.id, status: 'revoked' });
    expect((await revoke(otherCookie, 'nope')).status).toBe(404);
    expect((await patch(otherCookie, made.id, { capUsd: 3 })).status).toBe(409);
  });

  test('renaming and a new cap are saved and audited; bad values are refused', async () => {
    const made = (await (await create(adminCookie, { name: 'cap me' })).json()) as { id: string };
    expect(await errorOf(await patch(adminCookie, made.id, {}))).toBe('give name or capUsd');
    expect(await errorOf(await patch(adminCookie, made.id, { capUsd: 2000 }))).toBe('capUsd must be 0 to 1000');
    expect(await errorOf(await patch(adminCookie, made.id, { name: ' ' }))).toBe('name must have 1 to 60 characters');
    const res = await patch(adminCookie, made.id, { name: 'Renamed', capUsd: '7.5' });
    expect(await res.json()).toEqual({ id: made.id, name: 'Renamed', capUsd: '7.5000' });
    expect((await audits('agent.token_update')).at(-1)).toMatchObject({
      actor_id: admin,
      target: `api_token:${made.id}`,
      new_value: { name: 'Renamed', capUsd: '7.5000' },
    });
    expect((await patch(adminCookie, 'nope', { capUsd: 1 })).status).toBe(404);
  });

  test("another Admin's change to a connection is audited with the connection's owner", async () => {
    const made = (await (await create(adminCookie, { name: 'owned' })).json()) as { id: string };
    expect((await patch(otherCookie, made.id, { capUsd: '4' })).status).toBe(200);
    expect((await audits('agent.token_update')).at(-1)).toEqual({
      actor_id: other,
      target: `api_token:${made.id}`,
      new_value: { name: 'owned', capUsd: '4.0000', ownerId: admin },
    });
  });

  test("a demoted owner's tokens show as paused in the list", async () => {
    const owner = await user('demoted@example.test', 'admin');
    const cookie = await signIn('demoted@example.test');
    const made = (await (await create(cookie, { name: 'paused' })).json()) as { id: string };
    await pool.query(`update users set role = 'member' where id = $1`, [owner]);
    const everyone = (await (await list(adminCookie, true)).json()) as { tokens: Row[] };
    expect(everyone.tokens.find((t) => t.id === made.id)).toMatchObject({ status: 'paused', paused: true });
  });
});
