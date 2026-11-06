// The duplicate-upload sweep against a disposable database on the compose Postgres (`pnpm services:up`); object reads are stubbed.
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, expect, test } from 'vitest';
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
  await pool.end();
  await testDb.drop();
});

/** An input asset `id` of `owner` holding `content`, made `minutes` ago. */
async function input(id: string, content: string | null, minutes: number, owner = 'u1') {
  if (content !== null) files[`assets/${id}`] = content;
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes, created_at) values ($1, $2, 'input', $3, $1, 'image/png', 1, now() - make_interval(mins => $4))`, [id, owner, `assets/${id}`, minutes]);
}
const live = async () => (await pool.query(`select id from assets where deleted_at is null order by id`)).rows.map((r: { id: string }) => r.id);

test('hashes old inputs, keeps the newest copy of a file and every copy something uses, and removes the rest', async () => {
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
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, params) values
       ('j1', 'u1', 'team-unassigned', 'm', 'mock', 'p', '9:16', 5, '{a-job}', 'succeeded', '{}'),
       ('j2', 'u1', 'team-unassigned', 'm', 'mock', 'p', '9:16', 5, '{b-only}', 'succeeded', '{"endAssetId": "a-end"}')`,
  );
  await pool.query(`insert into user_templates (id, user_id, feature, name, data) values ('t1', 'u1', 'video', 'T', '{"images": ["a-tpl"]}')`);
  await pool.query(`insert into user_choices (id, user_id, kind, name, phrase, image_asset_id) values ('c1', 'u1', 'hook', 'H', 'p', 'a-choice')`);

  expect(await dedupeTick(pool, read)).toEqual({ hashed: 10, removed: 2 });
  expect(await live()).toEqual(['a-choice', 'a-end', 'a-job', 'a-new', 'a-tpl', 'b-only', 'c-other', 'd-gone']);
  const hashes = Object.fromEntries((await pool.query(`select id, sha256 from assets`)).rows.map((r: { id: string; sha256: string }) => [r.id, r.sha256]));
  expect(hashes['a-new']).toBe(sha256(new TextEncoder().encode('shirt')));
  expect(hashes['d-gone']).toBe(UNREADABLE);

  // A second run has nothing left to hash or remove.
  expect(await hashInputs(pool, read)).toBe(0);
  expect(await removeDuplicateInputs(pool)).toEqual([]);
});
