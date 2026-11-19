// The satisfaction rating routes against the real handlers and a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes, randomUUID } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const rating = await import('./route');
const snooze = await import('./snooze/route');

const PASSWORD = 'correct-horse-battery';
let seq = 0;

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

async function user() {
  const email = `u${++seq}@example.test`;
  const id = (await auth.api.createUser({ body: { email, name: `Name ${seq}`, role: 'member', password: PASSWORD, data: { emailVerified: true } } })).user.id;
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { id, cookie };
}
const headers = (cookie: string) => ({ cookie, origin: 'http://localhost', 'content-type': 'application/json' });
const get = (cookie: string) => rating.GET(new Request('http://localhost/api/rating', { headers: headers(cookie) }));
const post = (cookie: string, body: unknown) => rating.POST(new Request('http://localhost/api/rating', { method: 'POST', headers: headers(cookie), body: JSON.stringify(body) }));
const postSnooze = (cookie: string) => snooze.POST(new Request('http://localhost/api/rating/snooze', { method: 'POST', headers: headers(cookie) }));
const due = async (cookie: string) => ((await (await get(cookie)).json()) as { due: boolean }).due;

/** `n` succeeded real jobs of the user; `set` is an SQL assignment applied to all of the user's jobs afterwards (to make them mock, deleted or failed). */
async function jobs(userId: string, n: number, set = '') {
  for (let i = 0; i < n; i++) {
    await pool.query(
      `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, feature, status, is_mock, workspace_id)
       values ($1, $2, 'team-unassigned', 'kling-o3-pro', 'fal', 'p', '9:16', 5, '{}', 'video', 'succeeded', false, 'ws_vet')`,
      [randomUUID(), userId],
    );
  }
  if (set) await pool.query(`update jobs set ${set} where user_id = $1`, [userId]);
}

describe('GET /api/rating', () => {
  test('refuses without a session', async () => {
    expect((await get('')).status).toBe(401);
  });

  test('is not due before 3 succeeded real jobs and is due from the third', async () => {
    const m = await user();
    expect(await due(m.cookie)).toBe(false);
    await jobs(m.id, 2);
    expect(await due(m.cookie)).toBe(false);
    await jobs(m.id, 1);
    expect(await due(m.cookie)).toBe(true);
  });

  test('does not count mock, deleted or unfinished jobs', async () => {
    const mock = await user();
    await jobs(mock.id, 3, 'is_mock = true');
    expect(await due(mock.cookie)).toBe(false);
    const deleted = await user();
    await jobs(deleted.id, 3, 'deleted_at = now()');
    expect(await due(deleted.cookie)).toBe(false);
    const failed = await user();
    await jobs(failed.id, 3, `status = 'failed'`);
    expect(await due(failed.cookie)).toBe(false);
  });

  test('is never due for a system account', async () => {
    const m = await user();
    await jobs(m.id, 3);
    await pool.query('update users set system = true where id = $1', [m.id]);
    expect(await due(m.cookie)).toBe(false);
  });

  test('stays quiet for 30 days after a rating, to the day', async () => {
    const m = await user();
    await jobs(m.id, 3);
    expect((await post(m.cookie, { score: 8 })).status).toBe(201);
    expect(await due(m.cookie)).toBe(false);
    await pool.query(`update ratings set created_at = now() - interval '29 days 23 hours' where user_id = $1`, [m.id]);
    expect(await due(m.cookie)).toBe(false);
    await pool.query(`update ratings set created_at = now() - interval '30 days 1 minute' where user_id = $1`, [m.id]);
    expect(await due(m.cookie)).toBe(true);
  });
});

describe('POST /api/rating/snooze', () => {
  test('refuses without a session', async () => {
    expect((await postSnooze('')).status).toBe(401);
  });

  test('hides the prompt for 7 days, then it is due again', async () => {
    const m = await user();
    await jobs(m.id, 3);
    expect((await postSnooze(m.cookie)).status).toBe(200);
    expect(await due(m.cookie)).toBe(false);
    const left = (await pool.query(`select extract(epoch from rating_snoozed_until - now()) as s from users where id = $1`, [m.id])).rows[0].s;
    expect(Number(left)).toBeGreaterThan(7 * 86400 - 60);
    expect(Number(left)).toBeLessThanOrEqual(7 * 86400);
    await pool.query(`update users set rating_snoozed_until = now() - interval '1 minute' where id = $1`, [m.id]);
    expect(await due(m.cookie)).toBe(true);
  });
});

describe('POST /api/rating', () => {
  test('refuses without a session', async () => {
    expect((await post('', { score: 8 })).status).toBe(401);
  });

  test('stores the score, the trimmed comment and the member’s team now', async () => {
    const m = await user();
    await pool.query(`insert into teams (id, name) values ('rt', 'Rating Team')`);
    await pool.query(`update users set team_id = 'rt' where id = $1`, [m.id]);
    const res = await post(m.cookie, { score: 9, comment: '  Nhanh hơn tôi nghĩ  ' });
    expect(res.status).toBe(201);
    const row = (await pool.query('select score, comment, team_id from ratings where user_id = $1', [m.id])).rows[0];
    expect(row).toEqual({ score: 9, comment: 'Nhanh hơn tôi nghĩ', team_id: 'rt' });
    // The team is the one at rating time: a later move does not change it.
    await pool.query(`update users set team_id = 'team-unassigned' where id = $1`, [m.id]);
    expect((await pool.query('select team_id from ratings where user_id = $1', [m.id])).rows[0].team_id).toBe('rt');
  });

  test('turns a blank comment into null', async () => {
    const m = await user();
    expect((await post(m.cookie, { score: 4, comment: '   ' })).status).toBe(201);
    expect((await pool.query('select comment from ratings where user_id = $1', [m.id])).rows[0].comment).toBeNull();
  });

  test('refuses a score that is not a whole number from 1 to 10', async () => {
    const m = await user();
    for (const score of [0, 11, 3.5, -2, '7', null, undefined]) expect((await post(m.cookie, { score })).status, JSON.stringify(score)).toBe(400);
    expect((await post(m.cookie, 'not an object')).status).toBe(400);
    expect((await pool.query('select count(*)::int as n from ratings where user_id = $1', [m.id])).rows[0].n).toBe(0);
  });

  test('refuses a comment of more than 1000 characters and takes one of 1000', async () => {
    const m = await user();
    expect((await post(m.cookie, { score: 5, comment: 'x'.repeat(1001) })).status).toBe(400);
    expect((await post(m.cookie, { score: 5, comment: 7 })).status).toBe(400);
    expect((await post(m.cookie, { score: 5, comment: 'x'.repeat(1000) })).status).toBe(201);
  });
});
