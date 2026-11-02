// Self-service password change, the forced change of an Admin's temporary password and the sessions list, against the real better-auth
// handler and a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, describe, expect, test } from 'vitest';

const ORIGIN = 'http://localhost';
const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = ORIGIN;

const { auth, pool } = await import('@/lib/auth');
const route = await import('./[...all]/route');
const { PATCH } = await import('../admin/users/[id]/route');
const sessionsRoute = await import('../me/sessions/route');
const { GET: limits } = await import('../me/limits/route');

const PASSWORD = 'correct-horse-battery';
afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

async function user(email: string, role: 'member' | 'admin' = 'member') {
  return (await auth.api.createUser({ body: { email, name: email, role, password: PASSWORD, data: { emailVerified: true } } })).user.id;
}
const cookies = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0]);
async function signIn(email: string, password = PASSWORD, agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36') {
  const res = await auth.api.signInEmail({ body: { email, password }, headers: new Headers({ 'user-agent': agent }), asResponse: true });
  return { status: res.status, cookie: cookies(res).join('; ') };
}
const post = (path: string, cookie: string, body: unknown) =>
  route.POST(new Request(`${ORIGIN}/api/auth${path}`, { method: 'POST', headers: { origin: ORIGIN, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const get = (path: string, cookie: string) => route.GET(new Request(`${ORIGIN}/api/auth${path}`, { headers: { origin: ORIGIN, cookie } }));
const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;
const changePassword = (cookie: string, currentPassword: string, newPassword: string) => post('/change-password', cookie, { currentPassword, newPassword, revokeOtherSessions: true });
const sessions = async (cookie: string) => sessionsRoute.GET(new Request(`${ORIGIN}/api/me/sessions`, { headers: { cookie } }));
const revoke = (cookie: string, id?: string) =>
  sessionsRoute.DELETE(new Request(`${ORIGIN}/api/me/sessions${id ? `?id=${id}` : ''}`, { method: 'DELETE', headers: { cookie } }));
const flag = async (id: string) => (await pool.query('select must_change_password as f from users where id = $1', [id])).rows[0].f as boolean;
const audits = async (id: string) => (await pool.query('select action, new_value from audit_entries where target = $1 order by id', [`user:${id}`])).rows;
const signedIn = async (cookie: string) => (await auth.api.getSession({ headers: new Headers({ cookie }) })) !== null;

describe('changing one\'s own password', () => {
  test('needs the current password, signs the other devices out, and is audited without either password', async () => {
    const id = await user('ana@example.test');
    const here = (await signIn('ana@example.test')).cookie;
    const there = (await signIn('ana@example.test')).cookie;
    const wrong = await changePassword(here, 'not-the-password', 'brand-new-pass-1');
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { code: string }).code).toBe('INVALID_PASSWORD');
    const same = await changePassword(here, PASSWORD, PASSWORD);
    expect(((await same.json()) as { code: string }).code).toBe('PASSWORD_UNCHANGED');
    expect(await audits(id)).toEqual([]);

    const kept = await post('/change-password', here, { currentPassword: PASSWORD, newPassword: 'brand-new-pass-1' });
    expect([kept.status, await codeOf(kept)]).toEqual([400, 'REVOKE_REQUIRED']); // the other sessions always end with the old password
    expect(await signedIn(there)).toBe(true);

    const res = await changePassword(here, PASSWORD, 'brand-new-pass-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: unknown; user: { id: string } };
    expect(body.user.id).toBe(id);
    expect(body).not.toHaveProperty('token'); // the new session token stays in its httpOnly cookie
    expect(await signedIn(there)).toBe(false);
    expect(await signedIn(cookies(res).join('; '))).toBe(true); // the new session cookie of this device
    expect((await signIn('ana@example.test')).status).toBe(401);
    expect((await signIn('ana@example.test', 'brand-new-pass-1')).status).toBe(200);
    const log = await audits(id);
    expect(log).toEqual([{ action: 'user.password_change', new_value: { sessionsRevoked: true } }]);
    expect(JSON.stringify(log)).not.toContain('brand-new-pass-1');
  });
});

describe('a temporary password from an Admin', () => {
  test('must be changed: until then every guarded route refuses, and the change lifts it', async () => {
    await user('boss@example.test', 'admin');
    const adminCookie = (await signIn('boss@example.test')).cookie;
    const id = await user('bao@example.test');
    expect(await flag(id)).toBe(false);
    const set = await PATCH(
      new Request(`${ORIGIN}/api/admin/users/${id}`, { method: 'PATCH', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ temporaryPassword: 'temporary-pass-1' }) }),
      { params: Promise.resolve({ id }) },
    );
    expect(set.status).toBe(200);
    expect(await flag(id)).toBe(true);

    const cookie = (await signIn('bao@example.test', 'temporary-pass-1')).cookie;
    for (const res of [await limits(new Request(`${ORIGIN}/api/me/limits`, { headers: { cookie } })), await sessions(cookie)]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'password_change_required' });
    }
    // No other way in can be added or kept with the temporary password, since it would outlive the change.
    for (const res of [
      await post('/link-social', cookie, { provider: 'google', callbackURL: '/account/sign-in-methods' }),
      await get('/passkey/generate-register-options', cookie),
    ]) {
      expect([res.status, await codeOf(res)]).toEqual([403, 'PASSWORD_CHANGE_REQUIRED']);
    }
    expect((await post('/update-user', cookie, { name: 'Renamed' })).status).toBe(404); // closed for every session (route.ts)
    expect(((await (await changePassword(cookie, 'temporary-pass-1', 'temporary-pass-1')).json()) as { code: string }).code).toBe('PASSWORD_UNCHANGED');
    expect(await flag(id)).toBe(true);

    const changed = await changePassword(cookie, 'temporary-pass-1', 'my-own-password-1');
    expect(changed.status).toBe(200);
    expect(await flag(id)).toBe(false);
    const fresh = cookies(changed).join('; ');
    expect((await limits(new Request(`${ORIGIN}/api/me/limits`, { headers: { cookie: fresh } }))).status).toBe(200);
    expect((await get('/passkey/generate-register-options', fresh)).status).toBe(200); // the same calls open again after the change
    const link = await post('/link-social', fresh, { provider: 'google', callbackURL: '/account/sign-in-methods' });
    expect(await codeOf(link)).not.toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await audits(id)).map((a) => a.action)).toEqual(['user.password_set', 'user.password_change']);
  });
});

describe('the sessions list', () => {
  test('lists the live sessions without tokens, marks this one, and signs out one or all of the others with an audit row', async () => {
    const id = await user('chi@example.test');
    const here = (await signIn('chi@example.test')).cookie;
    const phone = (await signIn('chi@example.test', PASSWORD, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) Version/18.6 Mobile/15E148 Safari/604.1')).cookie;
    const tablet = (await signIn('chi@example.test')).cookie;
    const other = await user('dung@example.test');
    const stranger = (await signIn('dung@example.test')).cookie;

    const list = (await (await sessions(here)).json()) as { sessions: Record<string, unknown>[] };
    expect(list.sessions).toHaveLength(3);
    expect(list.sessions.filter((s) => s.current)).toHaveLength(1);
    expect(list.sessions.some((s) => String(s.userAgent).includes('iPhone'))).toBe(true);
    expect(JSON.stringify(list)).not.toMatch(/token/i);

    const phoneId = list.sessions.find((s) => String(s.userAgent).includes('iPhone'))!.id as string;
    const strangerId = ((await (await sessions(stranger)).json()) as { sessions: { id: string }[] }).sessions[0]!.id;
    expect((await revoke(here, strangerId)).status).toBe(404); // another user's session is out of reach
    expect(await signedIn(stranger)).toBe(true);
    const currentId = list.sessions.find((s) => s.current)!.id as string;
    expect((await revoke(here, currentId)).status).toBe(404); // this device signs out with /api/auth/sign-out instead

    expect(await (await revoke(here, phoneId)).json()).toEqual({ revoked: 1 });
    expect(await signedIn(phone)).toBe(false);
    expect(await signedIn(tablet)).toBe(true);
    expect(await (await revoke(here)).json()).toEqual({ revoked: 1 });
    expect(await signedIn(tablet)).toBe(false);
    expect(await signedIn(here)).toBe(true);
    expect(await audits(id)).toEqual([
      { action: 'user.sessions_revoke', new_value: { sessions: 1, others: false } },
      { action: 'user.sessions_revoke', new_value: { sessions: 1, others: true } },
    ]);
    expect(await audits(other)).toEqual([]);
    expect((await sessions('')).status).toBe(401);
    expect((await get('/list-sessions', here)).status).toBe(404); // closed: it would hand every token to the page
    for (const path of ['/get-access-token', '/refresh-token', '/account-info']) expect((await get(path, here)).status, path).toBe(404); // provider tokens outlive a password change
  });
});
