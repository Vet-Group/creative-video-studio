// Integration test of the preset picker API against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { GET } = await import('./route');
const { PATCH } = await import('../admin/presets/[id]/route');

const PASSWORD = 'correct-horse-battery';

async function newUser(email: string, role: 'member' | 'admin') {
  await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } });
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

const call = (cookie: string | undefined, path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

let adminCookie = '';
let memberCookie = '';

beforeAll(async () => {
  adminCookie = await newUser('admin@example.test', 'admin');
  memberCookie = await newUser('member@example.test', 'member');
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

const list = async (cookie = memberCookie) => ((await (await GET(call(cookie, '/api/presets'))).json()) as { presets: { id: string; label: string }[] }).presets;
const patch = (id: string, body: unknown) => PATCH(call(adminCookie, `/api/admin/presets/${id}`, 'PATCH', body), { params: Promise.resolve({ id }) });

describe('GET /api/presets', () => {
  test('answers 401 without a session', async () => {
    expect((await GET(call(undefined, '/api/presets'))).status).toBe(401);
  });

  test('lists the enabled presets in display order with only the id and the label', async () => {
    const all = (await pool.query('select id, label from presets order by sort_order, id')).rows;
    expect(all.length).toBeGreaterThan(1);
    const body = await (await GET(call(memberCookie, '/api/presets'))).json();
    expect(body).toEqual({ presets: all });
    expect(await list(adminCookie)).toEqual(all);
  });

  test('leaves out a disabled preset and shows an edited label and order', async () => {
    const [first, second, third] = await list();
    expect((await patch(first!.id, { enabled: false })).status).toBe(200);
    expect((await list()).map((p) => p.id)).not.toContain(first!.id);
    expect((await patch(second!.id, { label: 'Renamed preset' })).status).toBe(200);
    expect((await list())[0]).toEqual({ id: second!.id, label: 'Renamed preset' });
    expect((await patch(third!.id, { sortOrder: -5 })).status).toBe(200);
    expect((await list())[0]!.id).toBe(third!.id);
  });

  test('is empty when every preset is disabled', async () => {
    for (const p of await list()) expect((await patch(p.id, { enabled: false })).status).toBe(200);
    expect(await list()).toEqual([]);
  });
});
