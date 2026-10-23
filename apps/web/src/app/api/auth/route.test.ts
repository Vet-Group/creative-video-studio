// Integration test of the auth catch-all against a disposable database on the compose Postgres (`pnpm services:up`):
// the admin plugin's HTTP endpoints are closed, every other auth path works.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const route = await import('./[...all]/route');

const PASSWORD = 'correct-horse-battery';

async function newUser(email: string, role: 'member' | 'admin') {
  const id = (await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}

const call = (cookie: string | undefined, path: string, method: 'GET' | 'POST', body?: unknown) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), origin: 'http://localhost', 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });

let admin: Awaited<ReturnType<typeof newUser>>;
let victim: Awaited<ReturnType<typeof newUser>>;

beforeAll(async () => {
  admin = await newUser('admin@example.test', 'admin');
  victim = await newUser('victim@example.test', 'member');
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

describe('/api/auth/admin/*', () => {
  const state = async () => (await pool.query('select role, banned from users where id = $1', [victim.id])).rows;

  test.each([
    ['remove-user', (userId: string) => ({ userId })],
    ['set-role', (userId: string) => ({ userId, role: 'admin' })],
    ['ban-user', (userId: string) => ({ userId })],
    ['unban-user', (userId: string) => ({ userId })],
    ['set-user-password', (userId: string) => ({ userId, newPassword: 'another-password-1' })],
    ['update-user', (userId: string) => ({ userId, data: { name: 'Renamed' } })],
    ['create-user', () => ({ email: 'sneaky@example.test', name: 'Sneaky', password: PASSWORD, role: 'admin' })],
  ])('answers 404 to an Admin session for POST %s and changes nothing', async (name, body) => {
    const before = await state();
    expect((await route.POST(call(admin.cookie, `/api/auth/admin/${name}`, 'POST', body(victim.id)))).status).toBe(404);
    expect(await state()).toEqual(before);
    expect(before).toHaveLength(1);
    expect((await pool.query(`select 1 from users where email = 'sneaky@example.test'`)).rowCount).toBe(0);
    expect((await pool.query('select name from users where id = $1', [victim.id])).rows[0].name).toBe('victim@example.test');
    expect(await auth.api.signInEmail({ body: { email: 'victim@example.test', password: PASSWORD }, asResponse: true }).then((r) => r.status)).toBe(200);
  });

  test.each(['/api/auth/admin/list-users', '/api/auth/Admin/list-users', '/api/auth//admin/list-users', '/api/auth/%61dmin/list-users', '/api/auth/admin'])(
    'answers 404 to GET %s',
    async (path) => {
      expect((await route.GET(call(admin.cookie, path, 'GET'))).status).toBe(404);
    },
  );
});

describe('the other auth paths', () => {
  test('sign-in with a password still works, and so does reading the session', async () => {
    const res = await route.POST(call(undefined, '/api/auth/sign-in/email', 'POST', { email: 'victim@example.test', password: PASSWORD }));
    expect(res.status).toBe(200);
    const session = await route.GET(call(admin.cookie, '/api/auth/get-session', 'GET'));
    expect(session.status).toBe(200);
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe('admin@example.test');
  });
});
