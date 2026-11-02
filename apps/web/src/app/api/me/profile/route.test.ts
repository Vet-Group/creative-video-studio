// The caller's own name and avatar colour against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { PATCH } = await import('./route');

const password = randomBytes(12).toString('hex');
let id: string;
let cookie: string;

beforeAll(async () => {
  id = (await auth.api.createUser({ body: { email: 'me@example.test', name: 'Nguyễn An', password, role: 'member' } })).user.id;
  const res = await auth.api.signInEmail({ body: { email: 'me@example.test', password }, asResponse: true });
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

const patch = (body: unknown, c: string | null = cookie) =>
  PATCH(new Request('http://localhost/api/me/profile', { method: 'PATCH', headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: JSON.stringify(body) }));
const row = async () => (await pool.query('select name, avatar_color from users where id = $1', [id])).rows[0];
const audits = async () => (await pool.query(`select actor_id, action, old_value, new_value from audit_entries where target = $1 order by id`, [`user:${id}`])).rows;

describe('PATCH /api/me/profile', () => {
  test('401 without a session', async () => {
    expect((await patch({ name: 'X' }, null)).status).toBe(401);
  });

  test.each([
    [{}],
    [{ name: '' }],
    [{ name: '   ' }],
    [{ name: 'a'.repeat(61) }],
    [{ name: 'Tab\there' }],
    [{ name: 'Bell\u0007' }],
    [{ name: 42 }],
    [{ avatarColor: '#ff0000' }],
    [{ avatarColor: 'red' }],
    [{ avatarColor: '#B91C1C' }],
    [{ name: 'Ok', avatarColor: 7 }],
  ])('refuses %j with 400 and changes nothing', async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(await row()).toEqual({ name: 'Nguyễn An', avatar_color: null });
    expect(await audits()).toEqual([]);
  });

  test('saves a trimmed name and a palette colour, audited with the old and new values; null goes back to the automatic colour', async () => {
    const res = await patch({ name: '  Nguyễn Văn Ánh  ', avatarColor: '#0369a1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Nguyễn Văn Ánh', avatarColor: '#0369a1' });
    expect(await row()).toEqual({ name: 'Nguyễn Văn Ánh', avatar_color: '#0369a1' });
    expect(await audits()).toEqual([
      { actor_id: id, action: 'user.profile_update', old_value: { name: 'Nguyễn An', avatarColor: null }, new_value: { name: 'Nguyễn Văn Ánh', avatarColor: '#0369a1' } },
    ]);

    expect((await patch({ name: 'Nguyễn Văn Ánh' })).status).toBe(200); // no change, no audit row
    expect(await audits()).toHaveLength(1);

    expect(await (await patch({ avatarColor: null })).json()).toEqual({ name: 'Nguyễn Văn Ánh', avatarColor: null });
    expect((await audits()).at(-1)).toMatchObject({ old_value: { avatarColor: '#0369a1' }, new_value: { name: 'Nguyễn Văn Ánh', avatarColor: null } });
    expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.name).toBe('Nguyễn Văn Ánh'); // the layout reads it from here
  });

  test('403 while the user must replace a temporary password', async () => {
    await pool.query('update users set must_change_password = true where id = $1', [id]);
    const before = await row();
    const res = await patch({ name: 'Someone else' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'password_change_required' });
    expect(await row()).toEqual(before);
    await pool.query('update users set must_change_password = false where id = $1', [id]);
  });
});
