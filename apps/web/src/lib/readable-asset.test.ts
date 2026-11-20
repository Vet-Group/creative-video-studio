// readableAsset's Library check (lib/assets.ts) against a disposable database (`pnpm services:up`): the three ways a clip names an asset, and the
// indexes that answer them, since every thumbnail and range request of another member's clip runs it.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { pool } = await import('./auth');
const { readableAsset } = await import('./assets');
const viewer = { user: { id: 'viewer', role: 'member' } } as unknown as Parameters<typeof readableAsset>[0];

beforeAll(async () => {
  await pool.query(`insert into users (id, email, name) values ('owner', 'owner@example.test', 'Owner'), ('viewer', 'viewer@example.test', 'Viewer')`);
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
     values ('m', 'mock', 'x', 'M', '{9:16}', '{5}', 4, '720p', 0.1, '{}', true)`,
  );
  // A workspace with history: 5000 earlier clips, each with its own video and input, so the planner weighs the indexes against real numbers.
  await pool.query(
    `insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id)
     select k || g, 'owner', k, 'assets/' || k || g, k || g, 'image/png', 1, 'ws_vet' from generate_series(1, 5000) g, unnest(array['output', 'input']) k`,
  );
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, output_asset_id, workspace_id)
     select 'old' || g, 'owner', 'team-unassigned', 'm', 'mock', 'p', '9:16', 5, array['input' || g], 'succeeded', 'output' || g, 'ws_vet' from generate_series(1, 5000) g`,
  );
  for (const [id, kind] of [['a-out', 'output'], ['a-poster', 'output'], ['a-in', 'input'], ['a-loose', 'input']]) {
    await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, workspace_id) values ($1, 'owner', $2, $3, $1, 'image/png', 1, 'ws_vet')`, [id, kind, `assets/${id}`]);
  }
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, output_asset_id, poster_asset_id, workspace_id)
     values ('j1', 'owner', 'team-unassigned', 'm', 'mock', 'p', '9:16', 5, '{a-in}', 'succeeded', 'a-out', 'a-poster', 'ws_vet')`,
  );
  await pool.query('analyze jobs');
});

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

test("a member reads another member's asset only when a Library clip names it as its output, poster or input", async () => {
  for (const id of ['a-out', 'a-poster', 'a-in']) expect((await readableAsset(viewer, 'ws_vet', id)).asset?.id, id).toBe(id);
  expect((await readableAsset(viewer, 'ws_vet', 'a-loose')).error?.status).toBe(403);
});

test('the check reads jobs through one index per way a clip names the asset, never the whole workspace', async () => {
  const spy = vi.spyOn(pool, 'query');
  let calls: unknown[][];
  try {
    await readableAsset(viewer, 'ws_vet', 'a-in');
  } finally {
    calls = spy.mock.calls;
    spy.mockRestore();
  }
  // The statement the check sent, explained with its own values.
  const [text, values] = calls.find(([q]) => typeof q === 'string' && q.includes('from jobs j')) as [string, unknown[]];
  type PlanNode = { 'Node Type': string; 'Relation Name'?: string; 'Index Name'?: string; Plans?: PlanNode[] };
  const nodes = (n: PlanNode): PlanNode[] => [n, ...(n.Plans ?? []).flatMap(nodes)];
  const plan = nodes((await pool.query(`explain (format json) ${text}`, values)).rows[0]['QUERY PLAN'][0].Plan);
  expect(plan.filter((n) => n['Relation Name'] === 'jobs' && n['Node Type'] === 'Seq Scan')).toEqual([]);
  expect(plan.flatMap((n) => (n['Index Name']?.startsWith('jobs_') ? [n['Index Name']] : [])).sort()).toEqual([
    'jobs_input_asset_ids_idx',
    'jobs_output_asset_id_idx',
    'jobs_poster_asset_id_idx',
  ]);
});
