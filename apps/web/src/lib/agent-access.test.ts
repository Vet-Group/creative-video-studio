// Agent access building blocks: the token format and its stored hash, the per-user connection limit (against a disposable database on the compose
// Postgres), the identity deny matcher, the exact confirm exemptions, canonical JSON and the confirm token.
import { createHash, randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { pool } = await import('@/lib/auth');
const { agentDenied, bodyHash, canonicalJSON, confirmExempt, createPat, hits, ipKey, limited, MAX_ACTIVE_TOKENS, MAX_RATE_KEYS, newPat, readConfirm, signConfirm } = await import('./agent-access');

beforeAll(async () => {
  await pool.query(`insert into users (id, email, name, role) values ('u-admin', 'a@example.test', 'A', 'admin')`);
});

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

describe('personal access tokens', () => {
  test('look like cvs_pat_<12>_<43> and only their sha256 is stored', async () => {
    const { id, token, hash } = newPat();
    expect(token).toMatch(/^cvs_pat_[A-Za-z0-9]{12}_[A-Za-z0-9_-]{43}$/);
    expect(token.slice(8, 20)).toBe(id);
    expect(hash.equals(createHash('sha256').update(token).digest())).toBe(true);

    const made = await createPat({ userId: 'u-admin', workspaceId: 'ws_vet', name: 'Claude Code', days: 30 });
    if (made === 'too_many') throw new Error('refused');
    const row = (await pool.query('select * from api_tokens where id = $1', [made.id])).rows[0];
    expect(row.secret_hash.equals(createHash('sha256').update(made.token).digest())).toBe(true);
    expect(JSON.stringify(row)).not.toContain(made.token.slice(21));
    expect(row).toMatchObject({ kind: 'pat', name: 'Claude Code', workspace_id: 'ws_vet', monthly_cap_usd: '20.0000' });
    expect(new Date(row.expires_at).getTime() - Date.now()).toBeGreaterThan(29.9 * 86_400_000);
    const audited = (await pool.query(`select new_value from audit_entries where action = 'agent.token_create' and target = $1`, [`api_token:${made.id}`])).rows;
    expect(audited).toHaveLength(1);
    expect(JSON.stringify(audited)).not.toMatch(/cvs_pat_|[0-9a-f]{64}/);
  });

  test('the 11th active connection of a user is refused; a revoked one frees a place', async () => {
    await pool.query(`insert into users (id, email, name, role) values ('u-many', 'm@example.test', 'M', 'admin')`);
    const make = () => createPat({ userId: 'u-many', workspaceId: 'ws_vet', name: 'n', days: 7 });
    const made = await Promise.all(Array.from({ length: MAX_ACTIVE_TOKENS + 2 }, make));
    expect(made.filter((m) => m === 'too_many')).toHaveLength(2);
    expect(await make()).toBe('too_many');
    const first = made.find((m) => m !== 'too_many')!;
    await pool.query('update api_tokens set revoked_at = now() where id = $1', [first.id]);
    expect(await make()).not.toBe('too_many');
  });
});

describe('the identity deny set', () => {
  test.each([
    ['GET', '/api/admin/users', true],
    ['POST', '/api/admin/users', true],
    ['POST', '//api/admin/users', true],
    ['POST', '/api/admin/users/', true],
    ['POST', '/api/admin/users%2Fx', true],
    ['PATCH', '/api/admin/users/u1', true],
    ['POST', '/api/admin/users/u1/impersonate', true],
    ['GET', '/api/admin/usersX', false],
    ['POST', '/api/admin/usersX', false],
    ['POST', '/api/auth/sign-in/email', true],
    ['GET', '/api/me/sessions', true],
    ['POST', '/api/me/stop-impersonating', true],
    ['GET', '/api/agent-access/tokens', true],
    ['DELETE', '/api/agent-access/tokens/x', true],
    ['POST', '/api/oauth/token', true],
    ['GET', '/api/me/profile', false],
    ['PATCH', '/api/me/profile', true],
    ['GET', '/api/admin/workspaces', false],
    ['POST', '/api/admin/workspaces', true],
    ['PATCH', '/api/admin/workspaces/ws_b', true],
    ['GET', '/api/workspaces/ws_b/members', false],
    ['POST', '/api/workspaces/ws_b/members', true],
    ['DELETE', '/api/workspaces/ws_b/members/u1', true],
    ['GET', '/api/admin/costs', false],
    ['PUT', '/api/admin/settings', false],
    ['POST', '/api/%E0%A4%A', true],
  ])('%s %s -> denied %s', (method, path, denied) => {
    expect(agentDenied(method, path)).toBe(denied);
  });
});

describe('confirm exemptions match exact method and route', () => {
  test.each([
    ['POST', '/api/assets', true],
    ['POST', '/api/assets/presign-video', true],
    ['POST', '/api/jobs/abc/cancel', true],
    ['POST', '/api/custom-apps/app1/run', true],
    ['POST', '/api/library/zip', true],
    ['DELETE', '/api/assets/a1', false],
    ['POST', '/api/assets/copy', false],
    ['POST', '/api/assets/a1/compress', false],
    ['POST', '/api/assets/a1/reframe', false],
    ['POST', '/api/assets/x/y', false],
    ['POST', '/api/assets/', false],
    ['POST', '//api/assets', false],
    ['PUT', '/api/assets', false],
    ['POST', '/api/jobs/a/b/cancel', false],
    ['POST', '/api/jobs/abc/cancel/x', false],
  ])('%s %s -> exempt %s', (method, path, exempt) => {
    expect(confirmExempt(method, path)).toBe(exempt);
  });
});

describe('confirm tokens', () => {
  const bound = { tokenId: 'agent-one', method: 'PUT', path: '/api/admin/settings', hash: bodyHash(Buffer.from('{"b":1,"a":[2,{"d":3,"c":4}]}')) };

  test('canonical JSON ignores key order and spacing', () => {
    expect(canonicalJSON({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
    expect(bodyHash(Buffer.from('{ "a": [2, {"c": 4, "d": 3}], "b": 1 }'))).toBe(bound.hash);
    expect(bodyHash(new Uint8Array(0))).toBe(createHash('sha256').update('').digest('hex'));
    expect(bodyHash(Buffer.from('not json'))).toBe(createHash('sha256').update('not json').digest('hex'));
  });

  test('bind the token, method, path, body and estimate, and expire after 10 minutes', () => {
    const { confirmToken, expiresAt } = signConfirm(bound, '1.2500');
    expect(confirmToken.split('.')).toHaveLength(5); // the estimate holds a dot
    expect(new Date(expiresAt).getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
    expect(readConfirm(confirmToken, bound)).toEqual({ nonce: confirmToken.split('.')[0], estimate: '1.2500' });
    expect(readConfirm(confirmToken, { ...bound, tokenId: 'agent-two' })).toBe('confirm_invalid');
    expect(readConfirm(confirmToken, { ...bound, method: 'POST' })).toBe('confirm_invalid');
    expect(readConfirm(confirmToken, { ...bound, path: '/api/admin/settings?x=1' })).toBe('confirm_invalid');
    expect(readConfirm(confirmToken, { ...bound, hash: bodyHash(Buffer.from('{}')) })).toBe('confirm_invalid');
    expect(readConfirm(confirmToken.replace('.1.2500.', '.0.2500.'), bound)).toBe('confirm_invalid');
    expect(readConfirm('a.b.c', bound)).toBe('confirm_invalid');
    const dashed = signConfirm(bound, '-').confirmToken;
    expect(readConfirm(dashed, bound)).toMatchObject({ estimate: '-' });
    expect(readConfirm(signConfirm(bound, '-', Date.now() - 11 * 60_000).confirmToken, bound)).toBe('confirm_expired');
  });
});

describe('the in-memory rate limiter', () => {
  afterEach(() => {
    vi.useRealTimers();
    hits.clear();
  });
  const expired = (n: number, at: number) => {
    for (let i = 0; i < n; i++) hits.set(`old:${i}`, [at - 61_000]);
  };

  test('a check that records nothing stores nothing', () => {
    for (let i = 0; i < 1000; i++) expect(limited(`fail:198.51.100.${i}`, 20, false)).toBe(0);
    expect(hits.size).toBe(0);
  });

  test('expired keys are swept at most once every 5 seconds, however many keys there are', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = Date.now();
    limited('k', 5);
    expired(10_001, t0);
    vi.setSystemTime(t0 + 1_000);
    limited('k', 5);
    expect(hits.size).toBe(10_002); // no sweep within 5 s, even past 10k keys
    vi.setSystemTime(t0 + 6_000);
    limited('k', 5);
    expect([...hits.keys()]).toEqual(['k']);
    expired(3, t0 + 6_000);
    vi.setSystemTime(t0 + 11_000);
    limited('k', 5);
    expect([...hits.keys()]).toEqual(['k']); // a small map is swept too
  });

  test('past MAX_RATE_KEYS live keys a new key waits and is not stored; a tracked key still counts', () => {
    const now = Date.now();
    for (let i = 0; i < MAX_RATE_KEYS - 1; i++) hits.set(`live:${i}`, [now]);
    expect(limited('tracked', 5)).toBe(0);
    expect(limited('new', 5)).toBeGreaterThan(0);
    expect(limited('new', 5, false)).toBeGreaterThan(0);
    expect(hits.has('new')).toBe(false);
    expect(limited('tracked', 5)).toBe(0);
    expect(hits.get('tracked')).toHaveLength(2);
  });

  test('an IPv6 client is keyed by its /64, an IPv4 client by its address', () => {
    expect(ipKey('2001:db8:1:2::a')).toBe(ipKey('2001:0db8:0001:0002:ffff:1:2:3'));
    expect(ipKey('2001:db8:1:2::a')).not.toBe(ipKey('2001:db8:1:3::a'));
    expect(ipKey('::1')).toBe('0:0:0:0::/64');
    expect(ipKey('203.0.113.7')).toBe('203.0.113.7');
    expect(ipKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(ipKey('unknown')).toBe('unknown');
  });
});
