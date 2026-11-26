// The duplicate-upload sweep against a disposable database on the compose Postgres (`pnpm services:up`); object reads are stubbed.
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, expect, onTestFinished, test } from 'vitest';
import { dedupeTick, hashInputs, removeDuplicateInputs, sha256, UNREADABLE } from './asset-dedupe';

const testDb = await createTestDatabase();
const pool = createPool(testDb.url, 2);
const files: Record<string, string> = {};
const read = async (key: string) => {
  if (!(key in files)) throw new Error('NoSuchKey');
  return new TextEncoder().encode(files[key]);
};

beforeAll(async () => {
  await pool.query(`insert into users (id, email, name) values ('u1', 'u1@example.test', 'u1'), ('u2', 'u2@example.test', 'u2')`);
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
     values ('m', 'mock', 'x', 'M', '{9:16}', '{5}', 4, '720p', 0.1, '{}', true)`,
  );
});

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

/** An input asset `id` of `owner` holding `content`, made `minutes` ago. */
async function input(id: string, content: string | null, minutes: number, owner = 'u1') {
  if (content !== null) files[`assets/${id}`] = content;
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, created_at, workspace_id) values ($1, $2, 'input', $3, $1, 'image/png', 1, now() - make_interval(mins => $4), 'ws_vet')`, [id, owner, `assets/${id}`, minutes]);
}
const live = async () => (await pool.query(`select id from assets where deleted_at is null order by id`)).rows.map((r: { id: string }) => r.id);

test('keeps the picture of a saved AI model, deleted or not, even when a newer copy of the same file exists', async () => {
  await input('m-live', 'face', 10, 'u2');
  await input('m-live-newer', 'face', 1, 'u2'); // a later upload of the same file
  await input('m-gone', 'hat', 10, 'u2');
  await input('m-gone-newer', 'hat', 1, 'u2');
  await pool.query(`insert into fashion_models (id, user_id, name, asset_id, workspace_id) values ('fm1', 'u2', 'Live', 'm-live', 'ws_vet'), ('fm2', 'u2', 'Gone', 'm-gone', 'ws_vet')`);
  await pool.query(`update fashion_models set deleted_at = now() where id = 'fm2'`);
  await dedupeTick(pool, read);
  expect(await live()).toEqual(expect.arrayContaining(['m-live', 'm-live-newer', 'm-gone', 'm-gone-newer']));
  await pool.query(`delete from fashion_models`);
  await pool.query(`delete from assets where id like 'm-%'`);
});

test("keeps an analysis' reference video and a remake's product image even when a newer copy of the same file exists", async () => {
  // Seen on prod 2026-11-13: uploading a reference video again hid the older copy an analysis plays (its /analyze video answered 404).
  await input('v-used', 'clip', 10, 'u2');
  await input('v-newer', 'clip', 1, 'u2');
  await input('p-used', 'top', 10, 'u2');
  await input('p-newer', 'top', 1, 'u2');
  await pool.query(`insert into analyses (id, user_id, team_id, source_key, status, workspace_id) values ('an1', 'u2', 'team-unassigned', 'assets/v-used', 'succeeded', 'ws_vet')`);
  await pool.query(`insert into remakes (id, user_id, team_id, analysis_id, product_asset_id, shots, status, workspace_id) values ('rm1', 'u2', 'team-unassigned', 'an1', 'p-used', '[0]', 'succeeded', 'ws_vet')`);
  await dedupeTick(pool, read);
  expect(await live()).toEqual(expect.arrayContaining(['v-used', 'v-newer', 'p-used', 'p-newer']));
  await pool.query(`delete from remakes`);
  await pool.query(`delete from analyses`);
  await pool.query(`delete from assets where id like 'v-%' or id like 'p-%'`);
});

test("keeps a product's photo: both copies stay when the product names the older one, and the older unused copy goes when it names the newer", async () => {
  await input('pd-old-named', 'shirt-front', 10, 'u2');
  await input('pd-new-1', 'shirt-front', 1, 'u2');
  await input('pd-old-free', 'shirt-back', 10, 'u2');
  await input('pd-new-named', 'shirt-back', 1, 'u2');
  await pool.query(`insert into products (id, user_id, workspace_id, name, asset_ids) values ('prod-d1', 'u2', 'ws_vet', 'Front', '{pd-old-named,pd-new-named}')`);
  await dedupeTick(pool, read);
  expect(await live()).toEqual(expect.arrayContaining(['pd-old-named', 'pd-new-1', 'pd-new-named']));
  expect(await live()).not.toContain('pd-old-free');
  await pool.query(`delete from products`);
  await pool.query(`delete from assets where id like 'pd-%'`);
});

test('ranks only the files that have another live copy, so a sweep reads jobs per copy and not per input', async () => {
  // Audit 2026-11-20: ranking every live input made each tick read jobs once per input, though nearly every input has no copy.
  onTestFinished(() => pool.query(`delete from assets where id like 's-%'`).then(() => {}));
  for (let i = 0; i < 40; i++) await input(`s-${i}`, `photo ${i}`, 20 + i);
  await input('s-new', 'sock', 1);
  await input('s-old', 'sock', 2);
  await hashInputs(pool, read);

  type PlanNode = { 'Relation Name'?: string; 'Actual Loops': number; Plans?: PlanNode[] };
  let plan: PlanNode | undefined;
  const client = await pool.connect();
  try {
    await client.query('begin');
    // The sweep's own statement, run under explain analyze and rolled back.
    await removeDuplicateInputs({
      query: async (text: string) => {
        const r = await client.query(`explain (analyze, format json) ${text}`);
        plan = r.rows[0]['QUERY PLAN'][0].Plan;
        return r;
      },
      connect: () => pool.connect(),
    });
  } finally {
    await client.query('rollback');
    client.release();
  }
  const jobReads = (n: PlanNode): number => (n['Relation Name'] === 'jobs' ? n['Actual Loops'] : 0) + (n.Plans ?? []).reduce((s, p) => s + jobReads(p), 0);
  // At most three reads of jobs for each of the two copies (the two ranking checks and the final one); the 40 files without a copy add none.
  expect(jobReads(plan!)).toBeLessThanOrEqual(6);

  expect(await removeDuplicateInputs(pool)).toEqual(['s-old']);
});

test('hashes old inputs, keeps the newest copy of a file the purge will not take and every copy something uses, and removes the rest', async () => {
  await input('a-new', 'shirt', 1);
  await input('a-mid', 'shirt', 2);
  await input('a-old', 'shirt', 3);
  await input('a-job', 'shirt', 4); // an input of a job
  await input('a-end', 'shirt', 5); // a job's end frame (params)
  await input('a-tpl', 'shirt', 6); // in a saved template
  await input('a-choice', 'shirt', 7); // a choice's picture
  await input('b-only', 'coat', 8);
  await input('c-other', 'shirt', 9, 'u2'); // the same file, another owner
  await input('d-gone', null, 10); // its object is missing
  await input('e-doomed', 'scarf', 1); // only a deleted job names it: the purge takes it with that job
  await input('e-old', 'scarf', 11); // so this older copy is the one kept
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, params, workspace_id) values
       ('j1', 'u1', 'team-unassigned', 'm', 'mock', 'p', '9:16', 5, '{a-job}', 'succeeded', '{}', 'ws_vet'),
       ('j2', 'u1', 'team-unassigned', 'm', 'mock', 'p', '9:16', 5, '{b-only}', 'succeeded', '{"endAssetId": "a-end"}', 'ws_vet')`,
  );
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, params, deleted_at, workspace_id)
     values ('j3', 'u1', 'team-unassigned', 'm', 'mock', 'p', '9:16', 5, '{e-doomed}', 'succeeded', '{}', now(), 'ws_vet')`,
  );
  await pool.query(`insert into user_templates (id, user_id, feature, name, data, workspace_id) values ('t1', 'u1', 'video', 'T', '{"images": ["a-tpl"]}', 'ws_vet')`);
  await pool.query(`insert into user_choices (id, user_id, kind, name, phrase, image_asset_id, workspace_id) values ('c1', 'u1', 'hook', 'H', 'p', 'a-choice', 'ws_vet')`);

  expect(await dedupeTick(pool, read)).toEqual({ hashed: 12, removed: 2 });
  expect(await live()).toEqual(['a-choice', 'a-end', 'a-job', 'a-new', 'a-tpl', 'b-only', 'c-other', 'd-gone', 'e-doomed', 'e-old']);
  const hashes = Object.fromEntries((await pool.query(`select id, sha256 from assets`)).rows.map((r: { id: string; sha256: string }) => [r.id, r.sha256]));
  expect(hashes['a-new']).toBe(sha256(new TextEncoder().encode('shirt')));
  expect(hashes['d-gone']).toBe(UNREADABLE);

  // A second run has nothing left to hash or remove.
  expect(await hashInputs(pool, read)).toBe(0);
  expect(await removeDuplicateInputs(pool)).toEqual([]);
});
