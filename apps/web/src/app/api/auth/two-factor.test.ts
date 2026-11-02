// Optional TOTP two-factor sign-in, against the real better-auth handler and a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, describe, expect, test } from 'vitest';
import { totpCode, wrongCode } from '../../../../e2e/totp';

const ORIGIN = 'http://localhost';
const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = ORIGIN;

const { auth, pool } = await import('@/lib/auth');
const route = await import('./[...all]/route');
const { PATCH } = await import('../admin/users/[id]/route');

const PASSWORD = 'correct-horse-battery';
afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

async function user(email: string, role: 'member' | 'admin' = 'member') {
  return (await auth.api.createUser({ body: { email, name: email, role, password: PASSWORD, data: { emailVerified: true } } })).user.id;
}
const cookies = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0]);
/** The cookie header a browser would send next: the answer's cookies replace those of the same name. */
const merge = (cookie: string, res: Response) => {
  const jar = new Map(cookie ? cookie.split('; ').map((c) => [c.split('=')[0]!, c] as const) : []);
  for (const c of cookies(res)) {
    const [name = '', value] = (c ?? '').split('=');
    if (value) jar.set(name, c!);
    else jar.delete(name);
  }
  return [...jar.values()].join('; ');
};
const post = (path: string, cookie: string, body: unknown) =>
  route.POST(new Request(`${ORIGIN}/api/auth${path}`, { method: 'POST', headers: { origin: ORIGIN, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const signIn = (email: string, password = PASSWORD, cookie = '') => post('/sign-in/email', cookie, { email, password });
const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;
const signedIn = async (cookie: string) => (await auth.api.getSession({ headers: new Headers({ cookie }) })) !== null;
const audits = async (id: string) => (await pool.query('select action, old_value, new_value from audit_entries where target = $1 order by id', [`user:${id}`])).rows;
const enabled = async (id: string) => (await pool.query('select two_factor_enabled as on from users where id = $1', [id])).rows[0].on as boolean;
const trustedDevices = async (id: string) => (await pool.query(`select 1 from verifications where value = $1 and identifier like 'trust-device-%'`, [id])).rowCount;
const secretOf = (uri: string) => new URL(uri).searchParams.get('secret')!;

/** Signs in, turns 2FA on with the first code, and returns the session cookie, the base32 secret and the backup codes. */
async function withTwoFactor(email: string) {
  let cookie = merge('', await signIn(email));
  const res = await post('/two-factor/enable', cookie, { password: PASSWORD });
  expect(res.status).toBe(200);
  const { totpURI, backupCodes } = (await res.json()) as { totpURI: string; backupCodes: string[] };
  const secret = secretOf(totpURI);
  const verified = await post('/two-factor/verify-totp', cookie, { code: await totpCode(secret) });
  expect(verified.status).toBe(200);
  cookie = merge(cookie, verified);
  return { cookie, secret, backupCodes };
}

describe('turning 2FA on', () => {
  test('needs the password and a right first code, is audited without the secret, and the secret is never read back', async () => {
    const id = await user('an@example.test');
    const cookie = merge('', await signIn('an@example.test'));
    const wrong = await post('/two-factor/enable', cookie, { password: 'not-the-password' });
    expect([wrong.status, await codeOf(wrong)]).toEqual([400, 'INVALID_PASSWORD']);
    const res = await post('/two-factor/enable', cookie, { password: PASSWORD });
    const { totpURI, backupCodes } = (await res.json()) as { totpURI: string; backupCodes: string[] };
    expect(totpURI).toMatch(/^otpauth:\/\/totp\/VET%20Creative%20Video%20Studio:an%40example\.test\?secret=/);
    expect(backupCodes).toHaveLength(10);
    expect(await enabled(id)).toBe(false); // not until a code from the app proves it was set up

    const secret = secretOf(totpURI);
    expect((await post('/two-factor/verify-totp', cookie, { code: wrongCode(await totpCode(secret)) })).status).toBe(401);
    expect(await enabled(id)).toBe(false);
    const ok = await post('/two-factor/verify-totp', cookie, { code: await totpCode(secret) });
    expect(ok.status).toBe(200);
    expect(await enabled(id)).toBe(true);
    // The secret is never read back, and the unused email and SMS codes are closed too.
    for (const path of ['get-totp-uri', 'send-otp', 'verify-otp']) {
      const closed = await route.POST(new Request(`${ORIGIN}/api/auth/two-factor/${path}`, { method: 'POST', headers: { origin: ORIGIN, cookie: merge(cookie, ok), 'content-type': 'application/json' }, body: JSON.stringify({ password: PASSWORD, code: '123456' }) }));
      expect([path, closed.status]).toEqual([path, 404]);
    }

    const log = await audits(id);
    expect(log).toEqual([
      { action: 'user.two_factor_failed', old_value: null, new_value: { code: 'INVALID_CODE' } },
      { action: 'user.two_factor_enable', old_value: null, new_value: { twoFactor: true } },
    ]);
    expect(JSON.stringify(log)).not.toContain(secret);
  });
});

describe('a password sign-in with 2FA on', () => {
  test('opens no session until a right code, refuses a wrong one, and hands the new session in its cookie only', async () => {
    const id = await user('binh@example.test');
    const { secret } = await withTwoFactor('binh@example.test');
    const first = await signIn('binh@example.test');
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ twoFactorRedirect: true, twoFactorMethods: ['totp'] });
    const pending = merge('', first);
    expect(await signedIn(pending)).toBe(false);

    const wrong = await post('/two-factor/verify-totp', pending, { code: wrongCode(await totpCode(secret)) });
    expect([wrong.status, await codeOf(wrong)]).toEqual([401, 'INVALID_CODE']);
    const ok = await post('/two-factor/verify-totp', pending, { code: await totpCode(secret) });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { token?: unknown; user: { id: string } };
    expect(body.user.id).toBe(id);
    expect(body).not.toHaveProperty('token');
    expect(await signedIn(merge(pending, ok))).toBe(true);
    // The refused code is audited with its user, found through the challenge cookie as there is no session yet; the sign-in itself is not.
    expect((await audits(id)).map((a) => [a.action, a.new_value])).toEqual([
      ['user.two_factor_enable', { twoFactor: true }],
      ['user.two_factor_failed', { code: 'INVALID_CODE' }],
    ]);
  });

  test('takes each backup code once', async () => {
    await user('cuong@example.test');
    const { backupCodes } = await withTwoFactor('cuong@example.test');
    const once = await post('/two-factor/verify-backup-code', merge('', await signIn('cuong@example.test')), { code: backupCodes[0] });
    expect(once.status).toBe(200);
    expect(await once.json()).not.toHaveProperty('token');
    const twice = await post('/two-factor/verify-backup-code', merge('', await signIn('cuong@example.test')), { code: backupCodes[0] });
    expect([twice.status, await codeOf(twice)]).toEqual([401, 'INVALID_BACKUP_CODE']);
  });

  test('skips the step on a device trusted for 30 days', async () => {
    await user('dao@example.test');
    const { secret } = await withTwoFactor('dao@example.test');
    const pending = merge('', await signIn('dao@example.test'));
    const ok = await post('/two-factor/verify-totp', pending, { code: await totpCode(secret), trustDevice: true });
    const device = merge(pending, ok);
    expect(device).toContain('trust_device=');
    const again = await signIn('dao@example.test', PASSWORD, device);
    expect(await again.json()).not.toHaveProperty('twoFactorRedirect');
    expect(await signedIn(merge(device, again))).toBe(true);
  });

  test('locks after 10 wrong codes in a row, and the lock is audited', async () => {
    const id = await user('hoa@example.test');
    const { secret } = await withTwoFactor('hoa@example.test');
    const wrong = wrongCode(await totpCode(secret));
    for (let challenge = 0; challenge < 2; challenge++) {
      const pending = merge('', await signIn('hoa@example.test'));
      for (let i = 0; i < 5; i++) expect(await codeOf(await post('/two-factor/verify-totp', pending, { code: wrong }))).toBe('INVALID_CODE');
    }
    const locked = await post('/two-factor/verify-totp', merge('', await signIn('hoa@example.test')), { code: await totpCode(secret) });
    expect([locked.status, await codeOf(locked)]).toEqual([429, 'ACCOUNT_TEMPORARILY_LOCKED']);
    const failed = (await audits(id)).filter((a) => a.action === 'user.two_factor_failed').map((a) => a.new_value.code);
    expect(failed).toEqual([...Array(10).fill('INVALID_CODE'), 'ACCOUNT_TEMPORARILY_LOCKED']);
    expect(JSON.stringify(await audits(id))).not.toContain(wrong);
  });

  test('new backup codes need the password, replace the old ones, and are audited without them', async () => {
    const id = await user('ich@example.test');
    const { cookie, backupCodes } = await withTwoFactor('ich@example.test');
    const res = await post('/two-factor/generate-backup-codes', cookie, { password: PASSWORD });
    const fresh = ((await res.json()) as { backupCodes: string[] }).backupCodes;
    expect(fresh).toHaveLength(10);
    const old = await post('/two-factor/verify-backup-code', merge('', await signIn('ich@example.test')), { code: backupCodes[0] });
    expect(await codeOf(old)).toBe('INVALID_BACKUP_CODE');
    const log = await audits(id);
    expect(log.filter((a) => a.action === 'user.two_factor_backup_codes')).toEqual([{ action: 'user.two_factor_backup_codes', old_value: null, new_value: null }]);
    expect(JSON.stringify(log)).not.toContain(fresh[0]);
  });

  test('turning it off oneself needs the password, forgets every trusted device, and is audited', async () => {
    const id = await user('em@example.test');
    const { cookie, secret } = await withTwoFactor('em@example.test');
    for (let device = 0; device < 2; device++) {
      const pending = merge('', await signIn('em@example.test'));
      expect((await post('/two-factor/verify-totp', pending, { code: await totpCode(secret), trustDevice: true })).status).toBe(200);
    }
    expect(await trustedDevices(id)).toBe(2);
    expect(await codeOf(await post('/two-factor/disable', cookie, { password: 'not-the-password' }))).toBe('INVALID_PASSWORD');
    expect((await post('/two-factor/disable', cookie, { password: PASSWORD })).status).toBe(200);
    expect(await enabled(id)).toBe(false);
    expect(await trustedDevices(id)).toBe(0);
    expect(await (await signIn('em@example.test')).json()).not.toHaveProperty('twoFactorRedirect');
    expect((await audits(id)).map((a) => [a.action, a.new_value])).toEqual([
      ['user.two_factor_enable', { twoFactor: true }],
      ['user.two_factor_disable', { twoFactor: false }],
    ]);
  });
});

describe('a temporary password from an Admin', () => {
  test('refuses every /two-factor/ call of its session, but not the 2FA step of the sign-in, which has no session yet', async () => {
    const id = await user('giang@example.test');
    const { secret } = await withTwoFactor('giang@example.test');
    await pool.query('update users set must_change_password = true where id = $1', [id]);

    const pending = merge('', await signIn('giang@example.test'));
    const ok = await post('/two-factor/verify-totp', pending, { code: await totpCode(secret) });
    expect(ok.status).toBe(200);
    const flagged = merge(pending, ok);
    expect(await signedIn(flagged)).toBe(true);
    for (const [path, body] of [
      ['/two-factor/disable', { password: PASSWORD }],
      ['/two-factor/generate-backup-codes', { password: PASSWORD }],
      ['/two-factor/verify-totp', { code: await totpCode(secret) }],
      ['/two-factor/enable', { password: PASSWORD }],
    ] as const) {
      const res = await post(path, flagged, body);
      expect([path, res.status, await codeOf(res)]).toEqual([path, 403, 'PASSWORD_CHANGE_REQUIRED']);
    }
    expect(await enabled(id)).toBe(true);
  });
});

describe('an Admin turning a user\'s 2FA off', () => {
  const patch = (cookie: string, id: string, body: unknown) =>
    PATCH(new Request(`${ORIGIN}/api/admin/users/${id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

  test('is for Admins only, ends the user\'s sessions and trusted devices, and is audited', async () => {
    const adminId = await user('hai@example.test', 'admin');
    const adminCookie = merge('', await signIn('hai@example.test'));
    const id = await user('khanh@example.test');
    const { cookie, secret } = await withTwoFactor('khanh@example.test');
    const pending = merge('', await signIn('khanh@example.test'));
    const trusted = merge(pending, await post('/two-factor/verify-totp', pending, { code: await totpCode(secret), trustDevice: true }));
    expect(await trustedDevices(id)).toBe(1);

    await user('le@example.test');
    const memberCookie = merge('', await signIn('le@example.test'));
    expect((await patch(memberCookie, id, { twoFactor: false })).status).toBe(403);
    expect((await patch(adminCookie, id, { twoFactor: true })).status).toBe(400);
    expect(await enabled(id)).toBe(true);

    expect((await patch(adminCookie, id, { twoFactor: false })).status).toBe(200);
    expect(await enabled(id)).toBe(false);
    expect((await pool.query('select 1 from two_factors where user_id = $1', [id])).rowCount).toBe(0);
    expect(await trustedDevices(id)).toBe(0);
    expect(await signedIn(cookie)).toBe(false);
    expect(await signedIn(trusted)).toBe(false);
    expect(await signedIn(adminCookie)).toBe(true);
    // Now the password alone signs in.
    const after = await signIn('khanh@example.test');
    expect(await after.json()).not.toHaveProperty('twoFactorRedirect');
    expect(await signedIn(merge('', after))).toBe(true);

    expect((await patch(adminCookie, id, { twoFactor: false })).status).toBe(200); // already off: nothing more to log
    const log = await pool.query(`select actor_id, old_value, new_value from audit_entries where target = $1 and action = 'user.two_factor_disable'`, [`user:${id}`]);
    expect(log.rows).toEqual([{ actor_id: adminId, old_value: { twoFactor: true }, new_value: { twoFactor: false, sessionsRevoked: true } }]);
    expect(JSON.stringify(log.rows)).not.toContain(secret);
  });
});
