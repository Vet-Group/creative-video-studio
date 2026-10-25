// Integration test against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { APIError } from 'better-auth/api';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost:3400';

const { auth, pool } = await import('@/lib/auth');
const { GET, POST } = await import('./route');
const { PATCH } = await import('./[id]/route');

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
    const body = JSON.stringify({ email: 'new@example.test', name: 'New', password: PASSWORD, teamId: 'team-unassigned' });
    const res = await POST(req(adminCookie, { method: 'POST', body }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ email: 'new@example.test', role: 'member', teamId: 'team-unassigned' });
    expect(await signIn('new@example.test')).toContain('better-auth.session_token');
  });

  test('creates users with a verified email, which better-auth needs before it links a social sign-in', async () => {
    const body = JSON.stringify({ email: 'verified@example.test', name: 'Verified', teamId: 'team-unassigned' });
    expect((await POST(req(adminCookie, { method: 'POST', body }))).status).toBe(201);
    expect((await pool.query(`select email_verified from users where email = 'verified@example.test'`)).rows[0].email_verified).toBe(true);
  });

  test('lets an Admin create a user without a password, who then cannot sign in by email', async () => {
    const body = JSON.stringify({ email: 'lark-only@example.test', name: 'Lark Only', teamId: 'team-unassigned' });
    const res = await POST(req(adminCookie, { method: 'POST', body }));
    expect(res.status).toBe(201);
    const signIn = await auth.api.signInEmail({ body: { email: 'lark-only@example.test', password: PASSWORD }, asResponse: true });
    expect(signIn.status).toBe(401);
  });

  test('rejects a password that is not a string', async () => {
    const body = JSON.stringify({ email: 'y@example.test', name: 'Y', password: 12345678, teamId: 'team-unassigned' });
    expect((await POST(req(adminCookie, { method: 'POST', body }))).status).toBe(400);
  });

  test('rejects a bad role', async () => {
    const body = JSON.stringify({ email: 'x@example.test', name: 'X', password: PASSWORD, role: 'owner', teamId: 'team-unassigned' });
    expect((await POST(req(adminCookie, { method: 'POST', body }))).status).toBe(400);
  });

  test('requires a team: without teamId, or with an unknown or hidden team, it answers 400 and creates nobody', async () => {
    await pool.query(`insert into teams (id, name, hidden) values ('team-b', 'Team B', false), ('team-old', 'Old team', true)`);
    for (const teamId of [undefined, 'no-such-team', 'team-old']) {
      const body = JSON.stringify({ email: 'noteam@example.test', name: 'No Team', password: PASSWORD, teamId });
      expect((await POST(req(adminCookie, { method: 'POST', body }))).status).toBe(400);
    }
    expect((await pool.query(`select 1 from users where email = 'noteam@example.test'`)).rowCount).toBe(0);
  });

  test('puts a new user in the given team and lists the team', async () => {
    const body = JSON.stringify({ email: 'teamed@example.test', name: 'Teamed', teamId: 'team-b' });
    expect((await POST(req(adminCookie, { method: 'POST', body }))).status).toBe(201);
    expect((await pool.query(`select team_id from users where email = 'teamed@example.test'`)).rows[0].team_id).toBe('team-b');
    const { users } = (await (await GET(req(adminCookie))).json()) as { users: { email: string; teamId: string }[] };
    expect(users.find((u) => u.email === 'teamed@example.test')?.teamId).toBe('team-b');
  });
});

describe('PATCH /api/admin/users/:id', () => {
  const patch = (cookie: string | undefined, id: string, body: unknown) => PATCH(req(cookie, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
  const audits = async (id: string) => (await pool.query('select actor_id, action, old_value, new_value from audit_entries where target = $1 order by id', [`user:${id}`])).rows;
  let seq = 0;
  async function member(teamId = 'team-unassigned') {
    const email = `patch-${++seq}@example.test`;
    const { user } = await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role: 'member', data: { teamId } } });
    return { id: user.id, email };
  }
  const adminId = async () => (await pool.query(`select id from users where email = 'admin@example.test'`)).rows[0].id as string;

  test('refuses a Member and a request without a session', async () => {
    const m = await member();
    expect((await patch(memberCookie, m.id, { role: 'admin' })).status).toBe(403);
    expect((await patch(undefined, m.id, { role: 'admin' })).status).toBe(401);
    expect(await audits(m.id)).toEqual([]);
  });

  test('bans a user, who can no longer sign in, and unbans them, each audited once', async () => {
    const m = await member();
    const admin = await adminId();
    expect((await patch(adminCookie, m.id, { banned: true, banReason: 'left the company' })).status).toBe(200);
    expect((await pool.query('select banned from users where id = $1', [m.id])).rows[0].banned).toBe(true);
    expect((await auth.api.signInEmail({ body: { email: m.email, password: PASSWORD }, asResponse: true })).status).toBe(403);
    expect((await patch(adminCookie, m.id, { banned: true })).status).toBe(200); // already banned: nothing to audit
    expect(await audits(m.id)).toEqual([
      { actor_id: admin, action: 'user.ban', old_value: { banned: false }, new_value: { banned: true, reason: 'left the company' } },
    ]);

    expect((await patch(adminCookie, m.id, { banned: false })).status).toBe(200);
    expect(await signIn(m.email)).toContain('better-auth.session_token');
    expect((await audits(m.id)).slice(1)).toEqual([{ actor_id: admin, action: 'user.unban', old_value: { banned: true }, new_value: { banned: false } }]);
  });

  test('changes the name and the email, lowercased and kept verified, audited once with the old and new values', async () => {
    const m = await member();
    const other = await member();
    expect((await patch(adminCookie, m.id, { email: 'not an email' })).status).toBe(400);
    expect((await patch(adminCookie, m.id, { name: '   ' })).status).toBe(400);
    expect((await patch(adminCookie, m.id, { email: other.email.toUpperCase() })).status).toBe(409);
    const res = await patch(adminCookie, m.id, { name: ' Nhân viên A ', email: ' New.Address@Example.test ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'Nhân viên A', email: 'new.address@example.test' });
    expect((await pool.query('select email_verified from users where id = $1', [m.id])).rows[0].email_verified).toBe(true);
    expect(await signIn('new.address@example.test')).toContain('better-auth.session_token');
    expect((await patch(adminCookie, m.id, { name: 'Nhân viên A' })).status).toBe(200); // unchanged: nothing to audit
    expect(await audits(m.id)).toEqual([
      { actor_id: await adminId(), action: 'user.update', old_value: { name: m.email, email: m.email }, new_value: { name: 'Nhân viên A', email: 'new.address@example.test' } },
    ]);
  });

  test('refuses to ban yourself or change your own role', async () => {
    const admin = await adminId();
    expect((await patch(adminCookie, admin, { banned: true })).status).toBe(400);
    expect((await patch(adminCookie, admin, { role: 'member' })).status).toBe(400);
    expect(await audits(admin)).toEqual([]);
  });

  test('sets a temporary password that replaces the old one, audits it once and never stores it', async () => {
    const m = await member();
    expect((await patch(adminCookie, m.id, { temporaryPassword: 'short' })).status).toBe(400); // better-auth minimum length
    expect((await patch(adminCookie, m.id, { temporaryPassword: 'temporary-pass-1' })).status).toBe(200);
    expect((await auth.api.signInEmail({ body: { email: m.email, password: PASSWORD }, asResponse: true })).status).toBe(401);
    expect((await auth.api.signInEmail({ body: { email: m.email, password: 'temporary-pass-1' }, asResponse: true })).status).toBe(200);
    const log = await audits(m.id);
    expect(log).toEqual([{ actor_id: await adminId(), action: 'user.password_set', old_value: null, new_value: { temporary: true } }]);
  });

  test('bans a user without a password and gives them a temporary one in the same request', async () => {
    const { user } = await auth.api.createUser({ body: { email: 'social-only@example.test', name: 'Social', role: 'member' } });
    expect((await patch(adminCookie, user.id, { banned: true, temporaryPassword: 'temporary-pass-4' })).status).toBe(200);
    const { rows } = await pool.query('select provider_id from accounts where user_id = $1', [user.id]);
    expect(rows).toEqual([{ provider_id: 'credential' }]);
    expect((await audits(user.id)).map((a) => a.action)).toEqual(['user.ban', 'user.password_set']);
  });

  test('changes the role, audited once with the old and new role, and refuses a bad role or an unknown user', async () => {
    const m = await member();
    expect((await patch(adminCookie, m.id, { role: 'owner' })).status).toBe(400);
    expect((await patch(adminCookie, m.id, {})).status).toBe(400);
    expect((await patch(adminCookie, 'no-such-user', { role: 'admin' })).status).toBe(404);
    const res = await patch(adminCookie, m.id, { role: 'admin' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: m.id, role: 'admin' });
    expect((await pool.query('select role from users where id = $1', [m.id])).rows[0].role).toBe('admin');
    expect(await audits(m.id)).toEqual([{ actor_id: await adminId(), action: 'user.role_change', old_value: { role: 'member' }, new_value: { role: 'admin' } }]);
  });

  test('checks every field before writing anything: a good role with a bad password changes nothing and audits nothing', async () => {
    const m = await member();
    for (const body of [
      { role: 'admin', temporaryPassword: 'short' },
      { role: 'admin', temporaryPassword: 'x'.repeat(129) },
      { banned: true, temporaryPassword: 12345678 },
      { role: 'admin', banned: 'yes' },
      { role: 'admin', banReason: 5 },
      { role: 'admin', teamId: 'no-such-team' },
    ]) {
      expect((await patch(adminCookie, m.id, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await pool.query('select role, banned, team_id from users where id = $1', [m.id])).rows[0]).toEqual({ role: 'member', banned: false, team_id: 'team-unassigned' });
    expect(await audits(m.id)).toEqual([]);
    expect(await signIn(m.email)).toContain('better-auth.session_token');
  });

  test('audits a change only if better-auth made it: a refusal or a crash leaves the user and the log as they were', async () => {
    const m = await member();
    const state = async () => (await pool.query('select role, banned from users where id = $1', [m.id])).rows[0];
    const refusal = new APIError('BAD_REQUEST', { message: 'refused' });
    const cases: [string, () => Promise<Response>, keyof typeof auth.api][] = [
      ['role', () => patch(adminCookie, m.id, { role: 'admin' }), 'setRole'],
      ['ban', () => patch(adminCookie, m.id, { banned: true }), 'banUser'],
      ['password', () => patch(adminCookie, m.id, { temporaryPassword: 'temporary-pass-2' }), 'setUserPassword'],
    ];
    for (const [name, run, method] of cases) {
      const spy = vi.spyOn(auth.api, method as 'setRole').mockRejectedValueOnce(refusal);
      expect((await run()).status, name).toBe(400);
      spy.mockRejectedValueOnce(new Error('connection lost'));
      await expect(run(), name).rejects.toThrow('connection lost');
      spy.mockRestore();
      expect(await state(), name).toEqual({ role: 'member', banned: false });
      expect(await audits(m.id), name).toEqual([]);
    }
    expect((await auth.api.signInEmail({ body: { email: m.email, password: PASSWORD }, asResponse: true })).status).toBe(200);
  });

  test('makes no change when its audit row cannot be written', async () => {
    const m = await member();
    await pool.query(`create function refuse_audit() returns trigger language plpgsql as $$ begin raise exception 'audit refused'; end $$`);
    await pool.query(`create trigger refuse_audit before insert on audit_entries for each row execute function refuse_audit()`);
    try {
      await expect(patch(adminCookie, m.id, { role: 'admin' })).rejects.toThrow('audit refused');
      await expect(patch(adminCookie, m.id, { banned: true })).rejects.toThrow('audit refused');
      await expect(patch(adminCookie, m.id, { temporaryPassword: 'temporary-pass-3' })).rejects.toThrow('audit refused');
    } finally {
      await pool.query('drop trigger refuse_audit on audit_entries');
      await pool.query('drop function refuse_audit()');
    }
    expect((await pool.query('select role, banned from users where id = $1', [m.id])).rows[0]).toEqual({ role: 'member', banned: false });
    expect((await auth.api.signInEmail({ body: { email: m.email, password: PASSWORD }, asResponse: true })).status).toBe(200);
    expect(await audits(m.id)).toEqual([]);
  });

  test('keeps the audit of an earlier change when a later one in the same request fails', async () => {
    const m = await member();
    const spy = vi.spyOn(auth.api, 'banUser').mockRejectedValueOnce(new APIError('BAD_REQUEST', { message: 'refused' }));
    expect((await patch(adminCookie, m.id, { role: 'admin', banned: true })).status).toBe(400);
    spy.mockRestore();
    expect((await audits(m.id)).map((a) => a.action)).toEqual(['user.role_change']);
    expect((await pool.query('select role, banned from users where id = $1', [m.id])).rows[0]).toEqual({ role: 'admin', banned: false });
  });

  test('changes the team for new jobs only: an earlier job and its ledger row keep the old team, and the change is audited once', async () => {
    await pool.query(
      `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
       values ('fal-test', 'fal', 'x', 'Fal test', '{9:16}', '{5}', 2, '720p', 0.2, '{}', true) on conflict do nothing`,
    );
    const m = await member('team-b');
    const job = async (id: string) => {
      await pool.query(
        `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids) select $1, $2, team_id, 'fal-test', 'fal', 'p', '9:16', 5, '{}' from users where id = $2`,
        [id, m.id],
      );
      await pool.query(`insert into cost_entries (kind, usd, month, day, user_id, team_id, job_id) select 'estimate', 1, '2026-10', '2026-10-23', user_id, team_id, id from jobs where id = $1`, [id]);
    };
    await job('team-job-before');
    expect((await patch(adminCookie, m.id, { teamId: 'team-old' })).status).toBe(400); // hidden
    expect((await patch(adminCookie, m.id, { teamId: 'no-such-team' })).status).toBe(400);
    const res = await patch(adminCookie, m.id, { teamId: 'team-unassigned' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: m.id, teamId: 'team-unassigned' });
    await job('team-job-after');
    const teamOf = async (id: string) => (await pool.query(`select team_id from jobs where id = $1 union all select team_id from cost_entries where job_id = $1`, [id])).rows.map((r) => r.team_id);
    expect(await teamOf('team-job-before')).toEqual(['team-b', 'team-b']);
    expect(await teamOf('team-job-after')).toEqual(['team-unassigned', 'team-unassigned']);
    expect(await audits(m.id)).toEqual([
      { actor_id: await adminId(), action: 'user.team_change', old_value: { teamId: 'team-b' }, new_value: { teamId: 'team-unassigned' } },
    ]);
    expect((await patch(adminCookie, m.id, { teamId: 'team-unassigned' })).status).toBe(200); // same team: no second entry
    expect(await audits(m.id)).toHaveLength(1);
  });
});

test('public sign-up is disabled', async () => {
  await expect(auth.api.signUpEmail({ body: { email: 'self@example.test', name: 'Self', password: PASSWORD } })).rejects.toThrow();
});
