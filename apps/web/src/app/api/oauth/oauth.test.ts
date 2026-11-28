// The OAuth server end to end at the route level (lib/oauth.ts, app/api/oauth, app/.well-known): registration rules and limits, the Admin's consent,
// the code exchange (PKCE, redirect, client, single use), refresh rotation with its 30 s grace and reuse detection, the owner re-checked on each refresh,
// and the access token at guard() and /api/mcp, against the real better-auth sign-in and a disposable database on the compose Postgres.
import { createHash, randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 60_000 });

const ORIGIN = 'http://localhost';
const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = ORIGIN;

// Everything logged is kept, to check that no code, token or verifier reaches a log line.
const logged: string[] = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  const original = console[level].bind(console);
  vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
    logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    original(...args);
  });
}

const { auth, pool } = await import('@/lib/auth');
const { hits } = await import('@/lib/agent-access');
const { approve, checkAuthorize, REFRESH_GRACE_MS, registrations } = await import('@/lib/oauth');
const register = await import('./register/route');
const authorize = await import('./authorize/route');
const tokenRoute = await import('./token/route');
const revokeRoute = await import('./revoke/route');
const asMeta = await import('../../.well-known/oauth-authorization-server/route');
const prMeta = await import('../../.well-known/oauth-protected-resource/route');
const prMcpMeta = await import('../../.well-known/oauth-protected-resource/api/mcp/route');
const mcp = await import('../mcp/route');
const limits = await import('../me/limits/route');
const tokens = await import('../agent-access/tokens/[id]/route');

const PASSWORD = 'correct-horse-battery';
const REDIRECT = 'http://127.0.0.1:43123/mcp-oauth/callback';
let adminId = '';
let adminCookie = '';
let memberCookie = '';

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

const json = async <T = Record<string, any>>(res: Response) => (await res.clone().json()) as T;
const registerClient = (body: unknown, ip = '203.0.113.1') =>
  register.POST(new Request(`${ORIGIN}/api/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) }));
const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};
const consent = (cookie: string, fields: Record<string, string>) =>
  authorize.POST(new Request(`${ORIGIN}/api/oauth/authorize`, { method: 'POST', headers: { cookie, origin: ORIGIN }, body: new URLSearchParams(fields) }));
const token = (fields: Record<string, string>) =>
  tokenRoute.POST(
    new Request(`${ORIGIN}/api/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': '203.0.113.9' }, body: new URLSearchParams(fields) }),
  );
const bearer = (access: string) => limits.GET(new Request(`${ORIGIN}/api/me/limits`, { headers: { authorization: `Bearer ${access}` } }));
const whoami = async (access: string) => {
  const res = await mcp.POST(
    new Request(`${ORIGIN}/api/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'whoami', arguments: {} } }),
    }),
  );
  const text = await res.text();
  return { status: res.status, body: res.status === 200 ? JSON.parse(text.split('\n').filter((l) => l.startsWith('data: ')).at(-1)!.slice(6)) : null };
};
const revoked = async (id: string) => (await pool.query('select revoked_at is not null as r, revoke_reason from api_tokens where id = $1', [id])).rows[0];

type Pair = { access_token: string; refresh_token: string; token_type: string; expires_in: number };
/** Registers a client, has the Admin allow it, and returns the code with what the client must send with it. */
async function approved(o: { cookie?: string; redirect?: string } = {}) {
  const client = await json<{ client_id: string }>(await registerClient({ client_name: 'OpenMausBot', redirect_uris: [o.redirect ?? REDIRECT] }, `203.0.113.${100 + (++seq % 100)}`));
  const { verifier, challenge } = pkce();
  const state = `st-${seq}`;
  const res = await consent(o.cookie ?? adminCookie, {
    client_id: client.client_id,
    redirect_uri: o.redirect ?? REDIRECT,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    response_type: 'code',
    decision: 'allow',
  });
  expect(res.status).toBe(303);
  const back = new URL(res.headers.get('location')!);
  const code = back.searchParams.get('code')!;
  const connection = (await pool.query(`select api_token_id from oauth_codes where code_hash = $1`, [createHash('sha256').update(code).digest()])).rows[0]?.api_token_id as string;
  return { clientId: client.client_id, verifier, state, back, code, connection };
}
const exchange = (a: { clientId: string; verifier: string; code: string }, over: Record<string, string> = {}) =>
  token({ grant_type: 'authorization_code', code: a.code, client_id: a.clientId, redirect_uri: REDIRECT, code_verifier: a.verifier, ...over });
/** An approved, exchanged connection. */
async function connected() {
  const a = await approved();
  const res = await exchange(a);
  expect(res.status).toBe(200);
  return { ...a, pair: await json<Pair>(res) };
}
const refreshWith = (refresh_token: string, client_id: string) => token({ grant_type: 'refresh_token', refresh_token, client_id });

let seq = 0;
beforeAll(async () => {
  adminId = await user('oauth-admin@example.test', 'admin');
  await user('oauth-member@example.test', 'member');
  adminCookie = await signIn('oauth-admin@example.test');
  memberCookie = await signIn('oauth-member@example.test');
});
beforeEach(() => {
  hits.clear();
  registrations.clear();
});
afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

test('the metadata routes name APP_URL as issuer and resource', async () => {
  expect(await json(asMeta.GET())).toMatchObject({ issuer: ORIGIN, token_endpoint: `${ORIGIN}/api/oauth/token`, code_challenge_methods_supported: ['S256'] });
  for (const route of [prMeta, prMcpMeta]) expect(await json(route.GET())).toEqual(expect.objectContaining({ resource: `${ORIGIN}/api/mcp`, authorization_servers: [ORIGIN] }));
});

describe('registration', () => {
  test('refuses https, a non-loopback http host, more than 3 URIs and a fragment; a loopback client is registered as public', async () => {
    for (const redirect_uris of [
      ['https://127.0.0.1:5000/callback'],
      ['https://example.com/callback'],
      ['http://example.com/callback'],
      ['http://127.0.0.1/a', 'http://127.0.0.1/b', 'http://127.0.0.1/c', 'http://127.0.0.1/d'],
      ['http://127.0.0.1/callback#x'],
      ['http://127.0.0.1/callback?next=x'],
      ['http://localhost:4000/callback?'],
      [],
    ]) {
      const res = await registerClient({ client_name: 'x', redirect_uris });
      expect([res.status, (await json(res)).error]).toEqual([400, 'invalid_redirect_uri']);
    }
    const ok = await registerClient({ client_name: 'Claude Code (cvs)\u0007', redirect_uris: ['http://localhost:33418/callback'], token_endpoint_auth_method: 'client_secret_post' });
    expect(ok.status).toBe(201);
    expect(await json(ok)).toMatchObject({ client_id: expect.stringMatching(/^cvsc_/), client_name: 'Claude Code (cvs)', token_endpoint_auth_method: 'none' });
  });

  test('the 11th registration in an hour from one address is 429; another address still registers', async () => {
    for (let i = 0; i < 10; i++) expect((await registerClient({ redirect_uris: [REDIRECT] }, '198.51.100.1')).status).toBe(201);
    const eleventh = await registerClient({ redirect_uris: [REDIRECT] }, '198.51.100.1');
    expect(eleventh.status).toBe(429);
    expect(Number(eleventh.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await registerClient({ redirect_uris: [REDIRECT] }, '198.51.100.2')).status).toBe(201);
  });

  test('a body that is not sent as JSON is invalid_client_metadata and does not use up the hourly registrations', async () => {
    const send = (contentType: string | null) =>
      register.POST(
        new Request(`${ORIGIN}/api/oauth/register`, {
          method: 'POST',
          headers: { 'cf-connecting-ip': '198.51.100.3', ...(contentType ? { 'content-type': contentType } : {}) },
          body: JSON.stringify({ redirect_uris: [REDIRECT] }),
        }),
      );
    for (let i = 0; i < 10; i++) {
      for (const type of ['text/plain', 'application/x-www-form-urlencoded', null]) {
        const res = await send(type);
        expect([res.status, (await json(res)).error]).toEqual([400, 'invalid_client_metadata']);
      }
    }
    expect((await send('application/json; charset=utf-8')).status).toBe(201);
  });
});

describe('consent', () => {
  test('a member, a stale sign-in, an unknown redirect and "Từ chối" never get a code; "Cho phép" makes a connection that never expires', async () => {
    const client = await json<{ client_id: string }>(await registerClient({ client_name: 'Claude Code', redirect_uris: [REDIRECT] }));
    const { challenge } = pkce();
    const fields = { client_id: client.client_id, redirect_uri: REDIRECT, state: 'abc', code_challenge: challenge, code_challenge_method: 'S256', response_type: 'code' };

    expect((await consent(memberCookie, { ...fields, decision: 'allow' })).status).toBe(403);
    expect((await consent(adminCookie, { ...fields, redirect_uri: 'http://127.0.0.1:43123/elsewhere', decision: 'allow' })).status).toBe(400);
    const denied = await consent(adminCookie, { ...fields, decision: 'deny' });
    expect(denied.status).toBe(303);
    expect(Object.fromEntries(new URL(denied.headers.get('location')!).searchParams)).toEqual({ error: 'access_denied', state: 'abc', iss: ORIGIN });
    // A client that drops PKCE gets the error back at its own redirect, never a code.
    const noPkce = await consent(adminCookie, { ...fields, code_challenge_method: 'plain', decision: 'allow' });
    expect(new URL(noPkce.headers.get('location')!).searchParams.get('error')).toBe('invalid_request');

    const stale = await signIn('oauth-admin@example.test');
    await pool.query(`update sessions set created_at = now() - interval '11 minutes' where token = $1`, [decodeURIComponent(stale.match(/better-auth\.session_token=([^;]+)/)![1]!).split('.')[0]]);
    const again = await consent(stale, { ...fields, decision: 'allow' });
    expect([again.status, new URL(again.headers.get('location')!).pathname]).toEqual([303, '/oauth/authorize']);

    const ok = await consent(adminCookie, { ...fields, decision: 'allow' });
    const back = new URL(ok.headers.get('location')!);
    expect(back.origin + back.pathname).toBe(REDIRECT);
    expect(back.searchParams.get('code')).toMatch(/^cvs_oac_/);
    expect([back.searchParams.get('state'), back.searchParams.get('iss')]).toEqual(['abc', ORIGIN]);
    const row = (await pool.query(`select kind, expires_at, name, oauth_client_id, user_id from api_tokens where oauth_client_id = $1`, [client.client_id])).rows;
    expect(row).toEqual([{ kind: 'oauth', expires_at: null, name: 'Claude Code', oauth_client_id: client.client_id, user_id: adminId }]);
    const consented = (await pool.query(`select new_value from audit_entries where action = 'agent.oauth_consent' and new_value->>'clientId' = $1`, [client.client_id])).rows[0].new_value;
    expect(consented).toMatchObject({ clientName: 'Claude Code', redirectHost: '127.0.0.1:43123' });
    expect(consented).not.toHaveProperty('capUsd');
  });

  test('approving a client pruned or evicted after the form was checked is "gone", with no connection and no server error', async () => {
    const client = await json<{ client_id: string }>(await registerClient({ client_name: 'Pruned', redirect_uris: [REDIRECT] }));
    const check = await checkAuthorize({ client_id: client.client_id, redirect_uri: REDIRECT, state: 's', code_challenge: pkce().challenge, code_challenge_method: 'S256', response_type: 'code' });
    if (check.kind !== 'ok') throw new Error(check.kind);
    await pool.query('delete from oauth_clients where id = $1', [client.client_id]);
    expect(await approve({ userId: adminId, workspaceId: 'ws_vet', client: check.client, request: check.request })).toBe('gone');
    expect((await pool.query('select count(*)::int as n from api_tokens where oauth_client_id = $1', [client.client_id])).rows[0].n).toBe(0);
  });

  test('an authorize request whose redirect carries a query gets the error page, never a redirect', async () => {
    const client = await json<{ client_id: string }>(await registerClient({ client_name: 'Q', redirect_uris: [REDIRECT] }));
    const { challenge } = pkce();
    const res = await consent(adminCookie, {
      client_id: client.client_id,
      redirect_uri: `${REDIRECT}?next=https://evil.example`,
      state: 's',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      response_type: 'code',
      decision: 'allow',
    });
    expect([res.status, (await json(res)).error]).toEqual([400, 'invalid_redirect_uri']);
  });

  test('an access token cannot reach the consent or token management routes', async () => {
    const { pair } = await connected();
    const res = await authorize.POST(
      new Request(`${ORIGIN}/api/oauth/authorize`, { method: 'POST', headers: { authorization: `Bearer ${pair.access_token}` }, body: new URLSearchParams({ decision: 'allow' }) }),
    );
    expect([res.status, (await json(res)).error]).toEqual([403, 'not_allowed_for_agent']);
  });
});

describe('code exchange', () => {
  test('a wrong verifier, redirect or client is invalid_grant and spends the code; using it again revokes the connection', async () => {
    const overs: Record<string, string>[] = [{ code_verifier: pkce().verifier }, { redirect_uri: 'http://127.0.0.1:43123/other' }, { client_id: 'cvsc_000000000000000000000000' }];
    for (const over of overs) {
      const a = await approved();
      const wrong = await exchange(a, over);
      expect([wrong.status, (await json(wrong)).error]).toEqual([400, 'invalid_grant']);
      const retry = await exchange(a);
      expect([retry.status, (await json(retry)).error]).toEqual([400, 'invalid_grant']);
      expect(await revoked(a.connection)).toEqual({ r: true, revoke_reason: 'code_reuse' });
    }
  });

  test('a Basic client id with a broken percent escape is invalid_client (401), not a server error', async () => {
    const res = await tokenRoute.POST(
      new Request(`${ORIGIN}/api/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from('cvsc_%E0%A4%A:').toString('base64')}` },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'x' }),
      }),
    );
    expect([res.status, (await json(res)).error]).toEqual([401, 'invalid_client']);
  });

  test('a code used a second time revokes the connection and its tokens stop working', async () => {
    const a = await connected();
    expect((await bearer(a.pair.access_token)).status).toBe(200);
    const reused = await exchange(a);
    expect([reused.status, (await json(reused)).error]).toEqual([400, 'invalid_grant']);
    expect((await bearer(a.pair.access_token)).status).toBe(401);
    expect((await refreshWith(a.pair.refresh_token, a.clientId)).status).toBe(400);
  });

  test('the access token acts as the Admin at guard() and at /api/mcp whoami', async () => {
    const a = await connected();
    expect(a.pair).toMatchObject({ token_type: 'Bearer', expires_in: 3600, access_token: expect.stringMatching(/^cvs_oat_/), refresh_token: expect.stringMatching(/^cvs_ort_/) });
    expect((await bearer(a.pair.access_token)).status).toBe(200);
    const who = await whoami(a.pair.access_token);
    expect(who.status).toBe(200);
    expect(who.body.result.structuredContent).toMatchObject({ user: { email: 'oauth-admin@example.test' }, connection: { id: a.connection, kind: 'oauth' } });
  });
});

describe('refresh', () => {
  test("another client's id is invalid_grant and does not spend the token", async () => {
    const a = await connected();
    const other = await json<{ client_id: string }>(await registerClient({ redirect_uris: [REDIRECT] }, '198.51.100.30'));
    const wrong = await refreshWith(a.pair.refresh_token, other.client_id);
    expect([wrong.status, (await json(wrong)).error]).toEqual([400, 'invalid_grant']);
    expect((await refreshWith(a.pair.refresh_token, a.clientId)).status).toBe(200);
    expect(await revoked(a.connection)).toEqual({ r: false, revoke_reason: null });
  });

  test('rotation: the old token again within 30 s gets the same pair; after the grace it revokes the connection', async () => {
    const a = await connected();
    const first = await refreshWith(a.pair.refresh_token, a.clientId);
    const pair = await json<Pair>(first);
    expect(pair.refresh_token).not.toBe(a.pair.refresh_token);
    expect(await json<Pair>(await refreshWith(a.pair.refresh_token, a.clientId))).toEqual(pair);
    expect((await bearer(pair.access_token)).status).toBe(200);

    await pool.query(`update oauth_refresh_tokens set used_at = used_at - $2 * interval '1 millisecond' where api_token_id = $1 and used_at is not null`, [a.connection, REFRESH_GRACE_MS + 1000]);
    const late = await refreshWith(a.pair.refresh_token, a.clientId);
    expect([late.status, (await json(late)).error]).toEqual([400, 'invalid_grant']);
    expect(await revoked(a.connection)).toEqual({ r: true, revoke_reason: 'refresh_reuse' });
    expect((await pool.query(`select count(*)::int as n from audit_entries where action = 'agent.oauth_refresh_reuse' and target = $1`, [`api_token:${a.connection}`])).rows[0].n).toBe(1);
    expect((await bearer(pair.access_token)).status).toBe(401);
    expect((await refreshWith(pair.refresh_token, a.clientId)).status).toBe(400);
  });

  test('a demoted owner gets invalid_grant without spending the token, and the same token works after re-promotion', async () => {
    const a = await connected();
    await pool.query(`update users set role = 'member' where id = $1`, [adminId]);
    try {
      const paused = await refreshWith(a.pair.refresh_token, a.clientId);
      expect([paused.status, (await json(paused)).error]).toEqual([400, 'invalid_grant']);
      expect((await bearer(a.pair.access_token)).status).toBe(401);
    } finally {
      await pool.query(`update users set role = 'admin' where id = $1`, [adminId]);
    }
    const back = await refreshWith(a.pair.refresh_token, a.clientId);
    expect(back.status).toBe(200);
    expect((await bearer((await json<Pair>(back)).access_token)).status).toBe(200);
  });

  test('the connection keeps expires_at null and keeps working across rotations', async () => {
    const a = await connected();
    let pair = a.pair;
    for (let i = 0; i < 3; i++) {
      pair = await json<Pair>(await refreshWith(pair.refresh_token, a.clientId));
      expect((await bearer(pair.access_token)).status).toBe(200);
    }
    expect((await pool.query('select expires_at, revoked_at from api_tokens where id = $1', [a.connection])).rows[0]).toEqual({ expires_at: null, revoked_at: null });
  });

  test('the code exchange and a refresh take one pool client each, so at the pool maximum they cannot wait on themselves', async () => {
    const a = await approved();
    const connect = vi.spyOn(pool, 'connect');
    try {
      const res = await exchange(a);
      expect(res.status).toBe(200);
      expect(connect).toHaveBeenCalledTimes(1);
      connect.mockClear();
      expect((await refreshWith((await json<Pair>(res)).refresh_token, a.clientId)).status).toBe(200);
      expect(connect).toHaveBeenCalledTimes(1);
    } finally {
      connect.mockRestore();
    }
  });
});

describe('ending a connection', () => {
  test('RFC 7009 revoke with the refresh token ends the connection; another client cannot', async () => {
    const a = await connected();
    const send = (client_id: string) =>
      revokeRoute.POST(new Request(`${ORIGIN}/api/oauth/revoke`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: a.pair.refresh_token, client_id }) }));
    expect((await send('cvsc_000000000000000000000000')).status).toBe(200);
    expect((await bearer(a.pair.access_token)).status).toBe(200);
    expect((await send(a.clientId)).status).toBe(200);
    expect((await bearer(a.pair.access_token)).status).toBe(401);
  });

  test('"Ngắt kết nối" in Settings ends it: the access token is 401 and the refresh token invalid_grant', async () => {
    const a = await connected();
    const res = await tokens.DELETE(new Request(`${ORIGIN}/api/agent-access/tokens/${a.connection}`, { method: 'DELETE', headers: { cookie: adminCookie, origin: ORIGIN } }), {
      params: Promise.resolve({ id: a.connection }),
    });
    expect(res.status).toBe(200);
    expect((await bearer(a.pair.access_token)).status).toBe(401);
    expect((await whoami(a.pair.access_token)).status).toBe(401);
    expect((await refreshWith(a.pair.refresh_token, a.clientId)).status).toBe(400);
  });

  test('with CVS_AGENT_API=0 every OAuth endpoint answers 503', async () => {
    process.env.CVS_AGENT_API = '0';
    try {
      expect((await registerClient({ redirect_uris: [REDIRECT] })).status).toBe(503);
      expect((await token({ grant_type: 'refresh_token' })).status).toBe(503);
    } finally {
      delete process.env.CVS_AGENT_API;
    }
  });
});

test('no code, token or verifier reaches a log line', () => {
  expect(logged.join('\n')).not.toMatch(/cvs_(oac|oat|ort|pat)_/);
});
