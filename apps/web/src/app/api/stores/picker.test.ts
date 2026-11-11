// The store picker's data: how /api/stores orders a caller's stores (pinned or Admin-assigned first, then by recency), the pin toggle, and
// the Admin store-assignment endpoint — against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { GET: LIST } = await import('./route');
const { PUT: PIN } = await import('./[id]/pin/route');
const { GET: ASSIGNED, PUT: ASSIGN } = await import('../admin/users/[id]/stores/route');

const PASSWORD = 'correct-horse-battery';
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
let n = 0;
async function newUser(role: 'member' | 'admin' = 'member') {
  const email = `p${++n}@example.test`;
  const id = (await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}
type User = Awaited<ReturnType<typeof newUser>>;
const req = (u: User, path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { cookie: u.cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const list = async (u: User) => ((await (await LIST(req(u, '/api/stores'))).json()) as { stores: { id: string; mine: boolean; pinned: boolean; assigned: boolean }[] }).stores;
const pin = (u: User, id: string) => PIN(req(u, `/api/stores/${id}/pin`, 'PUT'), ctx(id));
const assignedOf = async (u: User, uid: string) => (await (await ASSIGNED(req(u, `/api/admin/users/${uid}/stores`), ctx(uid))).json()) as { storeIds: string[] };
const assign = (u: User, uid: string, storeIds: unknown) => ASSIGN(req(u, `/api/admin/users/${uid}/stores`, 'PUT', { storeIds }), ctx(uid));

let member: User;
let admin: User;

beforeAll(async () => {
  [member, admin] = [await newUser(), await newUser('admin')];
  await pool.query(
    `insert into stores (id, name, code, hidden) values
       ('s-a', 'A Shop', 'A', false), ('s-b', 'B Shop', 'B', false), ('s-c', 'C Shop', 'C', false), ('s-d', 'D Shop', 'D', false), ('s-hid', 'Hidden', 'H', true)`,
  );
});
afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

describe('GET /api/stores order and flags', () => {
  test('pinned or assigned stores lead, then by how recently the caller used them, then by name', async () => {
    // C pinned, D assigned (both "mine"); B used recently, A used long ago; the hidden store never appears.
    await pool.query(
      `insert into user_stores (user_id, store_id, pinned, assigned, last_used_at) values
         ($1, 's-c', true, false, null), ($1, 's-d', false, true, null), ($1, 's-b', false, false, now()), ($1, 's-a', false, false, now() - interval '1 day')`,
      [member.id],
    );
    const stores = await list(member);
    expect(stores.map((s) => s.id)).toEqual(['s-c', 's-d', 's-b', 's-a']);
    expect(stores.find((s) => s.id === 's-c')).toMatchObject({ mine: true, pinned: true, assigned: false });
    expect(stores.find((s) => s.id === 's-d')).toMatchObject({ mine: true, pinned: false, assigned: true });
    expect(stores.find((s) => s.id === 's-b')).toMatchObject({ mine: false });
    expect(stores.map((s) => s.id)).not.toContain('s-hid');
    // Another user with no relationships sees the plain name order.
    const other = await newUser();
    expect((await list(other)).map((s) => s.id)).toEqual(['s-a', 's-b', 's-c', 's-d']);
  });

  test('a pinned store leads an Admin-assigned one even when its name sorts later', async () => {
    const u = await newUser();
    await pool.query(`insert into user_stores (user_id, store_id, pinned, assigned) values ($1, 's-d', true, false), ($1, 's-c', false, true)`, [u.id]);
    expect((await list(u)).map((s) => s.id).slice(0, 2)).toEqual(['s-d', 's-c']); // pinned s-d before assigned s-c, despite C < D by name
  });
});

describe('PUT /api/stores/:id/pin', () => {
  test('a fresh user pins and unpins a store, and cannot pin a hidden or unknown one', async () => {
    const u = await newUser();
    expect(await (await pin(u, 's-a')).json()).toEqual({ pinned: true });
    expect((await list(u))[0]).toMatchObject({ id: 's-a', mine: true, pinned: true });
    expect(await (await pin(u, 's-a')).json()).toEqual({ pinned: false });
    expect((await list(u)).find((s) => s.id === 's-a')).toMatchObject({ mine: false, pinned: false });
    expect((await pool.query('select 1 from user_stores where user_id = $1 and store_id = $2', [u.id, 's-a'])).rowCount).toBe(0);
    expect((await pin(u, 's-hid')).status).toBe(404);
    expect((await pin(u, 'nope')).status).toBe(404);
  });

  test('unpinning keeps a store the Admin still assigns', async () => {
    const u = await newUser();
    await pool.query(`insert into user_stores (user_id, store_id, assigned) values ($1, 's-b', true)`, [u.id]);
    await pin(u, 's-b'); // pin
    await pin(u, 's-b'); // unpin
    expect((await list(u)).find((s) => s.id === 's-b')).toMatchObject({ mine: true, assigned: true, pinned: false });
  });
});

describe('Admin PUT/GET /api/admin/users/:id/stores', () => {
  test('an Admin sets, reads and replaces a user’s assigned stores, audited; a member is refused', async () => {
    const u = await newUser();
    expect(await assignedOf(admin, u.id)).toEqual({ storeIds: [] });
    expect((await assign(member, u.id, ['s-a'])).status).toBe(403);

    expect(await (await assign(admin, u.id, ['s-b', 's-a'])).json()).toEqual({ storeIds: ['s-a', 's-b'] });
    expect(await assignedOf(admin, u.id)).toEqual({ storeIds: ['s-a', 's-b'] });
    expect((await list(u)).filter((s) => s.assigned).map((s) => s.id).sort()).toEqual(['s-a', 's-b']);

    // Replacing the set unassigns the ones dropped and removes their now-empty rows.
    expect(await (await assign(admin, u.id, ['s-b'])).json()).toEqual({ storeIds: ['s-b'] });
    expect((await pool.query('select 1 from user_stores where user_id = $1 and store_id = $2', [u.id, 's-a'])).rowCount).toBe(0);

    const a = (await pool.query(`select action, old_value, new_value from audit_entries where target = $1 order by id`, [`user:${u.id}`])).rows;
    expect(a).toEqual([
      { action: 'user.stores', old_value: { storeIds: [] }, new_value: { storeIds: ['s-a', 's-b'] } },
      { action: 'user.stores', old_value: { storeIds: ['s-a', 's-b'] }, new_value: { storeIds: ['s-b'] } },
    ]);
  });

  test('refuses a hidden or unknown store (400) and an unknown user (404)', async () => {
    const u = await newUser();
    expect((await assign(admin, u.id, ['s-hid'])).status).toBe(400);
    expect((await assign(admin, u.id, ['nope'])).status).toBe(400);
    expect((await assign(admin, u.id, 'not-an-array')).status).toBe(400);
    expect((await assign(admin, 'no-such-user', ['s-a'])).status).toBe(404);
  });
});
