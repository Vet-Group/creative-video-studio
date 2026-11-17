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
const raters: string[] = [];
/** A rating by the `who`-th rater (0 is `member`). */
const rate = (who: number, team: string | null, score: number, comment: string | null, ago = '1 hour') =>
  pool.query(`insert into ratings (id, user_id, team_id, score, comment, created_at) values ($1, $2, $3, $4, $5, now() - $6::interval)`, [randomUUID(), raters[who], team, score, comment, ago]);
const report = async () => (await (await call(admin.cookie)).json()) as AdminRatings;

beforeAll(async () => {
  admin = await newUser('admin@example.test', 'admin');
  member = await newUser('member@example.test', 'member');
  raters.push(member.id);
  for (let i = 1; i <= 5; i++) raters.push((await auth.api.createUser({ body: { email: `rater${i}@example.test`, name: `rater${i}`, password: PASSWORD, role: 'member' } })).user.id);
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
    await rate(0, 'ra', 10, null);
    await rate(1, 'ra', 8, null); // 8 counts as high
    await rate(2, 'rb', 7, null);
    await rate(3, 'rb', 4, null);
    await rate(4, 'rb', 1, null, '29 days 23 hours');
    await rate(1, 'ra', 1, 'too old', '30 days 1 minute'); // outside the window
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

  test('counts each member once, by their newest rating in the window', async () => {
    await rate(0, 'ra', 2, null, '3 hours'); // older than member's 10
    await rate(3, 'rb', 9, null, '30 minutes'); // newer than rater 3's 4
    const r = await report();
    expect(r.count).toBe(5);
    expect(r.average).toBeCloseTo((10 + 8 + 7 + 9 + 1) / 5);
    expect(r.teams).toEqual([
      { team: 'Beta', average: (7 + 9 + 1) / 3, count: 3 },
      { team: 'Alpha', average: 9, count: 2 },
    ]);
  });

  test('names a rating with no team, and lists the 20 newest comments newest first with their score, team and time', async () => {
    await rate(5, null, 6, 'no team');
    for (let i = 1; i <= 22; i++) await rate(0, 'ra', 9, `comment ${i}`, `${i + 1} hours`); // older than member's 10, so only the comments show
    const r = await report();
    expect(r.teams.find((t) => t.team === 'Chưa có nhóm')).toEqual({ team: 'Chưa có nhóm', average: 6, count: 1 });
    expect(r.comments).toHaveLength(20);
    expect(r.comments[0]).toMatchObject({ score: 6, team: 'Chưa có nhóm', comment: 'no team' });
    expect(r.comments[1]).toMatchObject({ score: 9, team: 'Alpha', comment: 'comment 1' });
    expect(r.comments[19]!.comment).toBe('comment 19');
    expect(new Date(r.comments[1]!.createdAt).getTime()).toBeGreaterThan(new Date(r.comments[2]!.createdAt).getTime());
  });
});
