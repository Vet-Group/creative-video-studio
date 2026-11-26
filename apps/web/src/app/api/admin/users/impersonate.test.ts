// "Sign in as another user" for a developer Admin: start, stop, the per-account flag and the credential paths that stay shut meanwhile,
// against the real better-auth handler and a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const ORIGIN = 'http://localhost';
const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = ORIGIN;

const { auth, pool } = await import('@/lib/auth');
const authRoute = await import('../../auth/[...all]/route');
const { PATCH } = await import('./[id]/route');
const { POST: start } = await import('./[id]/impersonate/route');
const { POST: stop } = await import('../../me/stop-impersonating/route');
const { POST: switchWorkspace } = await import('../../me/workspace/route');
const { DELETE: deleteJob } = await import('../../jobs/[id]/route');
const { POST: zip } = await import('../../library/zip/route');
const profile = await import('../../me/profile/route');
const sessionsRoute = await import('../../me/sessions/route');
const { GET: limits } = await import('../../me/limits/route');
const { GET: listUsers } = await import('./route');
const { DELETE: unlink } = await import('./[id]/accounts/[accountId]/route');
const rating = await import('../../rating/route');
const snooze = await import('../../rating/snooze/route');
const { readSession } = await import('@/lib/session');

const PASSWORD = 'correct-horse-battery';
afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

async function user(email: string, role: 'member' | 'admin') {
  return (await auth.api.createUser({ body: { email, name: email, role, password: PASSWORD, data: { emailVerified: true } } })).user.id;
}
async function signIn(email: string) {
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return merge('', res);
}
/** A browser's cookie jar: what the response sets replaces what the request carried, and an emptied or expired cookie is dropped. */
function merge(cookie: string, res: Response): string {
  const jar = new Map(cookie.split('; ').filter(Boolean).map((c) => [c.slice(0, c.indexOf('=')), c]));
  for (const c of res.headers.getSetCookie()) {
    const pair = c.split(';')[0]!;
    const name = pair.slice(0, pair.indexOf('='));
    if (pair.endsWith('=') || /max-age=0/i.test(c)) jar.delete(name);
    else jar.set(name, pair);
  }
  return [...jar.values()].join('; ');
}
const startAs = (cookie: string, id: string, origin: string | null = ORIGIN) =>
  start(new Request(`${ORIGIN}/api/admin/users/${id}/impersonate`, { method: 'POST', headers: { cookie, ...(origin ? { origin } : {}) } }), { params: Promise.resolve({ id }) });
const stopAs = (cookie: string, origin: string | null = ORIGIN) => stop(new Request(`${ORIGIN}/api/me/stop-impersonating`, { method: 'POST', headers: { cookie, ...(origin ? { origin } : {}) } }));
const asUser = (cookie: string) => limits(new Request(`${ORIGIN}/api/me/limits`, { headers: { cookie } }));
const dropDontRemember = (cookie: string) => cookie.split('; ').filter((c) => !c.includes('dont_remember')).join('; ');
const patch = (cookie: string, id: string, body: unknown) =>
  PATCH(new Request(`${ORIGIN}/api/admin/users/${id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const authPost = (path: string, cookie: string, body: unknown = {}) =>
  authRoute.POST(new Request(`${ORIGIN}/api/auth${path}`, { method: 'POST', headers: { origin: ORIGIN, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const whoami = async (cookie: string) => (await auth.api.getSession({ headers: new Headers({ cookie }) }))!;
const audits = async (action: string) => (await pool.query('select actor_id, target, old_value, new_value from audit_entries where action = $1 order by id', [action])).rows;
const setFlag = (id: string, on = true) => pool.query('update users set can_impersonate = $2 where id = $1', [id, on]);

let dev: string, plain: string, other: string, member: string, locked: string;
let devCookie = '', plainCookie = '', memberCookie = '';

beforeAll(async () => {
  dev = await user('dev@example.test', 'admin');
  plain = await user('plain@example.test', 'admin');
  other = await user('other@example.test', 'admin');
  member = await user('member@example.test', 'member');
  locked = await user('locked@example.test', 'member');
  await setFlag(dev); // seeded here, never by the migration
  await pool.query('update users set banned = true where id = $1', [locked]);
  [devCookie, plainCookie, memberCookie] = await Promise.all([signIn('dev@example.test'), signIn('plain@example.test'), signIn('member@example.test')]);
});

describe('the migration', () => {
  test('grants the flag to nobody', async () => {
    expect((await pool.query(`select count(*)::int as n from users where can_impersonate and id <> $1`, [dev])).rows[0].n).toBe(0);
  });
});

describe('POST /api/admin/users/[id]/impersonate', () => {
  test('refuses an Admin without the flag, a member and a visitor', async () => {
    expect((await startAs(plainCookie, member)).status).toBe(403);
    expect((await startAs(memberCookie, other)).status).toBe(403);
    expect((await startAs('', member)).status).toBe(401);
    expect(await audits('user.impersonate_start')).toHaveLength(0);
  });

  test('refuses yourself, a locked account and an unknown user', async () => {
    expect((await startAs(devCookie, dev)).status).toBe(400);
    expect((await startAs(devCookie, locked)).status).toBe(409);
    expect((await startAs(devCookie, 'nobody')).status).toBe(404);
    expect(await audits('user.impersonate_start')).toHaveLength(0);
  });

  test('opens the member\'s session for an hour, sets the cookies and audits the start with the real Admin as actor', async () => {
    const res = await startAs(devCookie, member);
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join('\n')).toMatch(/session_token[\s\S]*admin_session/i);
    const cookie = merge(devCookie, res);
    const s = await whoami(cookie);
    expect(s.user.id).toBe(member);
    expect(s.session.impersonatedBy).toBe(dev);
    expect(new Date(s.session.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(3600_000);
    expect(await audits('user.impersonate_start')).toEqual([{ actor_id: dev, target: `user:${member}`, old_value: null, new_value: null }]);
  });

  test('allows an Admin target, then refuses to start again while signed in as someone', async () => {
    const res = await startAs(devCookie, other);
    expect(res.status).toBe(200);
    const cookie = merge(devCookie, res);
    expect((await whoami(cookie)).user.id).toBe(other);
    const nested = await startAs(cookie, member);
    expect(nested.status).toBe(403);
    expect(((await nested.json()) as { error: string }).error).toBe('not_allowed_while_impersonating');
    expect(await audits('user.impersonate_start')).toHaveLength(2);
  });
});

describe('POST /api/me/stop-impersonating', () => {
  test('refuses a session that is not an impersonation, and audits nothing', async () => {
    expect((await stopAs(memberCookie)).status).toBe(409);
    expect((await stopAs(devCookie)).status).toBe(409);
    expect((await stopAs('')).status).toBe(401);
    expect(await audits('user.impersonate_stop')).toHaveLength(0);
  });

  test('puts the Admin back in their own session and audits the stop with the real Admin as actor', async () => {
    const started = merge(devCookie, await startAs(devCookie, member));
    const res = await stopAs(started);
    expect(res.status).toBe(200);
    const back = merge(started, res);
    const s = await whoami(back);
    expect(s.user.id).toBe(dev);
    expect(s.session.impersonatedBy ?? null).toBeNull();
    expect((await audits('user.impersonate_stop')).at(-1)).toMatchObject({ actor_id: dev, target: `user:${member}` });
    // The member's session is gone: the old cookie opens nothing.
    expect(await auth.api.getSession({ headers: new Headers({ cookie: started }) })).toBeNull();
  });
});

describe('PATCH /api/admin/users/[id] canImpersonate', () => {
  test('a developer Admin turns it on and off for another Admin, each change audited with old and new value', async () => {
    expect((await patch(devCookie, plain, { canImpersonate: true })).status).toBe(200);
    expect((await patch(devCookie, plain, { canImpersonate: true })).status).toBe(200); // no change, no second row
    expect((await patch(devCookie, plain, { canImpersonate: false })).status).toBe(200);
    expect(await audits('user.developer')).toEqual([
      { actor_id: dev, target: `user:${plain}`, old_value: { canImpersonate: false }, new_value: { canImpersonate: true } },
      { actor_id: dev, target: `user:${plain}`, old_value: { canImpersonate: true }, new_value: { canImpersonate: false } },
    ]);
  });

  test('is refused for an Admin without the flag, on your own account, on a member and for a non-boolean', async () => {
    expect((await patch(plainCookie, other, { canImpersonate: true })).status).toBe(403);
    expect((await patch(plainCookie, plain, { canImpersonate: true })).status).toBe(403);
    expect((await patch(devCookie, dev, { canImpersonate: false })).status).toBe(400);
    expect((await patch(devCookie, member, { canImpersonate: true })).status).toBe(400);
    expect((await patch(devCookie, other, { canImpersonate: 'yes' })).status).toBe(400);
    expect((await pool.query('select can_impersonate from users where id = any($1)', [[plain, other, member, dev]])).rows.filter((r) => r.can_impersonate)).toHaveLength(1);
  });

  test('is refused while signed in as another Admin', async () => {
    await setFlag(other);
    const cookie = merge(devCookie, await startAs(devCookie, other));
    expect((await patch(cookie, plain, { canImpersonate: true })).status).toBe(403);
    await setFlag(other, false);
  });
});

describe('while signed in as a user', () => {
  let cookie = '';
  let adminCookie = '';
  beforeAll(async () => {
    cookie = merge(devCookie, await startAs(devCookie, member));
    adminCookie = merge(devCookie, await startAs(devCookie, other));
  });

  test.each([
    ['/change-password', { currentPassword: PASSWORD, newPassword: 'another-long-password', revokeOtherSessions: true }],
    ['/change-email', { newEmail: 'x@example.test' }],
    ['/two-factor/enable', { password: PASSWORD }],
    ['/two-factor/disable', { password: PASSWORD }],
    ['/two-factor/generate-backup-codes', { password: PASSWORD }],
    ['/passkey/delete-passkey', { id: 'x' }],
    ['/unlink-account', { providerId: 'lark' }],
    ['/link-social', { provider: 'lark' }],
    ['/revoke-other-sessions', {}],
  ])('%s is refused with IMPERSONATING', async (path, body) => {
    const res = await authPost(path, cookie, body);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe('IMPERSONATING');
  });

  test('/passkey/generate-register-options (a GET) is refused with IMPERSONATING', async () => {
    const res = await authRoute.GET(new Request(`${ORIGIN}/api/auth/passkey/generate-register-options`, { headers: { origin: ORIGIN, cookie } }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe('IMPERSONATING');
  });

  test('the same paths still answer the member in their own session', async () => {
    const res = await authPost('/change-password', memberCookie, { currentPassword: 'wrong-password-here', newPassword: 'another-long-password', revokeOtherSessions: true });
    expect(((await res.json()) as { code?: string }).code).not.toBe('IMPERSONATING');
  });

  test('the profile and the session list are refused too', async () => {
    const rename = await profile.PATCH(new Request(`${ORIGIN}/api/me/profile`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Renamed' }) }));
    expect(rename.status).toBe(403);
    expect((await sessionsRoute.DELETE(new Request(`${ORIGIN}/api/me/sessions`, { method: 'DELETE', headers: { cookie } }))).status).toBe(403);
    expect((await pool.query('select name from users where id = $1', [member])).rows[0].name).toBe('member@example.test');
  });

  test('the satisfaction rating and its snooze are refused, so an Admin never answers for the member', async () => {
    const sent = await rating.POST(new Request(`${ORIGIN}/api/rating`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ score: 9 }) }));
    const later = await snooze.POST(new Request(`${ORIGIN}/api/rating/snooze`, { method: 'POST', headers: { cookie } }));
    for (const res of [sent, later]) {
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: string }).error).toBe('not_allowed_while_impersonating');
    }
    const row = (await pool.query('select (select count(*)::int from ratings where user_id = $1) as n, rating_snoozed_until from users where id = $1', [member])).rows[0];
    expect(row).toEqual({ n: 0, rating_snoozed_until: null });
  });

  test('the satisfaction rating is never due for the Admin, though it is due for the member in their own session', async () => {
    for (let i = 0; i < 3; i++) {
      await pool.query(
        `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, feature, status, is_mock, workspace_id)
         values ($1, $2, 'team-unassigned', 'kling-o3-pro', 'fal', 'p', '9:16', 5, '{}', 'video', 'succeeded', false, $3)`,
        [`rating-due-${i}`, member, COMPANY_WORKSPACE_ID],
      );
    }
    const due = async (c: string) => ((await (await rating.GET(new Request(`${ORIGIN}/api/rating`, { headers: { cookie: c } }))).json()) as { due: boolean }).due;
    expect(await due(memberCookie)).toBe(true);
    expect(await due(cookie)).toBe(false);
  });

  test('an impersonated Admin cannot change their own email, password or 2FA, nor unlink their own sign-in methods', async () => {
    expect((await patch(adminCookie, other, { email: 'moved@example.test' })).status).toBe(403);
    expect((await patch(adminCookie, other, { temporaryPassword: 'a-new-temporary-pass' })).status).toBe(403);
    expect((await patch(adminCookie, other, { twoFactor: false })).status).toBe(403);
    expect((await pool.query('select email from users where id = $1', [other])).rows[0].email).toBe('other@example.test');
  });

  test('everything else works as that user, and the temporary-password gate does not hold the Admin up', async () => {
    expect((await asUser(cookie)).status).toBe(200);
    await pool.query('update users set must_change_password = true where id = $1', [member]);
    expect((await asUser(cookie)).status).toBe(200);
    // The member's own session is still held at the gate.
    expect((await limits(new Request(`${ORIGIN}/api/me/limits`, { headers: { cookie: memberCookie } }))).status).toBe(403);
    await pool.query('update users set must_change_password = false where id = $1', [member]);
  });
});

describe('the origin of the two POST routes', () => {
  test('a missing or foreign Origin is refused before anything happens', async () => {
    expect((await startAs(devCookie, member, null)).status).toBe(403);
    expect((await startAs(devCookie, member, 'https://evil.example')).status).toBe(403);
    const started = merge(devCookie, await startAs(devCookie, member));
    expect((await stopAs(started, null)).status).toBe(403);
    expect((await stopAs(started, 'https://evil.example')).status).toBe(403);
    expect((await whoami(started)).user.id).toBe(member); // still signed in as the member
    expect((await stopAs(started)).status).toBe(200);
  });
});

describe("the one-hour limit and the holder's standing, enforced on every request", () => {
  const holder = async (email: string) => {
    const id = await user(email, 'admin');
    await setFlag(id);
    return { id, cookie: await signIn(email) };
  };
  const impersonating = async (h: { cookie: string }) => merge(h.cookie, await startAs(h.cookie, member));

  test('dropping the dont_remember cookie does not stretch the hour: better-auth renews the session, the app still ends it', async () => {
    const h = await holder('limit@example.test');
    const cookie = dropDontRemember(await impersonating(h));
    const s = await whoami(cookie);
    expect(new Date(s.session.expiresAt).getTime() - Date.now()).toBeGreaterThan(3600_000 * 24); // renewed to the 7-day default
    expect((await asUser(cookie)).status).toBe(200); // within the hour
    await pool.query(`update sessions set created_at = now() - interval '61 minutes' where impersonated_by = $1`, [h.id]);
    expect((await asUser(cookie)).status).toBe(401);
    expect(await readSession(new Headers({ cookie }))).toBeNull();
  });

  test("turning the holder's flag off ends the impersonation", async () => {
    const h = await holder('flagoff@example.test');
    const cookie = await impersonating(h);
    expect((await asUser(cookie)).status).toBe(200);
    expect((await patch(devCookie, h.id, { canImpersonate: false })).status).toBe(200);
    expect((await asUser(cookie)).status).toBe(401);
  });

  test('locking the holder ends the impersonation', async () => {
    const h = await holder('banned@example.test');
    const cookie = await impersonating(h);
    expect((await patch(devCookie, h.id, { banned: true })).status).toBe(200);
    expect((await asUser(cookie)).status).toBe(401);
  });

  test('demoting the holder ends the impersonation and clears the flag, audited', async () => {
    const h = await holder('demoted@example.test');
    const cookie = await impersonating(h);
    expect((await patch(devCookie, h.id, { role: 'member' })).status).toBe(200);
    expect((await asUser(cookie)).status).toBe(401);
    expect((await pool.query('select can_impersonate from users where id = $1', [h.id])).rows[0].can_impersonate).toBe(false);
    expect((await audits('user.developer')).at(-1)).toMatchObject({ actor_id: dev, target: `user:${h.id}`, old_value: { canImpersonate: true }, new_value: { canImpersonate: false } });
    expect((await patch(devCookie, h.id, { role: 'admin' })).status).toBe(200); // promoting again does not bring the flag back
    expect((await pool.query('select can_impersonate from users where id = $1', [h.id])).rows[0].can_impersonate).toBe(false);
  });
});

describe("a developer Admin's account", () => {
  test('an Admin without the flag cannot change its email, password or 2FA, nor unlink its sign-in methods, but can still lock it', async () => {
    const id = await user('target-dev@example.test', 'admin');
    await setFlag(id);
    for (const body of [{ email: 'taken@example.test' }, { temporaryPassword: 'a-new-temporary-pass' }, { twoFactor: false }]) expect((await patch(plainCookie, id, body)).status).toBe(403);
    const del = await unlink(new Request(`${ORIGIN}/api/admin/users/${id}/accounts/x`, { method: 'DELETE', headers: { cookie: plainCookie } }), { params: Promise.resolve({ id, accountId: 'x' }) });
    expect(del.status).toBe(403);
    expect((await pool.query('select email from users where id = $1', [id])).rows[0].email).toBe('target-dev@example.test');
    expect((await patch(devCookie, id, { email: 'moved-dev@example.test' })).status).toBe(200); // a developer Admin may
    expect((await patch(plainCookie, id, { banned: true })).status).toBe(200);
  });
});

describe('an impersonated Admin only looks', () => {
  test('every change through an Admin route is refused, a read is allowed', async () => {
    const cookie = merge(devCookie, await startAs(devCookie, other));
    expect((await patch(cookie, member, { name: 'Renamed by mistake' })).status).toBe(403);
    expect((await pool.query('select name from users where id = $1', [member])).rows[0].name).toBe('member@example.test');
    const read = await listUsers(new Request(`${ORIGIN}/api/admin/users`, { headers: { cookie } }));
    expect(read.status).toBe(200);
  });

  test('a change through a member route with an Admin branch is refused too; the Library zip (a read sent as POST), switching workspace and stopping still work', async () => {
    const cookie = merge(devCookie, await startAs(devCookie, other));
    const del = await deleteJob(new Request(`${ORIGIN}/api/jobs/x`, { method: 'DELETE', headers: { cookie } }), { params: Promise.resolve({ id: 'x' }) });
    expect(del.status).toBe(403);
    expect(((await del.json()) as { error: string }).error).toBe('not_allowed_while_impersonating');
    const download = await zip(new Request(`${ORIGIN}/api/library/zip`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ids: [] }) }));
    expect([download.status, ((await download.json()) as { error: string }).error]).toEqual([400, 'ids must list 1 to 50 items']); // past the guard
    const ws = await switchWorkspace(
      new Request(`${ORIGIN}/api/me/workspace`, { method: 'POST', headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: COMPANY_WORKSPACE_ID }) }),
    );
    expect(ws.status).toBe(200);
    expect((await stopAs(cookie)).status).toBe(200);
  });

  test('an Admin signed in as a member still writes as that member', async () => {
    const cookie = merge(devCookie, await startAs(devCookie, member));
    expect((await deleteJob(new Request(`${ORIGIN}/api/jobs/x`, { method: 'DELETE', headers: { cookie } }), { params: Promise.resolve({ id: 'x' }) })).status).toBe(404);
  });

  test('signing out of an impersonation is audited as its stop, with the real Admin as actor', async () => {
    const cookie = merge(devCookie, await startAs(devCookie, member));
    const before = (await audits('user.impersonate_stop')).length;
    expect((await authPost('/sign-out', cookie)).status).toBe(200);
    const rows = await audits('user.impersonate_stop');
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)).toMatchObject({ actor_id: dev, target: `user:${member}`, new_value: { signOut: true } });
    // A plain sign-out of a plain session is not a stop.
    await authPost('/sign-out', await signIn('plain@example.test'));
    expect(await audits('user.impersonate_stop')).toHaveLength(before + 1);
  });
});
