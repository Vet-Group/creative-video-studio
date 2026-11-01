// Passkeys against the real better-auth handler and a disposable database on the compose Postgres (`pnpm services:up`). A software
// authenticator (src/test/webauthn.ts) answers the ceremonies, so the plugin's own WebAuthn checks run unmocked.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, describe, expect, test } from 'vitest';
import { softAuthenticator } from '@/test/webauthn';

const ORIGIN = 'http://localhost';
const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = ORIGIN;

const { auth, pool } = await import('@/lib/auth');
const route = await import('./[...all]/route');

const PASSWORD = 'correct-horse-battery';
afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

async function user(email: string) {
  return (await auth.api.createUser({ body: { email, name: email, role: 'member', password: PASSWORD, data: { emailVerified: true } } })).user.id;
}
const cookies = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0]);
async function cookieOf(email: string) {
  return cookies(await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true })).join('; ');
}
const call = (path: string, o: { cookie?: string; body?: unknown } = {}) =>
  (o.body === undefined ? route.GET : route.POST)(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: o.body === undefined ? 'GET' : 'POST',
      headers: { origin: ORIGIN, ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(o.body === undefined ? {} : { body: JSON.stringify(o.body) }),
    }),
  );
/** Runs a ceremony: asks for options with `cookie`, then posts the authenticator's answer with the challenge cookie added. */
async function ceremony(kind: 'register' | 'authenticate', answer: (challenge: string) => unknown, cookie?: string) {
  const options = await call(`/passkey/generate-${kind}-options`, { cookie });
  expect(options.status).toBe(200);
  const { challenge } = (await options.json()) as { challenge: string };
  const jar = [...(cookie ? [cookie] : []), ...cookies(options)].join('; ');
  return call(`/passkey/verify-${kind === 'register' ? 'registration' : 'authentication'}`, { cookie: jar, body: { response: answer(challenge) } });
}
async function seedPasskey(userId: string) {
  const key = softAuthenticator(ORIGIN);
  const id = `pk-${randomBytes(4).toString('hex')}`;
  await pool.query(
    `insert into passkeys (id, public_key, user_id, credential_id, counter, device_type, backed_up, transports) values ($1, $2, $3, $4, 0, 'singleDevice', false, 'internal')`,
    [id, key.publicKey, userId, key.id],
  );
  return { id, key };
}
const count = async (sql: string, params: unknown[] = []) => (await pool.query(`select count(*)::int as n from ${sql}`, params)).rows[0].n as number;
const audits = async (userId: string) => (await pool.query('select action, old_value, new_value from audit_entries where target = $1 order by id', [`user:${userId}`])).rows;

describe('adding a passkey', () => {
  test('needs a signed-in user', async () => {
    expect((await call('/passkey/generate-register-options')).status).toBe(401);
  });

  test('a signed-in user adds one; it is audited as a link and signs that user in later', async () => {
    const id = await user('ana@example.test');
    const key = softAuthenticator(ORIGIN);
    const res = await ceremony('register', (c) => key.register(c), await cookieOf('ana@example.test'));
    expect(res.status).toBe(200);
    const pk = (await res.json()) as { id: string };
    expect((await pool.query('select user_id, credential_id from passkeys where id = $1', [pk.id])).rows).toEqual([{ user_id: id, credential_id: key.id }]);
    expect(await audits(id)).toEqual([{ action: 'account.link', old_value: null, new_value: { provider: 'passkey', accountId: pk.id, email: null } }]);

    const users = await count('users');
    const signIn = await ceremony('authenticate', (c) => key.authenticate(c));
    expect(signIn.status).toBe(200);
    expect(((await signIn.json()) as { user: { id: string } }).user.id).toBe(id);
    expect(await count('users')).toBe(users);
  });
});

describe('signing in with a passkey', () => {
  test('an unknown credential is refused and creates no user', async () => {
    const users = await count('users');
    const res = await ceremony('authenticate', (c) => softAuthenticator(ORIGIN).authenticate(c));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe('PASSKEY_NOT_FOUND');
    expect(await count('users')).toBe(users);
  });

  test('a banned user is refused and gets no session', async () => {
    const id = await user('banned@example.test');
    const { key } = await seedPasskey(id);
    await pool.query('update users set banned = true where id = $1', [id]);
    const res = await ceremony('authenticate', (c) => key.authenticate(c));
    expect(res.status).toBe(403);
    expect(await count('sessions where user_id = $1', [id])).toBe(0);
  });
});

describe('deleting a passkey', () => {
  test('the owner deletes it; it is audited as an unlink and the other sessions stay', async () => {
    const id = await user('bao@example.test');
    const { id: pk } = await seedPasskey(id);
    const [cookie, other] = [await cookieOf('bao@example.test'), await cookieOf('bao@example.test')];
    const res = await call('/passkey/delete-passkey', { cookie, body: { id: pk } });
    expect(res.status).toBe(200);
    expect(await count('passkeys where id = $1', [pk])).toBe(0);
    expect((await audits(id)).at(-1)).toEqual({ action: 'account.unlink', old_value: { provider: 'passkey', accountId: pk, email: null }, new_value: null });
    expect((await auth.api.getSession({ headers: new Headers({ cookie: other }) }))?.user.id).toBe(id);
  });

  test("another user cannot delete someone's passkey", async () => {
    const owner = await user('chi@example.test');
    await user('dan@example.test');
    const { id: pk } = await seedPasskey(owner);
    const res = await call('/passkey/delete-passkey', { cookie: await cookieOf('dan@example.test'), body: { id: pk } });
    expect(res.status).toBe(401);
    expect(await count('passkeys where id = $1', [pk])).toBe(1);
  });
});
