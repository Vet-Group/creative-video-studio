// Integration test of GET /api/admin/ratings against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes, randomUUID } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { AdminRatings } from '@/lib/rating';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { GET } = await import('./ratings/route');

const PASSWORD = 'correct-horse-battery';

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

async function newUser(email: string, role: 'member' | 'admin') {
  const id = (await auth.api.createUser({ body: { email, name: email, password: PASSWORD, role } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  return { id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}
const call = (cookie: string | undefined) => GET(new Request('http://localhost/api/admin/ratings', { headers: cookie ? { cookie } : {} }));

let admin: Awaited<ReturnType<typeof newUser>>;
let member: Awaited<ReturnType<typeof newUser>>;
const rate = (team: string | null, score: number, comment: string | null, ago = '1 hour') =>
  pool.query(`insert into ratings (id, user_id, team_id, score, comment, created_at) values ($1, $2, $3, $4, $5, now() - $6::interval)`, [randomUUID(), member.id, team, score, comment, ago]);
const report = async () => (await (await call(admin.cookie)).json()) as AdminRatings;

beforeAll(async () => {
  admin = await newUser('admin@example.test', 'admin');
  member = await newUser('member@example.test', 'member');
  await pool.query(`insert into teams (id, name) values ('ra', 'Alpha'), ('rb', 'Beta')`);
});

describe('GET /api/admin/ratings', () => {
  test('is for Admins only', async () => {
    expect((await call(undefined)).status).toBe(401);
    expect((await call(member.cookie)).status).toBe(403);
  });

  test('reports nothing yet as zero ratings with no average', async () => {
    expect(await report()).toEqual({ days: 30, count: 0, average: null, highShare: null, teams: [], comments: [] });
  });

  test('averages the last 30 days, with the share of 8 or more, per team and overall', async () => {
    await rate('ra', 10, null);
    await rate('ra', 8, null); // 8 counts as high
    await rate('rb', 7, null);
    await rate('rb', 4, null);
    await rate('rb', 1, null, '29 days 23 hours');
    await rate('ra', 1, 'too old', '30 days 1 minute'); // outside the window
    const r = await report();
    expect(r.count).toBe(5);
    expect(r.average).toBeCloseTo((10 + 8 + 7 + 4 + 1) / 5);
    expect(r.highShare).toBeCloseTo(2 / 5);
    expect(r.teams).toEqual([
      { team: 'Beta', average: 4, count: 3 },
      { team: 'Alpha', average: 9, count: 2 },
    ]);
    expect(r.comments).toEqual([]); // the old comment is outside the window, the rest have none
  });

  test('names a rating with no team, and lists the 20 newest comments newest first with their score, team and time', async () => {
    await rate(null, 6, 'no team');
    for (let i = 1; i <= 22; i++) await rate('ra', 9, `comment ${i}`, `${i + 1} hours`);
    const r = await report();
    expect(r.teams.find((t) => t.team === 'Chưa có nhóm')).toEqual({ team: 'Chưa có nhóm', average: 6, count: 1 });
    expect(r.comments).toHaveLength(20);
    expect(r.comments[0]).toMatchObject({ score: 6, team: 'Chưa có nhóm', comment: 'no team' });
    expect(r.comments[1]).toMatchObject({ score: 9, team: 'Alpha', comment: 'comment 1' });
    expect(r.comments[19]!.comment).toBe('comment 19');
    expect(new Date(r.comments[1]!.createdAt).getTime()).toBeGreaterThan(new Date(r.comments[2]!.createdAt).getTime());
  });
});
