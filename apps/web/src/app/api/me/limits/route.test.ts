// The caller's own cap usage against a disposable database on the compose Postgres (`pnpm services:up`); the numbers are tested with memberUsage (apps/worker).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { GET } = await import('./route');

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

test('401 without a session; a member reads only their own usage beside the Admin caps', async () => {
  expect((await GET(new Request('http://localhost/api/me/limits'))).status).toBe(401);

  const password = 'correct-horse-battery';
  for (const email of ['me@example.test', 'other@example.test']) await auth.api.createUser({ body: { email, name: email, password, role: 'member' } });
  const other = (await pool.query(`select id from users where email = 'other@example.test'`)).rows[0].id;
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids) values ('job-other', $1, 'team-unassigned', 'kling-o3-pro', 'fal', 'p', '9:16', 5, '{}')`,
    [other],
  );
  await pool.query('update settings set member_daily_clip_cap = 7, member_daily_usd_cap = 12, member_monthly_usd_cap = 80 where id = 1');
  const res = await auth.api.signInEmail({ body: { email: 'me@example.test', password }, asResponse: true });
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

  const r = await GET(new Request('http://localhost/api/me/limits', { headers: { cookie } }));
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ clips: { used: 0, cap: 7 }, dayUsd: { used: '0.0000', cap: '12.0000' }, monthUsd: { used: '0.0000', cap: '80.0000' } });
});
