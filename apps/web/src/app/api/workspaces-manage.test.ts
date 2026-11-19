// Workspaces, phase 3 (docs/WORKSPACES.md): the Admin's Workspaces routes, the owner's member routes and the switch cookie, against the real better-auth
// handler and a disposable database on the compose Postgres. Who may do what: an Admin (any workspace), the owner of the active partner workspace, a
// plain member of it, the owner of another workspace, and a company member.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const ORIGIN = 'http://localhost';
const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = ORIGIN;
delete process.env.CVS_COMPANY_EMAIL_DOMAINS;

const { auth, pool } = await import('@/lib/auth');
const { onCompanyDomain } = await import('@/lib/workspaces');
const adminList = await import('./admin/workspaces/route');
const one = await import('./workspaces/[id]/route');
const members = await import('./workspaces/[id]/members/route');
const member = await import('./workspaces/[id]/members/[userId]/route');
const switcher = await import('./me/workspace/route');

const PASSWORD = 'correct-horse-battery';
afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

async function user(email: string, role: 'member' | 'admin' = 'member') {
  return (await auth.api.createUser({ body: { email, name: email.split('@')[0]!, role, password: PASSWORD, data: { emailVerified: true } } })).user.id;
}
async function signIn(email: string, password = PASSWORD) {
  const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const join = (ws: string, userId: string, role = 'member') => pool.query('insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3) on conflict do nothing', [ws, userId, role]);
const leave = (ws: string, userId: string) => pool.query('delete from workspace_members where workspace_id = $1 and user_id = $2', [ws, userId]);
const roleIn = async (ws: string, userId: string) => (await pool.query('select role from workspace_members where workspace_id = $1 and user_id = $2', [ws, userId])).rows[0]?.role ?? null;

const req = (cookie: string, method = 'GET', body?: unknown, ws?: string) =>
  new Request(`${ORIGIN}/api/x`, {
    method,
    headers: { cookie: ws ? `${cookie}; cvs_ws=${ws}` : cookie, origin: ORIGIN, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const ctx = (id: string, userId?: string) => ({ params: Promise.resolve({ id, userId: userId ?? '' }) });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });
const listOf = async (cookie: string, ws: string) => json(await members.GET(req(cookie), ctx(ws)));
const add = async (cookie: string, ws: string, body: Record<string, unknown>) => json(await members.POST(req(cookie, 'POST', body), ctx(ws)));
const setRole = async (cookie: string, ws: string, userId: string, role: string) => json(await member.PATCH(req(cookie, 'PATCH', { role }), ctx(ws, userId)));
const remove = async (cookie: string, ws: string, userId: string) => json(await member.DELETE(req(cookie, 'DELETE'), ctx(ws, userId)));
const patch = async (cookie: string, ws: string, body: Record<string, unknown>, active?: string) => json(await one.PATCH(req(cookie, 'PATCH', body, active), ctx(ws)));

let admin: string, owner: string, plain: string, other: string, company: string, staff: string, dual: string;
const cookies: Record<string, string> = {};

beforeAll(async () => {
  await pool.query(`insert into workspaces (id, name) values ('ws_p', 'Partner P'), ('ws_q', 'Partner Q')`);
  admin = await user('admin@example.test', 'admin');
  owner = await user('owner@example.test');
  plain = await user('plain@example.test');
  other = await user('other@example.test');
  company = await user('company@example.test');
  staff = await user('staff@example.test');
  dual = await user('dual@example.test');
  // The test database files every new user under ws_vet; from here users join only the workspaces a route or this setup puts them in.
  await pool.query('drop trigger test_company_member on users');
  for (const id of [owner, plain, other]) await leave('ws_vet', id);
  await join('ws_p', owner, 'owner');
  await join('ws_p', plain);
  await join('ws_q', other, 'owner');
  await join('ws_p', dual);
  for (const [k, email] of Object.entries({ admin: 'admin@example.test', owner: 'owner@example.test', plain: 'plain@example.test', other: 'other@example.test', company: 'company@example.test', dual: 'dual@example.test' })) {
    cookies[k] = await signIn(email);
  }
});

describe('who may manage a workspace', () => {
  test('its owner and an Admin list its members; a plain member is refused, another workspace and the company answer 404', async () => {
    const own = await listOf(cookies.owner!, 'ws_p');
    expect(own.status).toBe(200);
    // Only this workspace's members: dual is also in ws_vet, which nothing here says.
    expect((own.body.members as { id: string; role: string }[]).map((m) => [m.id, m.role]).sort()).toEqual([[dual, 'member'], [owner, 'owner'], [plain, 'member']].sort());
    expect(JSON.stringify(own.body)).not.toContain('ws_vet');
    expect((await listOf(cookies.admin!, 'ws_p')).status).toBe(200);
    expect(await listOf(cookies.plain!, 'ws_p')).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(await listOf(cookies.other!, 'ws_p')).toEqual({ status: 404, body: { error: 'not found' } });
    expect(await listOf(cookies.company!, 'ws_p')).toEqual({ status: 404, body: { error: 'not found' } });
    expect((await listOf(cookies.admin!, 'ws_none')).status).toBe(404);
  });

  test("the owner of another workspace cannot list, add, re-role or remove this one's members", async () => {
    expect((await add(cookies.other!, 'ws_p', { email: 'staff@example.test' })).status).toBe(404);
    expect((await setRole(cookies.other!, 'ws_p', plain, 'owner')).status).toBe(404);
    expect((await remove(cookies.other!, 'ws_p', plain)).status).toBe(404);
    expect((await patch(cookies.other!, 'ws_p', { name: 'Taken over' })).status).toBe(404);
    expect(await roleIn('ws_p', plain)).toBe('member');
  });

  test("the company workspace has no owner path: a non-Admin owner of ws_vet is refused, its staff stay on Admin > Users", async () => {
    await pool.query(`update workspace_members set role = 'owner' where workspace_id = 'ws_vet' and user_id = $1`, [company]);
    try {
      expect((await listOf(cookies.company!, 'ws_vet')).status).toBe(403);
      expect((await add(cookies.company!, 'ws_vet', { email: 'dual@example.test' })).status).toBe(403);
    } finally {
      await pool.query(`update workspace_members set role = 'member' where workspace_id = 'ws_vet' and user_id = $1`, [company]);
    }
  });

  test('an owner acts on the workspace the request resolves to: with ws_q active, a ws_p owner is outside ws_p', async () => {
    await join('ws_q', owner);
    try {
      const res = await members.GET(req(cookies.owner!, 'GET', undefined, 'ws_q'), ctx('ws_p'));
      expect(res.status).toBe(404);
    } finally {
      await leave('ws_q', owner);
    }
  });
});

describe('members', () => {
  test('an owner adds an existing user by email, once; an unknown email and a role beyond owner or member are refused', async () => {
    expect(await add(cookies.owner!, 'ws_p', { email: ' Staff@Example.test ' })).toEqual({ status: 201, body: { id: staff } });
    expect(await roleIn('ws_p', staff)).toBe('member');
    expect(await roleIn('ws_vet', staff)).toBe('member'); // their company membership is untouched
    expect(await add(cookies.owner!, 'ws_p', { email: 'staff@example.test' })).toEqual({ status: 409, body: { error: 'already_member' } });
    expect(await add(cookies.owner!, 'ws_p', { email: 'nobody@example.test' })).toEqual({ status: 404, body: { error: 'no_user' } });
    for (const role of ['admin', 'editor']) expect((await add(cookies.owner!, 'ws_p', { email: 'company@example.test', role })).status).toBe(400);
    expect(await roleIn('ws_p', company)).toBeNull();
    const audit = (await pool.query(`select actor_id, new_value from audit_entries where action = 'workspace.member_add' and target = 'workspace:ws_p'`)).rows;
    expect(audit).toEqual([{ actor_id: owner, new_value: { userId: staff, role: 'member' } }]);
  });

  test("an owner creates an account with a temporary password: unverified, marked as an owner's, refused on the company's domains", async () => {
    for (const email of ['new@vetgroup.net', 'New@Sales.VETGROUP.net']) expect(await add(cookies.owner!, 'ws_p', { email, name: 'Staff Lookalike' })).toEqual({ status: 403, body: { error: 'company_email' } });
    expect((await pool.query(`select 1 from users where email like '%vetgroup.net'`)).rowCount).toBe(0);
    expect(await add(cookies.owner!, 'ws_p', { email: 'plain@example.test', name: 'Again' })).toEqual({ status: 409, body: { error: 'email_taken' } });

    const made = await add(cookies.owner!, 'ws_p', { email: 'Seller@Partner.test', name: 'Seller', role: 'member' });
    expect(made.status).toBe(201);
    const { id, temporaryPassword } = made.body as { id: string; temporaryPassword: string };
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(16);
    const row = (await pool.query('select email, email_verified, must_change_password, role from users where id = $1', [id])).rows[0];
    expect(row).toEqual({ email: 'seller@partner.test', email_verified: false, must_change_password: true, role: 'member' });
    expect((await pool.query('select workspace_id, role, added_by from workspace_members where user_id = $1', [id])).rows).toEqual([{ workspace_id: 'ws_p', role: 'member', added_by: owner }]);
    const marker = (await pool.query(`select actor_id, new_value from audit_entries where action = 'workspace.account_create' and target = $1`, [`user:${id}`])).rows;
    expect(marker).toEqual([{ actor_id: owner, new_value: { workspaceId: 'ws_p', email: 'seller@partner.test', byOwner: true } }]);
    // The password works once, for the forced change only.
    const fresh = await signIn('seller@partner.test', temporaryPassword);
    expect(fresh).toContain('better-auth.session_token');
    expect(await listOf(fresh, 'ws_p')).toEqual({ status: 403, body: { error: 'password_change_required' } });
  });

  test('the domains come from CVS_COMPANY_EMAIL_DOMAINS when it is set', () => {
    expect([onCompanyDomain('a@vetgroup.net'), onCompanyDomain('a@vetgroup.net.evil.test'), onCompanyDomain('a@notvetgroup.net')]).toEqual([true, false, false]);
    process.env.CVS_COMPANY_EMAIL_DOMAINS = 'vet.example, Corp.Example';
    try {
      expect([onCompanyDomain('a@corp.example'), onCompanyDomain('a@x.vet.example'), onCompanyDomain('a@vetgroup.net')]).toEqual([true, true, false]);
    } finally {
      delete process.env.CVS_COMPANY_EMAIL_DOMAINS;
    }
  });

  test('the last owner can be neither demoted nor removed, by the owner or an Admin; with a second owner both work', async () => {
    expect(await setRole(cookies.owner!, 'ws_p', owner, 'member')).toEqual({ status: 409, body: { error: 'last_owner' } });
    expect(await remove(cookies.owner!, 'ws_p', owner)).toEqual({ status: 409, body: { error: 'last_owner' } });
    expect(await remove(cookies.admin!, 'ws_p', owner)).toEqual({ status: 409, body: { error: 'last_owner' } });
    expect(await setRole(cookies.owner!, 'ws_p', plain, 'superuser')).toEqual({ status: 400, body: { error: 'role must be owner or member' } });
    expect((await setRole(cookies.owner!, 'ws_p', plain, 'owner')).status).toBe(200);
    expect((await setRole(cookies.owner!, 'ws_p', owner, 'member')).status).toBe(200);
    expect(await roleIn('ws_p', owner)).toBe('member');
    // Now plain is the only owner, and owner a plain member who manages nothing.
    expect((await listOf(cookies.owner!, 'ws_p')).status).toBe(403);
    expect(await remove(cookies.plain!, 'ws_p', plain)).toEqual({ status: 409, body: { error: 'last_owner' } });
    expect((await setRole(cookies.admin!, 'ws_p', owner, 'owner')).status).toBe(200);
    expect((await remove(cookies.owner!, 'ws_p', staff)).status).toBe(200);
    expect(await roleIn('ws_p', staff)).toBeNull();
    expect((await remove(cookies.owner!, 'ws_p', staff)).status).toBe(404);
    const actions = (await pool.query(`select action from audit_entries where target = 'workspace:ws_p' and action <> 'workspace.member_add' order by id`)).rows.map((r) => r.action);
    expect(actions).toEqual(['workspace.member_role', 'workspace.member_role', 'workspace.member_role', 'workspace.member_remove']);
  });
});

describe('the Admin Workspaces page', () => {
  test('lists every workspace, the company first, with owners, member count and this month\'s jobs and cost; a member is refused', async () => {
    const model = (await pool.query('select id from model_configs order by id limit 1')).rows[0].id as string;
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, feature, status, workspace_id)
       values ('wsm-job', $1, 'team-unassigned', $2, 'mock', 'p', '9:16', 5, '{}', 'video', 'succeeded', 'ws_p'),
              ('wsm-old', $1, 'team-unassigned', $2, 'mock', 'p', '9:16', 5, '{}', 'video', 'succeeded', 'ws_p')`,
      [owner, model],
    );
    await pool.query(`update jobs set created_at = '2020-01-01' where id = 'wsm-old'`);
    await pool.query(
      `insert into cost_entries (kind, usd, month, day, user_id, team_id, job_id, is_final, workspace_id)
       values ('estimate', 1.2500, to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM'), current_date, $1, 'team-unassigned', 'wsm-job', false, 'ws_p'),
              ('estimate', 9.0000, '2020-01', '2020-01-01', $1, 'team-unassigned', 'wsm-old', false, 'ws_p')`,
      [owner],
    );
    const res = await json(await adminList.GET(req(cookies.admin!)));
    expect(res.status).toBe(200);
    const list = res.body.workspaces as { id: string; owners: { id: string }[]; members: number; jobsThisMonth: number; costThisMonthUsd: string; disabled: boolean }[];
    expect(list[0]!.id).toBe('ws_vet');
    const p = list.find((w) => w.id === 'ws_p')!;
    expect({ owners: p.owners.map((o) => o.id).sort(), members: p.members, jobs: p.jobsThisMonth, cost: p.costThisMonthUsd, disabled: p.disabled }).toEqual({
      owners: [owner, plain].sort(), members: 4, jobs: 1, cost: '1.2500', disabled: false,
    });
    expect(JSON.stringify(res.body)).not.toContain('"p"'); // no prompt
    expect((await adminList.GET(req(cookies.owner!))).status).toBe(403);
  });

  test('creates a workspace with an existing owner, or with a new account whose temporary password comes back once; names are unique in any case', async () => {
    const made = await json(await adminList.POST(req(cookies.admin!, 'POST', { name: 'Partner R', ownerEmail: 'company@example.test' })));
    expect(made.status).toBe(201);
    const r = made.body.id as string;
    expect(r).toMatch(/^ws_/);
    expect(await roleIn(r, company)).toBe('owner');
    expect(await roleIn('ws_vet', company)).toBe('member');
    expect((await json(await adminList.POST(req(cookies.admin!, 'POST', { name: 'partner r', ownerEmail: 'company@example.test' })))).body).toEqual({ error: 'name_taken' });
    expect((await json(await adminList.POST(req(cookies.admin!, 'POST', { name: 'Partner S', ownerEmail: 'ghost@example.test' })))).body).toEqual({ error: 'no_user' });

    const fresh = await json(await adminList.POST(req(cookies.admin!, 'POST', { name: 'Partner S', ownerEmail: 'boss@partner-s.test', ownerName: 'Boss' })));
    expect(fresh.status).toBe(201);
    const { id: s, ownerId, temporaryPassword } = fresh.body as { id: string; ownerId: string; temporaryPassword: string };
    expect(await roleIn(s, ownerId)).toBe('owner');
    // An Admin's account counts as verified, as on Admin > Users, and is not an owner-made one.
    expect((await pool.query('select email_verified, must_change_password from users where id = $1', [ownerId])).rows[0]).toEqual({ email_verified: true, must_change_password: true });
    expect((await pool.query(`select new_value->>'byOwner' as by from audit_entries where action = 'workspace.account_create' and target = $1`, [`user:${ownerId}`])).rows).toEqual([{ by: 'false' }]);
    expect(await signIn('boss@partner-s.test', temporaryPassword)).toContain('better-auth.session_token');
    // A name already taken leaves no account behind.
    expect((await json(await adminList.POST(req(cookies.admin!, 'POST', { name: 'PARTNER S', ownerEmail: 'boss2@partner-s.test', ownerName: 'Boss 2' })))).body).toEqual({ error: 'name_taken' });
    expect((await pool.query(`select 1 from users where email = 'boss2@partner-s.test'`)).rowCount).toBe(0);
    expect((await adminList.POST(req(cookies.owner!, 'POST', { name: 'Mine', ownerEmail: 'owner@example.test' }))).status).toBe(403);
  });

  test('an Admin creates accounts in any workspace and manages it without being a member', async () => {
    const res = await add(cookies.admin!, 'ws_q', { email: 'helper@partner-q.test', name: 'Helper', role: 'owner' });
    expect(res.status).toBe(201);
    expect(await roleIn('ws_q', res.body.id as string)).toBe('owner');
    expect(await roleIn('ws_q', admin)).toBeNull();
    // An Admin is held to the owner's rule only on the company domains it does not have: an Admin may create a staff account in a partner workspace.
    expect((await add(cookies.admin!, 'ws_q', { email: 'helper@vetgroup.net', name: 'Staff' })).status).toBe(201);
  });
});

describe('rename and disable', () => {
  test('the owner renames their workspace; a name in use is refused; only an Admin disables, and never the company workspace', async () => {
    expect(await patch(cookies.owner!, 'ws_p', { name: '  Partner P Shop ' })).toEqual({ status: 200, body: { ok: true } });
    expect((await pool.query(`select name from workspaces where id = 'ws_p'`)).rows[0].name).toBe('Partner P Shop');
    expect(await patch(cookies.owner!, 'ws_p', { name: 'partner q' })).toEqual({ status: 409, body: { error: 'name_taken' } });
    expect(await patch(cookies.owner!, 'ws_p', { disabled: true })).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(await patch(cookies.dual!, 'ws_p', { name: 'Mine' }, 'ws_p')).toEqual({ status: 403, body: { error: 'forbidden' } });
    for (const body of [{ name: 'Not the company' }, { disabled: true }]) expect((await patch(cookies.admin!, 'ws_vet', body)).status).toBe(403);
    expect((await pool.query(`select name, disabled_at from workspaces where id = 'ws_vet'`)).rows[0]).toEqual({ name: 'VET Group', disabled_at: null });
  });

  test("a disabled workspace keeps its rows; its members fall back to another membership or get no_workspace, and an Admin enables it again", async () => {
    expect((await patch(cookies.admin!, 'ws_p', { disabled: true })).status).toBe(200);
    expect((await pool.query(`select count(*)::int as n from workspace_members where workspace_id = 'ws_p'`)).rows[0].n).toBeGreaterThan(0);
    expect((await pool.query(`select 1 from jobs where id = 'wsm-job' and workspace_id = 'ws_p'`)).rowCount).toBe(1);
    // owner is in ws_p only: no workspace; dual falls back to ws_vet even with the cookie naming ws_p.
    expect(await listOf(cookies.owner!, 'ws_p')).toEqual({ status: 403, body: { error: 'no_workspace' } });
    expect((await switcher.POST(req(cookies.dual!, 'POST', { workspaceId: 'ws_p' }))).status).toBe(404);
    // The Admin still manages it.
    expect((await listOf(cookies.admin!, 'ws_p')).status).toBe(200);
    expect((await patch(cookies.admin!, 'ws_p', { disabled: false })).status).toBe(200);
    expect((await listOf(cookies.owner!, 'ws_p')).status).toBe(200);
    const actions = (await pool.query(`select action from audit_entries where target = 'workspace:ws_p' and action in ('workspace.disable', 'workspace.enable', 'workspace.rename') order by id`)).rows.map((r) => r.action);
    expect(actions).toEqual(['workspace.rename', 'workspace.disable', 'workspace.enable']);
  });
});

describe('the switch cookie', () => {
  test('is set only for an active workspace the caller is a member of', async () => {
    const ok = await switcher.POST(req(cookies.dual!, 'POST', { workspaceId: 'ws_p' }));
    expect(ok.status).toBe(200);
    expect(ok.headers.getSetCookie()).toEqual(['cvs_ws=ws_p; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax']);
    for (const workspaceId of ['ws_q', 'ws_unknown']) {
      const res = await switcher.POST(req(cookies.dual!, 'POST', { workspaceId }));
      expect(res.status).toBe(404);
      expect(res.headers.getSetCookie()).toEqual([]);
    }
    expect((await switcher.POST(req(cookies.dual!, 'POST', {}))).status).toBe(400);
  });

  test('a switch sent from a tab that rendered another workspace gets 409 workspace_changed', async () => {
    const stale = new Request(`${ORIGIN}/api/me/workspace`, {
      method: 'POST',
      headers: { cookie: `${cookies.dual!}; cvs_ws=ws_p`, origin: ORIGIN, 'content-type': 'application/json', 'x-cvs-workspace': 'ws_vet' },
      body: JSON.stringify({ workspaceId: 'ws_vet' }),
    });
    expect(await json(await switcher.POST(stale))).toEqual({ status: 409, body: { error: 'workspace_changed' } });
  });
});
