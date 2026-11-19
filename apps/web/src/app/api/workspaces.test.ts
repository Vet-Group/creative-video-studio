// Workspaces, phase 2 (docs/WORKSPACES.md §3): the resolver behind guard() and currentUser(), the per-tab write check, impersonation across workspaces
// and the account paths that add a membership, against the real better-auth handler and a disposable database on the compose Postgres.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const ORIGIN = 'http://localhost';
const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = ORIGIN;

const { auth, pool } = await import('@/lib/auth');
const { guard, isEditor, readSession, resolveWorkspace } = await import('@/lib/session');
const { POST: start } = await import('./admin/users/[id]/impersonate/route');
const { POST: createUser } = await import('./admin/users/route');
const { keptInputs } = await import('@cvs/db/assets');

const PASSWORD = 'correct-horse-battery';
afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

async function user(email: string, role: 'member' | 'admin' = 'member') {
  return (await auth.api.createUser({ body: { email, name: email, role, password: PASSWORD, data: { emailVerified: true } } })).user.id;
}
async function signIn(email: string) {
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const member = (workspaceId: string, userId: string, role = 'member') =>
  pool.query('insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3) on conflict do nothing', [workspaceId, userId, role]);
const leave = (workspaceId: string, userId: string) => pool.query('delete from workspace_members where workspace_id = $1 and user_id = $2', [workspaceId, userId]);
const req = (cookie: string, { method = 'GET', ws, header }: { method?: string; ws?: string; header?: string } = {}) =>
  new Request(`${ORIGIN}/api/x`, { method, headers: { origin: ORIGIN, cookie: ws ? `${cookie}; cvs_ws=${ws}` : cookie, ...(header ? { 'x-cvs-workspace': header } : {}) } });
const resolved = async (r: Request, role: 'member' | 'editor' | 'admin' = 'member') => {
  const g = await guard(r, role);
  return g.error ? { status: g.error.status, error: ((await g.error.json()) as { error: string }).error } : { workspaceId: g.workspaceId, workspaceRole: g.workspaceRole };
};

let company: string, dual: string, partner: string, nobody: string, admin: string;
let companyCookie = '', dualCookie = '', partnerCookie = '', nobodyCookie = '', adminCookie = '';

beforeAll(async () => {
  await pool.query(`insert into workspaces (id, name) values ('ws_partner', 'Partner'), ('ws_off', 'Closed'), ('ws_third', 'Third')`);
  await pool.query(`update workspaces set disabled_at = now() where id = 'ws_off'`);
  company = await user('company@example.test');
  dual = await user('dual@example.test');
  partner = await user('partner@example.test');
  nobody = await user('nobody@example.test');
  admin = await user('admin@example.test', 'admin');
  await pool.query('update users set can_impersonate = true where id = $1', [admin]);
  // The test database files every new user under ws_vet (createTestDatabase); these two are moved as a partner owner would have them.
  await leave('ws_vet', partner);
  await member('ws_partner', partner, 'owner');
  await member('ws_partner', dual);
  await leave('ws_vet', nobody);
  [companyCookie, dualCookie, partnerCookie, nobodyCookie, adminCookie] = (await Promise.all(
    ['company', 'dual', 'partner', 'nobody', 'admin'].map((n) => signIn(`${n}@example.test`)),
  )) as [string, string, string, string, string];
});

describe('the resolver', () => {
  test('a company user acts in ws_vet, and a cvs_ws cookie naming a workspace they are not in is ignored', async () => {
    expect(await resolved(req(companyCookie))).toEqual({ workspaceId: 'ws_vet', workspaceRole: 'member' });
    expect(await resolved(req(companyCookie, { ws: 'ws_partner' }))).toEqual({ workspaceId: 'ws_vet', workspaceRole: 'member' });
    expect(await resolved(req(partnerCookie, { ws: 'ws_vet' }))).toEqual({ workspaceId: 'ws_partner', workspaceRole: 'owner' });
  });

  test('a user in two workspaces gets the oldest without a cookie and the one the cookie names', async () => {
    expect(await resolved(req(dualCookie))).toEqual({ workspaceId: 'ws_vet', workspaceRole: 'member' });
    expect(await resolved(req(dualCookie, { ws: 'ws_partner' }))).toEqual({ workspaceId: 'ws_partner', workspaceRole: 'member' });
    expect(await resolved(req(dualCookie, { ws: 'ws_unknown' }))).toEqual({ workspaceId: 'ws_vet', workspaceRole: 'member' });
    expect(await resolved(req(dualCookie, { ws: '%E0%A4%A' }))).toEqual({ workspaceId: 'ws_vet', workspaceRole: 'member' });
  });

  test('a disabled workspace counts as no membership: its cookie falls back, and a user in it alone gets 403 no_workspace', async () => {
    await member('ws_off', dual);
    expect(await resolved(req(dualCookie, { ws: 'ws_off' }))).toEqual({ workspaceId: 'ws_vet', workspaceRole: 'member' });
    await member('ws_off', nobody);
    expect(await resolved(req(nobodyCookie, { ws: 'ws_off' }))).toEqual({ status: 403, error: 'no_workspace' });
    expect((await readSession(req(nobodyCookie).headers))?.workspace).toBeNull();
  });

  test('a user with no membership gets 403 no_workspace from every role, and an unknown session stays 401', async () => {
    for (const role of ['member', 'editor', 'admin'] as const) expect(await resolved(req(nobodyCookie), role)).toEqual({ status: 403, error: 'no_workspace' });
    expect(await resolved(req(''))).toEqual({ status: 401, error: 'unauthenticated' });
  });

  test('the editor flag holds only in the company workspace', async () => {
    await pool.query('update users set can_edit_templates = true where id = $1', [dual]);
    const session = (await readSession(req(await signIn('dual@example.test')).headers))!;
    expect(isEditor(session.user, 'ws_vet')).toBe(true);
    expect(isEditor(session.user, 'ws_partner')).toBe(false);
    expect(await resolved(req(dualCookie, { ws: 'ws_partner' }), 'editor')).toEqual({ status: 403, error: 'forbidden' });
    expect(await resolved(req(dualCookie), 'editor')).toEqual({ workspaceId: 'ws_vet', workspaceRole: 'member' });
  });
});

describe('the per-tab check (x-cvs-workspace)', () => {
  test('a write rendered for another workspace than the resolved one gets 409 workspace_changed', async () => {
    expect(await resolved(req(dualCookie, { method: 'POST', ws: 'ws_partner', header: 'ws_vet' }))).toEqual({ status: 409, error: 'workspace_changed' });
    expect(await resolved(req(dualCookie, { method: 'DELETE', header: 'ws_partner' }))).toEqual({ status: 409, error: 'workspace_changed' });
  });

  test('the same workspace, no header (an old tab) or a read passes', async () => {
    expect(await resolved(req(dualCookie, { method: 'POST', ws: 'ws_partner', header: 'ws_partner' }))).toEqual({ workspaceId: 'ws_partner', workspaceRole: 'member' });
    expect(await resolved(req(dualCookie, { method: 'POST', ws: 'ws_partner' }))).toEqual({ workspaceId: 'ws_partner', workspaceRole: 'member' });
    expect(await resolved(req(dualCookie, { ws: 'ws_partner', header: 'ws_vet' }))).toEqual({ workspaceId: 'ws_partner', workspaceRole: 'member' });
  });
});

describe('impersonation', () => {
  const startAs = (cookie: string, id: string) =>
    start(new Request(`${ORIGIN}/api/admin/users/${id}/impersonate`, { method: 'POST', headers: { cookie, origin: ORIGIN } }), { params: Promise.resolve({ id }) });

  test('refuses a user who shares no active workspace with the Admin', async () => {
    const res = await startAs(adminCookie, partner);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('you share no workspace with this user');
    expect((await pool.query(`select 1 from audit_entries where action = 'user.impersonate_start'`)).rowCount).toBe(0);
  });

  test('acts only in a workspace both share, and ends when the Admin no longer shares one', async () => {
    const res = await startAs(adminCookie, dual);
    expect(res.status).toBe(200);
    // The browser's jar: what the response sets replaces what the Admin's request carried.
    const jar = new Map(adminCookie.split('; ').map((c) => [c.slice(0, c.indexOf('=')), c]));
    for (const c of res.headers.getSetCookie()) jar.set(c.slice(0, c.indexOf('=')), c.split(';')[0]!);
    const cookie = [...jar.values()].join('; ');
    // dual is also in ws_partner, which the Admin is not: the cookie cannot take the session there.
    expect(await resolved(req(cookie, { ws: 'ws_partner' }))).toEqual({ workspaceId: 'ws_vet', workspaceRole: 'member' });
    expect(await resolveWorkspace(dual, 'ws_partner', admin)).toEqual({ workspaceId: 'ws_vet', workspaceRole: 'member' });
    // The Admin joins ws_partner: the cookie may take the session there. Then the Admin leaves both: the session has ended.
    await member('ws_partner', admin);
    expect(await resolved(req(cookie, { ws: 'ws_partner' }))).toEqual({ workspaceId: 'ws_partner', workspaceRole: 'member' });
    await leave('ws_vet', admin);
    await leave('ws_partner', admin);
    expect(await readSession(req(cookie).headers)).toBeNull();
    expect(await resolved(req(cookie))).toEqual({ status: 401, error: 'unauthenticated' });
    await member('ws_vet', admin, 'owner');
  });
});

describe('accounts', () => {
  test('an Admin-created user joins ws_vet (an Admin as owner), even with the test trigger gone', async () => {
    await pool.query('drop trigger test_company_member on users');
    try {
      const make = async (email: string, role: string) => {
        const res = await createUser(
          new Request(`${ORIGIN}/api/admin/users`, {
            method: 'POST',
            headers: { cookie: adminCookie, origin: ORIGIN, 'content-type': 'application/json' },
            body: JSON.stringify({ email, name: email, teamId: 'team-unassigned', role }),
          }),
        );
        expect(res.status).toBe(201);
        return ((await res.json()) as { id: string }).id;
      };
      const [m, a] = [await make('made-member@example.test', 'member'), await make('made-admin@example.test', 'admin')];
      const rows = (await pool.query(`select user_id, workspace_id, role, added_by from workspace_members where user_id = any($1) order by role`, [[m, a]])).rows;
      expect(rows).toEqual([
        { user_id: m, workspace_id: 'ws_vet', role: 'member', added_by: admin },
        { user_id: a, workspace_id: 'ws_vet', role: 'owner', added_by: admin },
      ]);
    } finally {
      await pool.query('create trigger test_company_member after insert on users for each row execute function test_company_member()');
    }
  });
});

describe('dedupe', () => {
  test('keptInputs returns only the copy of the same workspace', async () => {
    await pool.query(
      `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, sha256, workspace_id)
       values ('dd-vet', $1, 'input', 'dd-vet', 'a.png', 'image/png', 1, $2, 'ws_vet')`,
      [dual, 'a'.repeat(64)],
    );
    expect([...(await keptInputs(pool, dual, 'ws_vet', ['a'.repeat(64)], null)).values()].map((k) => k.id)).toEqual(['dd-vet']);
    expect((await keptInputs(pool, dual, 'ws_partner', ['a'.repeat(64)], null)).size).toBe(0);
  });
});
