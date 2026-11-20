// How Postgres reads the job tray's poll (GET /api/jobs?mine, every 5 s while a job runs) on a table the size of a busy workspace, against a disposable
// database on the compose Postgres (`pnpm services:up`). The planner is left to choose, on analyzed numbers, as it does in production.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { GET } = await import('./route');

const PASSWORD = 'correct-horse-battery';
let cookie = '';

beforeAll(async () => {
  const { user } = await auth.api.createUser({ body: { email: 'tray@example.test', name: 'Tray', password: PASSWORD, role: 'member' } });
  const res = await auth.api.signInEmail({ body: { email: 'tray@example.test', password: PASSWORD }, asResponse: true });
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  await pool.query(`insert into users (id, email, name) select 'u' || g, 'u' || g || '@example.test', 'u' || g from generate_series(1, 19) g`);
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
     values ('m', 'mock', 'x', 'M', '{9:16}', '{5}', 4, '720p', 0.1, '{}', true)`,
  );
  // 60,000 jobs of 20 members, 3,000 of them the caller's, one in 500 a retry of an earlier job.
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, created_at, workspace_id)
     select 'j' || g, case when g % 20 = 0 then $1 else 'u' || (g % 20) end, 'team-unassigned', 'm', 'mock', 'p', '9:16', 5, '{}', 'succeeded',
            now() - make_interval(mins => g), 'ws_vet' from generate_series(1, 60000) g`,
    [user.id],
  );
  await pool.query(`update jobs set retry_of = 'j' || (substr(id, 2)::int - 20) where substr(id, 2)::int % 500 = 0`);
  await pool.query('analyze jobs');
});

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

test('asks whether each row was retried through the retry_of index, never by reading every job', async () => {
  const spy = vi.spyOn(pool, 'query');
  let calls: unknown[][];
  try {
    expect((await GET(new Request('http://localhost/api/jobs?mine', { headers: { cookie } }))).status).toBe(200);
  } finally {
    calls = spy.mock.calls;
    spy.mockRestore();
  }
  // The statement the poll sent, explained with its own values.
  const [text, values] = calls.find(([q]) => typeof q === 'string' && q.includes('r.retry_of = j.id')) as [string, unknown[]];
  type PlanNode = { 'Node Type': string; Alias?: string; 'Index Name'?: string; Plans?: PlanNode[] };
  const nodes = (n: PlanNode): PlanNode[] => [n, ...(n.Plans ?? []).flatMap(nodes)];
  const plan = nodes((await pool.query(`explain (format json) ${text}`, values)).rows[0]['QUERY PLAN'][0].Plan);
  const reads = plan.filter((n) => n.Alias === 'r'); // a probe per row, or one hashed read of every retry: Postgres picks by the numbers
  expect(reads.length).toBeGreaterThan(0);
  for (const n of reads) expect(n['Index Name'] ?? n.Plans?.[0]?.['Index Name'], n['Node Type']).toBe('jobs_retry_of_idx');
});
