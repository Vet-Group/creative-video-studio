// Agent access building blocks: the token format and its stored hash, the per-user connection limit (against a disposable database on the compose
// Postgres), the identity deny matcher, the exact confirm exemptions, canonical JSON and the confirm token.
import { createHash, randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { pool } = await import('@/lib/auth');
const { agentDenied, bodyHash, canonicalJSON, confirmExempt, createPat, MAX_ACTIVE_TOKENS, newPat, readConfirm, signConfirm } = await import('./agent-access');

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
