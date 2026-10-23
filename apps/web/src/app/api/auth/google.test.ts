// Google sign-in and account linking against the real better-auth handler and a disposable database on the compose Postgres
// (`pnpm services:up`). Google's endpoints are mocked (src/test/oauth.ts). The flags are read when lib/auth loads, so this file runs
// with Google configured and Lark not; lark.test.ts is the other way round.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, describe, expect, test, vi } from 'vitest';
import { mockProviders, oauth } from '@/test/oauth';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.GOOGLE_CLIENT_ID = 'google-client';
process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
delete process.env.LARK_APP_ID;
delete process.env.LARK_APP_SECRET;
delete process.env.LARK_TENANT_KEY;

const { auth, pool, googleLoginEnabled, larkLoginEnabled } = await import('@/lib/auth');
const route = await import('./[...all]/route');
const { GET: listUsers } = await import('../admin/users/route');
const { DELETE: adminUnlink } = await import('../admin/users/[id]/accounts/[accountId]/route');
const providers = mockProviders();

const PASSWORD = 'correct-horse-battery';
let seq = 0;

afterAll(async () => {
  vi.unstubAllGlobals();
  await pool.end();
  await testDb.drop();
});

/** A user as an Admin creates them: verified email, a password unless `password: false`. */
async function user(email: string, o: { password?: boolean; role?: 'member' | 'admin'; verified?: boolean } = {}) {
  const { password = true, role = 'member', verified = true } = o;
  const id = (await auth.api.createUser({ body: { email, name: email, role, ...(password ? { password: PASSWORD } : {}), data: { emailVerified: verified } } })).user.id;
  return id;
}
async function cookieOf(email: string) {
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const google = (email: string, extra: { sub?: string; email_verified?: boolean } = {}) => providers.googleCode({ sub: extra.sub ?? `sub-${++seq}`, email, email_verified: extra.email_verified });
const count = async (table: 'users' | 'accounts') => (await pool.query(`select count(*)::int as n from ${table}`)).rows[0].n as number;
const accountsOf = async (userId: string) => (await pool.query('select id, provider_id, account_id from accounts where user_id = $1 order by created_at, id', [userId])).rows;
const audits = async (userId: string) => (await pool.query('select actor_id, action, target, old_value, new_value from audit_entries where target = $1 order by id', [`user:${userId}`])).rows;
const sessionUser = async (cookie: string) => (await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.id;

test('only Google is on when only the Google values are set', () => {
  expect([googleLoginEnabled, larkLoginEnabled]).toEqual([true, false]);
});

describe('Google sign-in', () => {
  test('an allow-listed email signs in and links to the existing user', async () => {
    const id = await user('ana@example.test');
    const users = await count('users');
    const sub = `sub-${++seq}`;
    const flow = await oauth(route, { provider: 'google', code: google('Ana@Example.test', { sub }) });
    expect(flow.error).toBeNull();
    expect(flow.location.pathname).toBe('/create');
    expect(await sessionUser(flow.cookie)).toBe(id);
    expect(await count('users')).toBe(users);
    expect((await accountsOf(id)).map((a) => [a.provider_id, a.account_id])).toEqual([['credential', id], ['google', sub]]);

    const again = await oauth(route, { provider: 'google', code: google('ana@example.test', { sub }) });
    expect(await sessionUser(again.cookie)).toBe(id);
    expect(await accountsOf(id)).toHaveLength(2);
  });

  test('requests only the openid, email and profile scopes', async () => {
    await user('scopes@example.test');
    const flow = await oauth(route, { provider: 'google', code: google('scopes@example.test') });
    expect(flow.authUrl.hostname).toBe('accounts.google.com');
    expect(flow.authUrl.searchParams.get('scope')?.split(' ').sort()).toEqual(['email', 'openid', 'profile']);
  });

  test('refuses an unknown email, even when the client sends requestSignUp: true, and creates no user', async () => {
    await user('someone@example.test');
    const [users, accounts] = [await count('users'), await count('accounts')];
    for (const body of [undefined, { requestSignUp: true }]) {
      const flow = await oauth(route, { provider: 'google', code: google('stranger@example.test'), body });
      expect(flow.error).toBe('signup_disabled');
      expect(flow.location.pathname).toBe('/login');
      expect(flow.cookie).toBe('');
    }
    expect([await count('users'), await count('accounts')]).toEqual([users, accounts]);
    expect((await pool.query(`select 1 from users where email = 'stranger@example.test'`)).rowCount).toBe(0);
  });

  test('refuses email_verified=false for a valid user, creates no account row and no session', async () => {
    const id = await user('unverified@example.test');
    const before = await accountsOf(id);
    const flow = await oauth(route, { provider: 'google', code: google('unverified@example.test', { email_verified: false }) });
    expect(flow.error).toBe('account_not_linked');
    expect(flow.cookie).toBe('');
    expect(await accountsOf(id)).toEqual(before);
  });

  test('refuses a banned user and starts no session', async () => {
    const id = await user('banned@example.test');
    await pool.query('update users set banned = true where id = $1', [id]);
    const [accountsBefore, auditsBefore] = [await accountsOf(id), await audits(id)];
    const flow = await oauth(route, { provider: 'google', code: google('banned@example.test') });
    expect(flow.error).toBe('BANNED_USER');
    expect(flow.location.pathname).toBe('/login');
    expect(flow.cookie).toBe('');
    // The refusal comes before the write: no accounts row and no account.link audit row are left behind.
    expect(await accountsOf(id)).toEqual(accountsBefore);
    expect(await audits(id)).toEqual(auditsBefore);
  });

  test('links a user whose ban has expired', async () => {
    const id = await user('lapsed@example.test');
    await pool.query(`update users set banned = true, ban_expires = now() - interval '1 hour' where id = $1`, [id]);
    const flow = await oauth(route, { provider: 'google', code: google('lapsed@example.test') });
    expect(flow.error).toBeNull();
    expect(await sessionUser(flow.cookie)).toBe(id);
  });

  test('has no Lark provider while Lark is not configured', async () => {
    const res = await route.POST(
      new Request('http://localhost/api/auth/sign-in/social', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost' }, body: JSON.stringify({ provider: 'lark', callbackURL: '/create' }) }),
    );
    expect(res.status).toBe(404);
  });
});

describe('Linking', () => {
  test('a signed-in user links Google with a different email, then signs in with Google to the same user', async () => {
    const id = await user('bea@example.test');
    const cookie = await cookieOf('bea@example.test');
    const sub = `sub-${++seq}`;
    const link = await oauth(route, { provider: 'google', code: google('bea.private@gmail.test', { sub }), link: { cookie } });
    expect(link.error).toBeNull();
    expect(link.location.pathname).toBe('/create');
    expect((await accountsOf(id)).map((a) => a.provider_id)).toEqual(['credential', 'google']);

    const users = await count('users');
    const signIn = await oauth(route, { provider: 'google', code: google('bea.private@gmail.test', { sub }) });
    expect(signIn.error).toBeNull();
    expect(await sessionUser(signIn.cookie)).toBe(id);
    expect(await count('users')).toBe(users);
  });

  test('refuses to link a Google account that is already linked to another user', async () => {
    const owner = await user('owner@example.test');
    const sub = `sub-${++seq}`;
    await oauth(route, { provider: 'google', code: google('owner@example.test', { sub }) });
    const other = await user('other@example.test');
    const cookie = await cookieOf('other@example.test');
    const flow = await oauth(route, { provider: 'google', code: google('owner@example.test', { sub }), link: { cookie } });
    expect(flow.error).toBe('account_already_linked_to_different_user');
    expect(flow.location.pathname).toBe('/account/sign-in-methods');
    expect((await accountsOf(other)).map((a) => a.provider_id)).toEqual(['credential']);
    expect((await accountsOf(owner)).map((a) => a.provider_id)).toEqual(['credential', 'google']);
  });

  test('refuses to link a Google account whose email is not verified, and creates no account row', async () => {
    const id = await user('careful@example.test');
    const cookie = await cookieOf('careful@example.test');
    const before = await accountsOf(id);
    const flow = await oauth(route, { provider: 'google', code: google('careful@example.test', { email_verified: false }), link: { cookie } });
    expect(flow.error).toBe('unable_to_link_account');
    expect(flow.location.pathname).toBe('/account/sign-in-methods');
    expect(await accountsOf(id)).toEqual(before);
    expect(await audits(id)).toEqual([]);
  });

  const unlink = (cookie: string, accountId: string) =>
    route.POST(new Request('http://localhost/api/auth/unlink-account', { method: 'POST', headers: { cookie, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ accountId }) }));

  test('refuses to unlink the last method, and unlinks one when another remains', async () => {
    const googleOnly = await user('only-google@example.test', { password: false });
    const flow = await oauth(route, { provider: 'google', code: google('only-google@example.test') });
    const [only] = await accountsOf(googleOnly);
    const refused = await unlink(flow.cookie, only.id);
    expect(refused.status).toBe(400);
    expect(await accountsOf(googleOnly)).toHaveLength(1);

    const both = await user('both@example.test');
    const cookie = (await oauth(route, { provider: 'google', code: google('both@example.test') })).cookie;
    const rows = await accountsOf(both);
    expect(rows.map((a) => a.provider_id)).toEqual(['credential', 'google']);
    expect((await unlink(cookie, rows[1].id)).status).toBe(200);
    expect((await accountsOf(both)).map((a) => a.provider_id)).toEqual(['credential']);
  });

  test('an Admin unlinks a provider, but not the last method, and a Member cannot', async () => {
    const adminId = await user('boss@example.test', { role: 'admin' });
    const adminCookie = await cookieOf('boss@example.test');
    await user('plain@example.test');
    const memberCookie = await cookieOf('plain@example.test');
    const target = await user('target@example.test');
    const targetCookie = await cookieOf('target@example.test');
    await oauth(route, { provider: 'google', code: google('target.private@gmail.test'), link: { cookie: targetCookie } });
    const [credential, linked] = await accountsOf(target);
    expect([credential.provider_id, linked.provider_id]).toEqual(['credential', 'google']);
    expect(await sessionUser(targetCookie)).toBe(target);

    const del = (cookie: string | undefined, id: string, accountId: string) =>
      adminUnlink(new Request('http://localhost/x', { method: 'DELETE', headers: cookie ? { cookie } : {} }), { params: Promise.resolve({ id, accountId }) });
    expect((await del(undefined, target, linked.id)).status).toBe(401);
    expect((await del(memberCookie, target, linked.id)).status).toBe(403);
    expect((await del(adminCookie, target, credential.id)).status).toBe(404); // the password method is never deleted here
    expect((await del(adminCookie, target, 'no-such-account')).status).toBe(404);
    expect((await del(adminCookie, 'no-such-user', linked.id)).status).toBe(404);
    expect((await accountsOf(target)).map((a) => a.provider_id)).toEqual(['credential', 'google']);
    expect(await sessionUser(targetCookie)).toBe(target);

    expect((await del(adminCookie, target, linked.id)).status).toBe(200);
    expect((await accountsOf(target)).map((a) => a.provider_id)).toEqual(['credential']);
    // The session opened with the lost account ends with it.
    expect(await sessionUser(targetCookie)).toBeUndefined();
    expect((await pool.query('select 1 from sessions where user_id = $1', [target])).rowCount).toBe(0);

    const googleOnly = await user('lost-google@example.test', { password: false });
    await oauth(route, { provider: 'google', code: google('lost-google@example.test') });
    const [only] = await accountsOf(googleOnly);
    expect((await del(adminCookie, googleOnly, only.id)).status).toBe(409);
    expect(await accountsOf(googleOnly)).toHaveLength(1);
    // An account id is only good for its own user.
    expect((await del(adminCookie, target, only.id)).status).toBe(404);
    expect(await accountsOf(googleOnly)).toHaveLength(1);

    const log = await audits(target);
    expect(log.at(-1)).toEqual({ actor_id: adminId, action: 'account.unlink', target: `user:${target}`, old_value: { provider: 'google', email: 'target.private@gmail.test' }, new_value: { sessionsRevoked: true } });
  });

  test('an Admin unlinks exactly the Google account it names when the user holds two', async () => {
    const adminCookie = await cookieOf('boss@example.test');
    const id = await user('twice@example.test');
    const cookie = await cookieOf('twice@example.test');
    await oauth(route, { provider: 'google', code: google('twice@example.test') });
    await oauth(route, { provider: 'google', code: google('twice.private@gmail.test'), link: { cookie } });
    const [credential, first, second] = await accountsOf(id);
    expect([credential.provider_id, first.provider_id, second.provider_id]).toEqual(['credential', 'google', 'google']);

    const res = await adminUnlink(new Request('http://localhost/x', { method: 'DELETE', headers: { cookie: adminCookie } }), { params: Promise.resolve({ id, accountId: second.id }) });
    expect(res.status).toBe(200);
    expect((await accountsOf(id)).map((a) => a.id)).toEqual([credential.id, first.id]);
    expect((await audits(id)).at(-1)).toMatchObject({ action: 'account.unlink', old_value: { provider: 'google', email: 'twice.private@gmail.test' } });
  });

  test('lists each user with the methods linked to the account', async () => {
    const adminCookie = await cookieOf('boss@example.test');
    const res = await listUsers(new Request('http://localhost/api/admin/users', { headers: { cookie: adminCookie } }));
    const { users } = (await res.json()) as { users: { email: string; methods: { provider: string; email: string | null }[] }[] };
    const methods = (email: string) => users.find((u) => u.email === email)?.methods.map((m) => [m.provider, m.email]);
    expect(methods('both@example.test')).toEqual([['credential', null]]);
    expect(methods('owner@example.test')).toEqual([['credential', null], ['google', 'owner@example.test']]);
    expect(methods('only-google@example.test')).toEqual([['google', 'only-google@example.test']]);
  });

  test('writes an audit row for a first sign-in link, a linkSocial link and an unlink', async () => {
    const id = await user('audited@example.test');
    const cookie = await cookieOf('audited@example.test');
    await oauth(route, { provider: 'google', code: google('audited@example.test') });
    const private1 = await oauth(route, { provider: 'google', code: google('audited.private@gmail.test'), link: { cookie } });
    expect(private1.error).toBeNull();
    const rows = await accountsOf(id);
    expect(rows.map((a) => a.provider_id)).toEqual(['credential', 'google', 'google']);
    expect((await unlink(cookie, rows[1].id)).status).toBe(200);
    expect(await audits(id)).toEqual([
      { actor_id: id, action: 'account.link', target: `user:${id}`, old_value: null, new_value: { provider: 'google', accountId: rows[1].account_id, email: 'audited@example.test' } },
      { actor_id: id, action: 'account.link', target: `user:${id}`, old_value: null, new_value: { provider: 'google', accountId: rows[2].account_id, email: 'audited.private@gmail.test' } },
      { actor_id: id, action: 'account.unlink', target: `user:${id}`, old_value: { provider: 'google', email: 'audited@example.test' }, new_value: { sessionsRevoked: true } },
    ]);
  });

  test('a user who unlinks Google ends the other sessions, including the one Google opened, and keeps the current one', async () => {
    const id = await user('revoke@example.test');
    const passwordSession = await cookieOf('revoke@example.test');
    const googleSession = (await oauth(route, { provider: 'google', code: google('revoke@example.test') })).cookie;
    const [, linked] = await accountsOf(id);
    expect([await sessionUser(passwordSession), await sessionUser(googleSession)]).toEqual([id, id]);

    expect((await unlink(passwordSession, linked.id)).status).toBe(200);
    expect(await sessionUser(googleSession)).toBeUndefined();
    expect(await sessionUser(passwordSession)).toBe(id);
    expect((await pool.query('select 1 from sessions where user_id = $1', [id])).rowCount).toBe(1);
    expect((await audits(id)).at(-1)).toMatchObject({ action: 'account.unlink', new_value: { sessionsRevoked: true } });
  });

  test('writes no audit row for the password account an Admin creates a user with', async () => {
    const id = await user('quiet@example.test');
    expect(await audits(id)).toEqual([]);
  });
});
