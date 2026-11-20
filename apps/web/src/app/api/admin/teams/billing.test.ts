// Admin setup of billing teams (docs/BILLING.md): a team's billing flag, free allowance and stores, and a store's team, validated and audited.
// Against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { GET: TEAMS } = await import('./route');
const { PATCH: PATCH_TEAM } = await import('./[id]/route');
const { GET: STORES } = await import('../stores/route');
const { PATCH: PATCH_STORE } = await import('../stores/[id]/route');

const PASSWORD = 'correct-horse-battery';
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
let seq = 0;
async function newUser(role: 'member' | 'admin') {
  const email = `t${++seq}@example.test`;
  const id = (await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}
type User = Awaited<ReturnType<typeof newUser>>;
const req = (u: User, path: string, method = 'GET', body?: unknown, cookie = '') =>
  new Request(`http://localhost${path}`, { method, headers: { cookie: `${u.cookie}${cookie}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const patchTeam = (u: User, id: string, body: unknown) => PATCH_TEAM(req(u, `/api/admin/teams/${id}`, 'PATCH', body), ctx(id));
const patchStore = (u: User, id: string, body: unknown, cookie = '') => PATCH_STORE(req(u, `/api/admin/stores/${id}`, 'PATCH', body, cookie), ctx(id));
const audits = async (target: string) => (await pool.query(`select action, old_value, new_value from audit_entries where target = $1 order by id`, [target])).rows;

let admin: User;
let member: User;

beforeAll(async () => {
  [admin, member] = [await newUser('admin'), await newUser('member')];
  await pool.query(`insert into teams (id, name) values ('sales-a', 'Sales A'), ('sales-b', 'Sales B')`);
  await pool.query(`insert into workspaces (id, name) values ('ws_partner', 'Partner')`);
  await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_partner', $1, 'owner')`, [admin.id]);
  await pool.query(
    `insert into stores (id, name, code, workspace_id) values ('st-1', 'One', 'S-1', 'ws_vet'), ('st-2', 'Two', 'S-2', 'ws_vet'), ('st-p', 'Partner shop', 'S-P', 'ws_partner')`,
  );
});
afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

describe('PATCH /api/admin/teams/:id billing', () => {
  test('makes a team a billing team with its allowance and stores, audited, and GET reads it back', async () => {
    const res = await patchTeam(admin, 'sales-a', { billable: true, freeMonthlyUsd: '25.5', storeIds: ['st-2', 'st-1'] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ billable: true, freeMonthlyUsd: '25.5000', storeIds: ['st-1', 'st-2'] });
    const got = (await (await TEAMS(req(admin, '/api/admin/teams'))).json()) as { teams: { id: string }[]; stores: { id: string; teamId: string | null }[] };
    expect(got.teams.find((t) => t.id === 'sales-a')).toMatchObject({ billable: true, freeMonthlyUsd: '25.5000', storeIds: ['st-1', 'st-2'] });
    expect(got.stores.map((s) => [s.id, s.teamId])).toEqual([['st-1', 'sales-a'], ['st-2', 'sales-a']]); // company stores only
    expect(await audits('team:sales-a')).toEqual([
      { action: 'team.billing', old_value: { billable: false, freeMonthlyUsd: '20.0000' }, new_value: { billable: true, freeMonthlyUsd: '25.5000' } },
      { action: 'team.stores', old_value: { storeIds: [] }, new_value: { storeIds: ['st-1', 'st-2'] } },
    ]);
  });

  test('a store given to another team leaves the first, and the move says where it came from; the same set again changes nothing', async () => {
    expect((await patchTeam(admin, 'sales-b', { storeIds: ['st-2'] })).status).toBe(200);
    expect((await pool.query(`select id, team_id from stores where workspace_id = 'ws_vet' order by id`)).rows).toEqual([{ id: 'st-1', team_id: 'sales-a' }, { id: 'st-2', team_id: 'sales-b' }]);
    expect((await audits('team:sales-b')).at(-1)).toEqual({ action: 'team.stores', old_value: { storeIds: [] }, new_value: { storeIds: ['st-2'], takenFrom: [{ storeId: 'st-2', teamId: 'sales-a' }] } });
    const before = (await audits('team:sales-b')).length;
    expect((await patchTeam(admin, 'sales-b', { storeIds: ['st-2'] })).status).toBe(200);
    expect(await audits('team:sales-b')).toHaveLength(before);
    expect((await patchTeam(admin, 'sales-b', { storeIds: [] })).status).toBe(200);
    expect((await pool.query(`select team_id from stores where id = 'st-2'`)).rows[0].team_id).toBeNull();
  });

  test.each([
    ['a negative allowance', { freeMonthlyUsd: -1 }],
    ['an allowance that is not a number', { freeMonthlyUsd: 'abc' }],
    ['an infinite allowance', { freeMonthlyUsd: 'Infinity' }],
    ['an allowance with 5 decimals', { freeMonthlyUsd: '1.00001' }],
    ['a null allowance', { freeMonthlyUsd: null }],
    ['a billing flag that is not a boolean', { billable: 'yes' }],
    ['stores that are not a list', { storeIds: 'st-1' }],
    ['the same store twice', { storeIds: ['st-1', 'st-1'] }],
  ])('refuses %s with 400 and changes nothing', async (_, body) => {
    const before = (await pool.query(`select billable, free_monthly_usd::text as free from teams where id = 'sales-a'`)).rows[0];
    expect((await patchTeam(admin, 'sales-a', body)).status).toBe(400);
    expect((await pool.query(`select billable, free_monthly_usd::text as free from teams where id = 'sales-a'`)).rows[0]).toEqual(before);
  });

  test('refuses a store of a partner workspace or an unknown store, an unknown team, and a member', async () => {
    for (const storeIds of [['st-p'], ['nope']]) expect((await patchTeam(admin, 'sales-a', { storeIds })).status).toBe(400);
    expect((await pool.query(`select team_id from stores where id = 'st-p'`)).rows[0].team_id).toBeNull();
    expect((await patchTeam(admin, 'no-team', { billable: true })).status).toBe(404);
    expect((await patchTeam(member, 'sales-a', { billable: false })).status).toBe(403);
  });
});

describe('PATCH /api/admin/stores/:id team', () => {
  test('gives a company store to a team or none, audited, and GET shows it with the teams to pick from', async () => {
    expect((await patchStore(admin, 'st-2', { teamId: 'sales-b' })).status).toBe(200);
    expect((await patchStore(admin, 'st-2', { teamId: null })).status).toBe(200);
    expect(await audits('store:st-2')).toEqual([
      { action: 'store.team', old_value: { teamId: null }, new_value: { teamId: 'sales-b' } },
      { action: 'store.team', old_value: { teamId: 'sales-b' }, new_value: { teamId: null } },
    ]);
    const got = (await (await STORES(req(admin, '/api/admin/stores'))).json()) as { stores: { id: string; teamId: string | null }[]; teams: { id: string }[] | null };
    expect(got.stores.find((s) => s.id === 'st-1')?.teamId).toBe('sales-a');
    expect(got.teams?.map((t) => t.id)).toEqual(expect.arrayContaining(['sales-a', 'sales-b']));
  });

  test('refuses an unknown team or one that is not a string, and a team for a partner workspace’s store', async () => {
    expect((await patchStore(admin, 'st-2', { teamId: 'nope' })).status).toBe(400);
    expect((await patchStore(admin, 'st-2', { teamId: 5 })).status).toBe(400);
    const partner = '; cvs_ws=ws_partner';
    expect((await patchStore(admin, 'st-p', { teamId: 'sales-a' }, partner)).status).toBe(400);
    expect((await pool.query(`select team_id from stores where id = 'st-p'`)).rows[0].team_id).toBeNull();
    const got = (await (await STORES(req(admin, '/api/admin/stores', 'GET', undefined, partner))).json()) as { teams: unknown };
    expect(got.teams).toBeNull();
  });
});
