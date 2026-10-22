// Integration test against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost:3400';

const { auth, pool } = await import('@/lib/auth');
const { GET, POST } = await import('./route');

const URL_USERS = 'http://localhost:3400/api/admin/users';
const PASSWORD = 'correct-horse-battery';

async function signIn(email: string): Promise<string> {
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  expect(res.status).toBe(200);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

const req = (cookie?: string, init: RequestInit = {}) =>
  new Request(URL_USERS, { ...init, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' } });

let adminCookie = '';
let memberCookie = '';

beforeAll(async () => {
  await auth.api.createUser({ body: { email: 'admin@example.test', name: 'Admin', password: PASSWORD, role: 'admin' } });
  await auth.api.createUser({ body: { email: 'member@example.test', name: 'Member', password: PASSWORD, role: 'member' } });
  adminCookie = await signIn('admin@example.test');
  memberCookie = await signIn('member@example.test');
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

describe('/api/admin/users', () => {
  test('rejects a request without a session', async () => {
    expect((await GET(req())).status).toBe(401);
  });

  test('blocks a Member from listing users', async () => {
    const res = await GET(req(memberCookie));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  test('blocks a Member from creating users', async () => {
    const body = JSON.stringify({ email: 'sneaky@example.test', name: 'Sneaky', password: PASSWORD, role: 'admin' });
    expect((await POST(req(memberCookie, { method: 'POST', body }))).status).toBe(403);
    const { users } = (await (await GET(req(adminCookie))).json()) as { users: { email: string }[] };
    expect(users.map((u) => u.email)).not.toContain('sneaky@example.test');
  });

  test('lets an Admin list users with their roles', async () => {
    const res = await GET(req(adminCookie));
    expect(res.status).toBe(200);
    const { users } = (await res.json()) as { users: { email: string; role: string }[] };
    expect(users.map((u) => [u.email, u.role]).sort()).toEqual([
      ['admin@example.test', 'admin'],
      ['member@example.test', 'member'],
    ]);
  });

  test('lets an Admin create a Member, who can then sign in', async () => {
    const body = JSON.stringify({ email: 'new@example.test', name: 'New', password: PASSWORD });
    const res = await POST(req(adminCookie, { method: 'POST', body }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ email: 'new@example.test', role: 'member' });
    expect(await signIn('new@example.test')).toContain('better-auth.session_token');
  });

  test('lets an Admin create a user without a password, who then cannot sign in by email', async () => {
    const body = JSON.stringify({ email: 'lark-only@example.test', name: 'Lark Only' });
    const res = await POST(req(adminCookie, { method: 'POST', body }));
    expect(res.status).toBe(201);
    const signIn = await auth.api.signInEmail({ body: { email: 'lark-only@example.test', password: PASSWORD }, asResponse: true });
    expect(signIn.status).toBe(401);
  });

  test('rejects a password that is not a string', async () => {
    const body = JSON.stringify({ email: 'y@example.test', name: 'Y', password: 12345678 });
    expect((await POST(req(adminCookie, { method: 'POST', body }))).status).toBe(400);
  });

  test('rejects a bad role', async () => {
    const body = JSON.stringify({ email: 'x@example.test', name: 'X', password: PASSWORD, role: 'owner' });
    expect((await POST(req(adminCookie, { method: 'POST', body }))).status).toBe(400);
  });
});

test('public sign-up is disabled', async () => {
  await expect(auth.api.signUpEmail({ body: { email: 'self@example.test', name: 'Self', password: PASSWORD } })).rejects.toThrow();
});
