// Lark sign-in against the real better-auth handler and a disposable database on the compose Postgres (`pnpm services:up`).
// Lark's endpoints are mocked (src/test/oauth.ts). Lark is configured here and Google is not; google.test.ts is the other way round.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, describe, expect, test, vi } from 'vitest';
import { mockProviders, oauth } from '@/test/oauth';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
process.env.LARK_APP_ID = 'cli_lark_app';
process.env.LARK_APP_SECRET = 'lark-secret';
process.env.LARK_TENANT_KEY = 'tenant-vet';
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;

const { auth, pool, googleLoginEnabled, larkLoginEnabled } = await import('@/lib/auth');
const route = await import('./[...all]/route');
const providers = mockProviders();

let seq = 0;

afterAll(async () => {
  vi.unstubAllGlobals();
  await pool.end();
  await testDb.drop();
});

async function user(email: string, o: { verified?: boolean } = {}) {
  return (await auth.api.createUser({ body: { email, name: email, role: 'member', data: { emailVerified: o.verified ?? true } } })).user.id;
}
const lark = ({ tenant_key = 'tenant-vet', ...p }: { enterprise_email?: string; email?: string; tenant_key?: string | null }) =>
  providers.larkCode({ open_id: `ou_${++seq}`, ...p, ...(tenant_key === null ? {} : { tenant_key }) });
const count = async (table: 'users' | 'accounts') => (await pool.query(`select count(*)::int as n from ${table}`)).rows[0].n as number;
const accountsOf = async (userId: string) => (await pool.query('select provider_id, account_id from accounts where user_id = $1', [userId])).rows;
const sessionUser = async (cookie: string) => (await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.id;

test('only Lark is on when only the Lark values are set', () => {
  expect([googleLoginEnabled, larkLoginEnabled]).toEqual([false, true]);
});

describe('Lark sign-in', () => {
  test('an allow-listed enterprise email signs in and links to the existing user', async () => {
    const id = await user('lan@example.test');
    const users = await count('users');
    const code = lark({ enterprise_email: 'Lan@Example.test' });
    const flow = await oauth(route, { provider: 'lark', code });
    expect(flow.error).toBeNull();
    expect(flow.location.pathname).toBe('/create');
    expect(await sessionUser(flow.cookie)).toBe(id);
    expect(await count('users')).toBe(users);
    expect((await accountsOf(id)).map((a) => a.provider_id)).toEqual(['lark']);
    expect((await pool.query(`select new_value from audit_entries where target = $1 and action = 'account.link'`, [`user:${id}`])).rows).toEqual([
      { new_value: { provider: 'lark', email: 'lan@example.test' } },
    ]);
  });

  test('exchanges the code with a JSON request that carries the PKCE verifier, and asks for the company email scope', async () => {
    await user('request@example.test');
    const flow = await oauth(route, { provider: 'lark', code: lark({ enterprise_email: 'request@example.test' }) });
    expect(flow.authUrl.hostname).toBe('accounts.larksuite.com');
    expect(flow.authUrl.searchParams.get('client_id')).toBe('cli_lark_app');
    expect(flow.authUrl.searchParams.get('scope')).toContain('contact:user.enterprise_email:readonly');
    expect(providers.larkTokenRequests.at(-1)).toMatchObject({ grant_type: 'authorization_code', client_id: 'cli_lark_app', client_secret: 'lark-secret', code: expect.stringMatching(/^lark-code-/) });
    expect(providers.larkTokenRequests.at(-1)?.code_verifier).toEqual(expect.any(String));
  });

  test('refuses an unknown email and creates no user', async () => {
    await user('known@example.test');
    const [users, accounts] = [await count('users'), await count('accounts')];
    const flow = await oauth(route, { provider: 'lark', code: lark({ enterprise_email: 'stranger@example.test' }) });
    expect(flow.error).toBe('signup_disabled');
    expect(flow.location.pathname).toBe('/login');
    expect(flow.cookie).toBe('');
    expect([await count('users'), await count('accounts')]).toEqual([users, accounts]);
  });

  test('refuses requestSignUp: true with an unknown email and creates no user', async () => {
    const users = await count('users');
    const flow = await oauth(route, { provider: 'lark', code: lark({ enterprise_email: 'newcomer@example.test' }), body: { requestSignUp: true } });
    expect(flow.error).toBe('signup_disabled');
    expect(await count('users')).toBe(users);
    expect((await pool.query(`select 1 from users where email = 'newcomer@example.test'`)).rowCount).toBe(0);
  });

  test('refuses a banned user and starts no session', async () => {
    const id = await user('banned@example.test');
    await pool.query('update users set banned = true where id = $1', [id]);
    const flow = await oauth(route, { provider: 'lark', code: lark({ enterprise_email: 'banned@example.test' }) });
    expect(flow.error).toBe('BANNED_USER');
    expect(flow.cookie).toBe('');
  });

  test('refuses a tenant_key other than LARK_TENANT_KEY, or none, and links nothing', async () => {
    const id = await user('tenant@example.test');
    for (const tenant_key of ['tenant-other', null]) {
      const flow = await oauth(route, { provider: 'lark', code: lark({ enterprise_email: 'tenant@example.test', tenant_key }) });
      expect(flow.error, String(tenant_key)).toBe('unable_to_get_user_info');
      expect(flow.cookie).toBe('');
    }
    expect(await accountsOf(id)).toEqual([]);
  });

  test('uses only enterprise_email: a personal email alone is refused, even when it matches a user', async () => {
    const id = await user('personal@example.test');
    const flow = await oauth(route, { provider: 'lark', code: lark({ email: 'personal@example.test' }) });
    expect(flow.error).toBe('unable_to_get_user_info');
    expect(flow.cookie).toBe('');
    expect(await accountsOf(id)).toEqual([]);

    // With both, the enterprise address decides, whatever the personal one is.
    const both = await oauth(route, { provider: 'lark', code: lark({ email: 'personal@example.test', enterprise_email: 'work@example.test' }) });
    expect(both.error).toBe('signup_disabled');
  });

  test('keeps the local email verification gate: an unverified user is not linked', async () => {
    const id = await user('raw@example.test', { verified: false });
    const flow = await oauth(route, { provider: 'lark', code: lark({ enterprise_email: 'raw@example.test' }) });
    expect(flow.error).toBe('account_not_linked');
    expect(await accountsOf(id)).toEqual([]);
  });

  test('has no Google provider while Google is not configured', async () => {
    const res = await route.POST(
      new Request('http://localhost/api/auth/sign-in/social', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost' }, body: JSON.stringify({ provider: 'google', callbackURL: '/create' }) }),
    );
    expect(res.status).toBe(404);
  });
});
