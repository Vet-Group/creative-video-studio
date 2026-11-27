// The week's Run counts (lib/popular.ts) against a disposable database on the compose Postgres (`pnpm services:up`).
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

const { auth, pool } = await import('@/lib/auth');
const { MIN_USES, usesLine, weeklyUses } = await import('./popular');

let ann: string;
let bob: string;
let seq = 0;

/** A job of `feature` made `ago` (a SQL interval) ago, in `workspace`, by `user`'s team; `o` adds a Run id (`batch`), a preset, the job it retries, or a deletion. */
async function job(feature: string, ago: string, o: { workspace?: string; user?: string; batch?: string; preset?: string; retryOf?: string; deleted?: boolean } = {}) {
  const id = `j${++seq}`;
  const user = o.user ?? ann;
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, feature, params, preset_id, retry_of, deleted_at, created_at, workspace_id)
     values ($1, $2, $3, 'fal-test', 'fal', 'p', '1:1', 0, '{}', $4, $5, $6, $7, ${o.deleted ? 'now()' : 'null'}, now() - $8::interval, $9)`,
    [id, user, user === ann ? 'pt1' : 'pt2', feature, o.batch ? { batch: o.batch } : {}, o.preset ?? null, o.retryOf ?? null, ago, o.workspace ?? 'ws_vet'],
  );
  return id;
}
const uses = async (workspace = 'ws_vet') => weeklyUses(pool, workspace);

beforeAll(async () => {
  const user = async (email: string) => (await auth.api.createUser({ body: { email, name: email, password: 'correct-horse-battery', role: 'member' } })).user.id;
  ann = await user('ann@example.test');
  bob = await user('bob@example.test');
  await pool.query(`insert into workspaces (id, name) values ('ws_partner', 'Partner')`);
  await pool.query(`insert into teams (id, name) values ('pt1', 'Team one'), ('pt2', 'Team two')`);
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
     values ('fal-test', 'fal', 'x', 'Fal test', '{1:1}', '{0}', 2, '720p', 0.2, '{}', true)`,
  );
  await pool.query(`insert into presets (id, label, prompt) values ('p-hot', 'Hot', 'x'), ('p-cool', 'Cool', 'x')`);

  // Every user and team of the workspace counts, and a deleted job was a Run all the same.
  await job('reframe', '1 hour');
  await job('reframe', '2 days', { user: bob });
  await job('reframe', '3 days', { deleted: true });
  // A bulk Run's jobs share one batch id and count once; a Run on its own counts beside it.
  for (let i = 0; i < 6; i++) await job('pet_portrait', '1 hour', { batch: 'run-a' });
  await job('pet_portrait', '1 hour');
  // A retry is no new Run.
  const failed = await job('face_swap', '1 hour');
  await job('face_swap', '1 hour', { retryOf: failed });
  await job('face_swap', '1 hour');
  // The window is a rolling 7 days.
  await job('image_upscale', '6 days 23 hours');
  await job('image_upscale', '7 days 1 hour');
  // Another workspace's Runs are its own.
  for (let i = 0; i < 5; i++) await job('reframe', '1 hour', { workspace: 'ws_partner' });
  await job('motion_control', '1 hour', { workspace: 'ws_partner' });
  // Presets, by id; a job without one adds none.
  await job('video', '1 hour', { preset: 'p-hot' });
  await job('video', '1 day', { preset: 'p-hot', user: bob });
  await job('video', '2 days', { preset: 'p-hot' });
  await job('video', '1 hour', { preset: 'p-cool' });
  await job('video', '1 hour');
});

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

test('a line shows from MIN_USES Runs: two show nothing, three show the count', () => {
  expect(MIN_USES).toBe(3);
  expect(usesLine(undefined)).toBeNull();
  expect(usesLine(2)).toBeNull();
  expect(usesLine(3)).toBe('3 lượt dùng tuần này');
  expect(usesLine(1234)).toBe('1.234 lượt dùng tuần này');
});

test('every user and team of the workspace counts, deleted jobs too', async () => {
  expect((await uses()).features.get('reframe')).toBe(3);
});

test('the jobs of one bulk Run count once', async () => {
  expect((await uses()).features.get('pet_portrait')).toBe(2);
});

test('a retry is not a Run of its own', async () => {
  expect((await uses()).features.get('face_swap')).toBe(2);
});

test('the window is a rolling 7 days', async () => {
  expect((await uses()).features.get('image_upscale')).toBe(1);
});

test("a workspace never sees another's counts", async () => {
  const vet = await uses(), partner = await uses('ws_partner');
  expect(partner.features.get('reframe')).toBe(5);
  expect(vet.features.get('reframe')).toBe(3);
  expect(vet.features.has('motion_control')).toBe(false);
  expect(partner.features.has('pet_portrait')).toBe(false);
  expect([...(await uses('ws_nobody')).features]).toEqual([]);
});

test('a preset counts the Runs that named it', async () => {
  const { presets } = await uses();
  expect(presets.get('p-hot')).toBe(3);
  expect(presets.get('p-cool')).toBe(1);
  expect(presets.size).toBe(2);
  expect([...(await uses('ws_partner')).presets]).toEqual([]);
});
