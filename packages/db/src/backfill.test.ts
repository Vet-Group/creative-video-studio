// The one-off migration that marks every existing user's email as verified (D.1), run against a database that already has users.
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, expect, test } from 'vitest';
import { fillInputSlots } from './assets';
import { createTestDatabase } from './testing';

const testDb = await createTestDatabase();
const pool = new pg.Pool({ connectionString: testDb.url, max: 1 });

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

test('0005 marks every unverified user verified and touches nothing else', async () => {
  await pool.query(`insert into users (id, email, name, email_verified) values ('u1', 'a@example.test', 'A', false), ('u2', 'b@example.test', 'B', true)`);
  await pool.query(readFileSync(new URL('../migrations/0005_backfill_email_verified.sql', import.meta.url), 'utf8'));
  const { rows } = await pool.query('select id, email, name, email_verified from users order by id');
  expect(rows).toEqual([
    { id: 'u1', email: 'a@example.test', name: 'A', email_verified: true },
    { id: 'u2', email: 'b@example.test', name: 'B', email_verified: true },
  ]);
});

test('0055 books the recorded Enhance and suggestion costs as llm rows once, in ICT, and a rerun books nothing', async () => {
  await pool.query(`insert into teams (id, name) values ('tb', 'Team B')`);
  await pool.query(`insert into stores (id, name, code) values ('sb', 'Shop B', 'SB')`);
  await pool.query(`update users set team_id = 'tb' where id = 'u2'`);
  const job = (id: string, cost: string | null, createdAt = '2026-10-31 18:30:00+00') =>
    pool.query(
      `insert into jobs (id, user_id, team_id, store_id, model, provider, prompt, aspect, duration_s, input_asset_ids, created_at, enhance, enhance_cost_usd)
       values ($1, 'u1', 'team-unassigned', 'sb', 'kling-o3-pro', 'fal', 'p', '9:16', 5, '{}', $2, true, $3)`,
      [id, createdAt, cost],
    );
  await job('j1', '0.000412'); // 01:30 ICT on 1 November
  await job('j2', '0.000040'); // rounds to 0 at the ledger's 4 decimals
  await job('j3', null);
  const run = (id: string, cost: string | null) =>
    pool.query(`insert into suggestion_runs (id, user_id, input, status, cost_usd, created_at) values ($1, 'u2', '{}', 'succeeded', $2, '2026-10-30 10:00:00+07')`, [id, cost]);
  await run('s1', '0.000550');
  await run('s2', '0');
  await run('s3', null);
  // The test database has run 0055 already, with no costs to book; its backfill statements follow the constraint changes.
  const file = readFileSync(new URL('../migrations/0055_llm_costs_in_ledger.sql', import.meta.url), 'utf8');
  const sql = file.slice(file.indexOf('-- LLM calls in the ledger'));
  await pool.query(sql);
  await pool.query(sql);
  const { rows } = await pool.query(
    `select kind, usd::text, month, day::text, user_id, team_id, store_id, job_id, provider, model, is_final, ref from cost_entries where kind = 'llm' order by ref`,
  );
  expect(rows).toEqual([
    { kind: 'llm', usd: '0.0004', month: '2026-11', day: '2026-11-01', user_id: 'u1', team_id: 'team-unassigned', store_id: 'sb', job_id: 'j1', provider: 'fal', model: 'google/gemini-2.5-flash', is_final: false, ref: 'llm:enhance:j1' },
    { kind: 'llm', usd: '0.0006', month: '2026-10', day: '2026-10-30', user_id: 'u2', team_id: 'tb', store_id: null, job_id: null, provider: 'fal', model: 'google/gemini-2.5-flash', is_final: true, ref: 'llm:suggestion:s1' },
  ]);
  // The job's llm row adds to its cost without closing it.
  expect((await pool.query(`select usd::text, is_final from job_costs where job_id = 'j1'`)).rows).toEqual([{ usd: '0.0004', is_final: false }]);
});

test('0068 gives uploads a store column (FK set null, owner/store/date index) and tags each input with the store of its owner\'s latest job with a store', async () => {
  await pool.query(`insert into stores (id, name, code) values ('sc', 'Shop C', 'SC'), ('sd', 'Shop D', 'SD')`);
  const asset = (id: string, owner: string, kind = 'input') =>
    pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, $2, $3, $1, 'f.jpg', 'image/jpeg', 1)`, [id, owner, kind]);
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) await asset(id, 'u1');
  await asset('b1', 'u2');
  await asset('o1', 'u1', 'output');
  const job = (id: string, store: string | null, inputs: string[], createdAt: string, params = '{}') =>
    pool.query(
      `insert into jobs (id, user_id, team_id, store_id, model, provider, prompt, aspect, duration_s, input_asset_ids, created_at, params)
       values ($1, 'u1', 'team-unassigned', $2, 'kling-o3-pro', 'fal', 'p', '9:16', 5, $3, $4, $5)`,
      [id, store, inputs, createdAt, params],
    );
  await job('k1', 'sc', ['a1', 'a2', 'b1', 'o1'], '2026-11-01 10:00:00+07');
  await job('k2', 'sd', ['a2'], '2026-11-02 10:00:00+07');
  await job('k3', null, ['a1', 'a3'], '2026-11-03 10:00:00+07');
  await job('k4', 'sd', [], '2026-11-03 10:00:00+07', '{"endAssetId":"a5"}');
  const file = readFileSync(new URL('../migrations/0068_upload_store.sql', import.meta.url), 'utf8');
  await pool.query(file.slice(file.indexOf('-- Backfill')));
  const { rows } = await pool.query(`select id, store_id from assets where id in ('a1', 'a2', 'a3', 'a4', 'a5', 'b1', 'o1') order by id`);
  // A store-less job leaves the tag alone; another member's photo and an output are never tagged.
  expect(rows).toEqual([
    { id: 'a1', store_id: 'sc' },
    { id: 'a2', store_id: 'sd' },
    { id: 'a3', store_id: null },
    { id: 'a4', store_id: null },
    { id: 'a5', store_id: 'sd' },
    { id: 'b1', store_id: null },
    { id: 'o1', store_id: null },
  ]);
  const index = await pool.query(`select indexdef from pg_indexes where indexname = 'assets_owner_id_store_id_created_at_idx'`);
  expect(index.rows[0].indexdef).toContain('(owner_id, store_id, created_at)');
  await expect(pool.query(`update assets set store_id = 'nope' where id = 'a4'`)).rejects.toThrow(/assets_store_id_stores_id_fk/);
  await pool.query(`update jobs set store_id = null where store_id = 'sc'`);
  await pool.query(`delete from stores where id = 'sc'`);
  expect((await pool.query(`select store_id from assets where id = 'a1'`)).rows).toEqual([{ store_id: null }]);
});

test('0077 puts each earlier input in the slot of the first job that used it, and leaves outputs and unused inputs alone', async () => {
  const asset = (id: string, kind = 'input') =>
    pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, 'u1', $2, $1, 'f.jpg', 'image/jpeg', 1)`, [id, kind]);
  for (const id of ['s-person', 's-top', 's-skirt', 's-bg', 's-model', 's-product', 's-ref', 's-frame', 's-end', 's-img', 's-unused', 's-app', 's-box-product', 's-box-pack']) await asset(id);
  await asset('s-out', 'output');
  const job = (id: string, feature: string, inputs: string[], createdAt: string, params = '{}') =>
    pool.query(
      `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, input_asset_ids, created_at, params)
       values ($1, 'u1', 'team-unassigned', $2, 'kling-o3-pro', 'fal', 'p', '9:16', 5, $3, $4, $5)`,
      [id, feature, inputs, createdAt, params],
    );
  await job('s1', 'try_on', ['s-person', 's-top', 's-skirt', 's-bg'], '2026-11-01 10:00:00+07', '{"garments":"2"}');
  await job('s2', 'marketing', ['s-model', 's-product'], '2026-11-01 11:00:00+07');
  await job('s3', 'marketing', ['s-ref', 's-out'], '2026-11-01 12:00:00+07', '{"format":"advanced"}');
  await job('s4', 'video', ['s-frame', 's-product'], '2026-11-02 10:00:00+07', '{"endAssetId":"s-end"}'); // s-product keeps its first slot
  await job('s5', 'image', ['s-img'], '2026-11-02 11:00:00+07');
  await job('s6', 'background_changer', ['s-app'], '2026-11-02 12:00:00+07');
  await job('s7', 'marketing', ['s-box-product', 's-box-pack'], '2026-11-02 13:00:00+07', '{"format":"unboxing","roles":"product,packaging"}');
  const file = readFileSync(new URL('../migrations/0077_upload_dedupe.sql', import.meta.url), 'utf8');
  await pool.query(file.slice(file.indexOf('WITH uses')));
  const { rows } = await pool.query(`select id, slot from assets where id like 's-%' order by id`);
  expect(Object.fromEntries(rows.map((r: { id: string; slot: string | null }) => [r.id, r.slot]))).toEqual({
    's-app': null,
    's-bg': 'background',
    's-box-pack': 'packaging',
    's-box-product': 'product',
    's-end': 'end-frame',
    's-frame': 'video',
    's-img': 'image',
    's-model': 'model',
    's-out': null,
    's-person': 'model',
    's-product': 'product',
    's-ref': 'reference',
    's-skirt': 'garment',
    's-top': 'garment',
    's-unused': null,
  });

  // A new job records its inputs' slots the same way (api/jobs), in the order the jobs are made.
  const slots = Object.fromEntries(rows.map((r: { id: string; slot: string | null }) => [r.id, r.slot]));
  await pool.query(`update assets set slot = null where id like 's-%'`);
  for (const id of ['s1', 's2', 's3', 's4', 's5', 's6', 's7']) await fillInputSlots(pool, id);
  const again = await pool.query(`select id, slot from assets where id like 's-%' order by id`);
  expect(Object.fromEntries(again.rows.map((r: { id: string; slot: string | null }) => [r.id, r.slot]))).toEqual(slots);
});
