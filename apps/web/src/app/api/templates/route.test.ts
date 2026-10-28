// Integration test against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { GET: list, POST } = await import('./route');
const { GET: one, DELETE } = await import('./[id]/route');

const PASSWORD = 'correct-horse-battery';
let seq = 0;

async function newUser(role: 'member' | 'admin' = 'member') {
  const email = `t${++seq}@example.test`;
  const { user } = await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } });
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, $2, 'input', $1, 'own.png', 'image/png', 1)`, [`${user.id}-a`, user.id]);
  return { id: user.id, cookie, asset: `${user.id}-a` };
}
type User = Awaited<ReturnType<typeof newUser>>;

const req = (u: User, path: string, init: RequestInit = {}) => new Request(`http://localhost${path}`, { ...init, headers: { 'content-type': 'application/json', cookie: u.cookie } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const save = (u: User, body: Record<string, unknown>) => POST(req(u, '/api/templates', { method: 'POST', body: JSON.stringify(body) }));
const error = async (res: Response) => ((await res.json()) as { error: string }).error;
const tryOn = (u: User) => ({ feature: 'try_on', name: 'Red dress', data: { images: [u.asset], brief: 'red dress', garments: 1, ratio: '3:4', resolution: '2K', modelId: 'm1' } });

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

describe('/api/templates', () => {
  test('saves a form and gives it back to its owner in the shape the pages refill from', async () => {
    const u = await newUser();
    const res = await save(u, tryOn(u));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(await (await list(req(u, '/api/templates?feature=try_on'))).json()).toEqual({ templates: [{ id, name: 'Red dress', isCompany: false, mine: true }], canShare: false });
    expect(await (await one(req(u, `/api/templates/${id}`), ctx(id))).json()).toMatchObject({
      id, feature: 'try_on', images: [{ id: u.asset, filename: 'own.png' }], brief: 'red dress', garments: 1, ratio: '3:4', resolution: '2K', modelId: 'm1', prompt: null,
    });
    expect(await (await list(req(u, '/api/templates?feature=image'))).json()).toEqual({ templates: [], canShare: false });
  });

  test("hides another member's template, and lets only its owner delete it", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const { id } = (await (await save(a, tryOn(a))).json()) as { id: string };
    expect((await one(req(b, `/api/templates/${id}`), ctx(id))).status).toBe(404);
    expect(await (await list(req(b, '/api/templates?feature=try_on'))).json()).toEqual({ templates: [], canShare: false });
    expect((await DELETE(req(b, `/api/templates/${id}`, { method: 'DELETE' }), ctx(id))).status).toBe(404);
    expect((await DELETE(req(a, `/api/templates/${id}`, { method: 'DELETE' }), ctx(id))).status).toBe(204);
    expect((await one(req(a, `/api/templates/${id}`), ctx(id))).status).toBe(404);
  });

  test("refuses another member's photo, a bad name, an unknown field or feature, and sharing by a member", async () => {
    const [a, b] = [await newUser(), await newUser()];
    expect(await error(await save(a, { ...tryOn(a), data: { images: [b.asset] } }))).toBe('data.images may hold only your own uploads');
    expect(await error(await save(a, { ...tryOn(a), name: 'x'.repeat(61) }))).toBe('name must have 1 to 60 characters');
    expect(await error(await save(a, { ...tryOn(a), name: '   ' }))).toBe('name must have 1 to 60 characters');
    expect(await error(await save(a, { ...tryOn(a), data: { images: [], seed: 1 } }))).toBe('data.seed is not a template field');
    expect(await error(await save(a, { ...tryOn(a), data: { images: [], hook: 'nope' } }))).toBe('data.hook is not a hook');
    expect(await error(await save(a, { ...tryOn(a), feature: 'motion_control' }))).toBe('feature must be a page that takes templates');
    const shared = await save(a, { ...tryOn(a), isCompany: true });
    expect([shared.status, await error(shared)]).toEqual([403, 'only an Admin shares a template with the company']);
    expect((await pool.query('select count(*)::int as n from user_templates where user_id = $1', [a.id])).rows[0].n).toBe(0);
  });

  test('keeps at most 50 per member and refuses the 51st', async () => {
    const u = await newUser();
    for (let i = 0; i < 50; i++) expect((await save(u, { feature: 'image', name: `t${i}`, data: { images: [] } })).status).toBe(201);
    const res = await save(u, { feature: 'image', name: 't50', data: { images: [] } });
    expect([res.status, await error(res)]).toEqual([409, 'you can keep at most 50 templates; delete one first']);
  });

  test("shares an Admin's company template with everyone, without the Admin's photos, and only an Admin deletes it", async () => {
    const [admin, m] = [await newUser('admin'), await newUser()];
    const { id } = (await (await save(admin, { ...tryOn(admin), isCompany: true })).json()) as { id: string };
    expect(await (await list(req(m, '/api/templates?feature=try_on'))).json()).toEqual({ templates: [{ id, name: 'Red dress', isCompany: true, mine: false }], canShare: false });
    expect(((await (await list(req(admin, '/api/templates?feature=try_on'))).json()) as { canShare: boolean }).canShare).toBe(true);
    expect(await (await one(req(m, `/api/templates/${id}`), ctx(id))).json()).toMatchObject({ images: [], brief: 'red dress', garments: 1 });
    expect((await DELETE(req(m, `/api/templates/${id}`, { method: 'DELETE' }), ctx(id))).status).toBe(404);
    const other = await newUser('admin');
    expect((await DELETE(req(other, `/api/templates/${id}`, { method: 'DELETE' }), ctx(id))).status).toBe(204);
  });
});
