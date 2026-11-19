// Migration 0107 (workspaces, phase 1) run by the migrator, as a deploy runs it, on a database that already holds rows from before it.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createPool } from './client';
import { createTestDatabase } from './testing';

const TAG = '0107_workspaces';
const TABLES = ['analyses', 'assets', 'cost_entries', 'fashion_models', 'feedback', 'jobs', 'preset_proposals', 'remakes', 'stores', 'suggestion_runs', 'user_choices', 'user_templates'];
const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

// The migrations folder as it was before 0107.
const before = mkdtempSync(join(tmpdir(), 'cvs-before-0107-'));
cpSync(migrationsFolder, before, { recursive: true });
const journalFile = join(before, 'meta', '_journal.json');
const journal = JSON.parse(readFileSync(journalFile, 'utf8')) as { entries: { tag: string }[] };
const at = journal.entries.findIndex((e) => e.tag === TAG);
journal.entries = journal.entries.slice(0, at);
writeFileSync(journalFile, JSON.stringify(journal));

const testDb = await createTestDatabase(undefined, before);
const pool = createPool(testDb.url, 3);
const migrateAll = () => migrate(drizzle(pool), { migrationsFolder });
const one = async (q: string, params: unknown[] = []) => (await pool.query(q, params)).rows[0];
const applied = async () => Number((await one('select count(*) from drizzle.__drizzle_migrations')).count);
const filenode = async (table: string) => (await one('select pg_relation_filenode($1::regclass) as f', [table])).f as string;

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    rmSync(before, { recursive: true, force: true });
    await testDb.drop();
  }
});

beforeAll(async () => {
  expect(at).toBeGreaterThan(0);
  await pool.query(`insert into users (id, email, name, role) values ('w-admin', 'admin@example.test', 'Admin', 'admin'), ('w-member', 'member@example.test', 'Member', 'member')`);
  await pool.query(`insert into stores (id, name, code) values ('w-store', 'Shop W', 'SW')`);
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ('w-asset', 'w-member', 'input', 'w-asset', 'f.jpg', 'image/jpeg', 1)`);
  await pool.query(
    `insert into jobs (id, user_id, team_id, store_id, model, provider, prompt, aspect, duration_s, input_asset_ids)
     values ('w-job', 'w-member', 'team-unassigned', 'w-store', 'kling-o3-pro', 'fal', 'p', '9:16', 5, '{w-asset}')`,
  );
  // A shared ledger row: no job, user, team or store.
  await pool.query(`insert into cost_entries (kind, usd, month, is_final, note) values ('invoice_diff', '1.2500', '2026-11', true, 'fal invoice')`);
  await pool.query(`insert into analyses (id, user_id, team_id, source_key) values ('w-analysis', 'w-member', 'team-unassigned', 'k')`);
  await pool.query(`insert into remakes (id, user_id, team_id, analysis_id, shots) values ('w-remake', 'w-member', 'team-unassigned', 'w-analysis', '[0]')`);
  await pool.query(`insert into suggestion_runs (id, user_id, input) values ('w-run', 'w-member', '{}')`);
  await pool.query(`insert into user_templates (id, user_id, feature, name, data) values ('w-template', 'w-member', 'video', 'T', '{}')`);
  await pool.query(`insert into user_choices (id, user_id, kind, name, phrase) values ('w-choice', 'w-member', 'hook', 'H', 'p')`);
  await pool.query(`insert into fashion_models (id, user_id, name, asset_id) values ('w-model', 'w-member', 'M', 'w-asset')`);
  await pool.query(`insert into feedback (id, user_id, team_id, kind, title, body, image_asset_ids) values ('w-feedback', 'w-member', 'team-unassigned', 'bug', 't', 'b', '{}')`);
  await pool.query(`insert into preset_proposals (id, label, prompt, proposed_by) values ('w-proposal', 'L', 'p', 'w-member')`);
});

test('0107 waits at most its lock_timeout for a busy table, then rolls back whole', { timeout: 30_000 }, async () => {
  const count = await applied();
  const holder = await pool.connect();
  try {
    await holder.query('begin');
    await holder.query('lock table cost_entries in access share mode');
    const error = await migrateAll().then(
      () => null,
      (e: Error & { cause?: { code?: string } }) => e,
    );
    expect(error?.cause?.code).toBe('55P03'); // lock_not_available: canceling statement due to lock timeout
  } finally {
    await holder.query('rollback');
    holder.release();
  }
  expect(await applied()).toBe(count);
  expect(await one(`select to_regclass('workspaces') as t`)).toEqual({ t: null });
  expect(await one(`select count(*)::int as n from information_schema.columns where column_name = 'workspace_id'`)).toEqual({ n: 0 });
});

test('0107 seeds ws_vet with every user (Admin as owner), files every existing row under it without a rewrite or a ledger update, and a rerun applies nothing', async () => {
  const nodes = Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await filenode(t)])));
  const count = await applied();
  await migrateAll();
  expect(await applied()).toBe(count + 1);

  expect((await pool.query('select id, name, created_by, disabled_at from workspaces')).rows).toEqual([{ id: 'ws_vet', name: 'VET Group', created_by: null, disabled_at: null }]);
  expect((await pool.query('select workspace_id, user_id, role, added_by from workspace_members order by user_id')).rows).toEqual([
    { workspace_id: 'ws_vet', user_id: 'w-admin', role: 'owner', added_by: null },
    { workspace_id: 'ws_vet', user_id: 'w-member', role: 'member', added_by: null },
  ]);

  // Exactly the root tables carry the column, NOT NULL with the constant default and a restricting foreign key; audit_entries and the rest do not.
  const columns = await pool.query(
    `select table_name, is_nullable, column_default from information_schema.columns where table_schema = 'public' and column_name = 'workspace_id' and table_name not like 'workspace%' order by table_name`,
  );
  expect(columns.rows).toEqual(TABLES.map((t) => ({ table_name: t, is_nullable: 'NO', column_default: "'ws_vet'::text" })));
  const fks = await pool.query(
    `select conrelid::regclass::text as t, confdeltype from pg_constraint where contype = 'f' and confrelid = 'workspaces'::regclass and conrelid <> 'workspace_members'::regclass order by 1`,
  );
  expect(fks.rows).toEqual(TABLES.map((t) => ({ t, confdeltype: 'r' })));

  for (const t of TABLES) {
    const { n, vet } = await one(`select count(*)::int as n, count(*) filter (where workspace_id = 'ws_vet')::int as vet from ${t}`);
    expect(n, t).toBeGreaterThan(0);
    expect(vet, t).toBe(n);
    // A constant default is recorded in the catalog: the table keeps its file, so nothing was rewritten.
    expect(await filenode(t), t).toBe(nodes[t]);
  }

  // The append-only trigger stayed enabled throughout (any UPDATE of the ledger would have failed the migration) and still refuses updates.
  expect((await pool.query(`select tgname, tgenabled from pg_trigger where tgrelid = 'cost_entries'::regclass and not tgisinternal order by tgname`)).rows).toEqual([
    { tgname: 'cost_entries_no_truncate', tgenabled: 'O' },
    { tgname: 'cost_entries_no_update_delete', tgenabled: 'O' },
  ]);
  expect(readFileSync(join(migrationsFolder, `${TAG}.sql`), 'utf8')).not.toMatch(/disable\s+trigger|update\s+"?cost_entries/i);
  await expect(pool.query(`update cost_entries set note = 'x'`)).rejects.toThrow(/append-only/);

  // An insert that names no workspace lands in ws_vet; an unknown workspace is refused.
  await pool.query(`insert into stores (id, name, code) values ('w-store-2', 'Shop W2', 'SW2')`);
  await pool.query(`insert into cost_entries (kind, usd, month, is_final, note) values ('invoice_diff', '0.5000', '2026-11', true, 'later')`);
  expect(await one(`select workspace_id from stores where id = 'w-store-2'`)).toEqual({ workspace_id: 'ws_vet' });
  expect(await one(`select workspace_id from cost_entries where note = 'later'`)).toEqual({ workspace_id: 'ws_vet' });
  await expect(pool.query(`insert into stores (id, name, code, workspace_id) values ('w-store-3', 'Shop W3', 'SW3', 'nope')`)).rejects.toThrow(/stores_workspace_id_workspaces_id_fk/);

  // The list indexes; Postgres prints DESC NULLS FIRST as plain DESC, the order of `order by created_at desc`.
  const indexes = await pool.query(`select indexname, indexdef from pg_indexes where indexname like '%workspace_id%' or tablename like 'workspace%' order by indexname`);
  expect(Object.fromEntries(indexes.rows.map((r) => [r.indexname, r.indexdef.replace(/^.* USING btree /, '')]))).toEqual({
    workspace_members_user_id_idx: '(user_id)',
    workspace_members_workspace_id_user_id_pk: '(workspace_id, user_id)',
    workspaces_name_key: '(lower(name))',
    workspaces_pkey: '(id)',
    analyses_workspace_id_idx: '(workspace_id)',
    assets_workspace_id_created_at_idx: '(workspace_id, created_at DESC)',
    fashion_models_workspace_id_idx: '(workspace_id)',
    feedback_workspace_id_idx: '(workspace_id)',
    jobs_workspace_id_created_at_idx: '(workspace_id, created_at DESC)',
    stores_workspace_id_idx: '(workspace_id)',
    user_choices_workspace_id_idx: '(workspace_id)',
    user_templates_workspace_id_idx: '(workspace_id)',
  });
  await expect(pool.query(`insert into workspaces (id, name) values ('ws_x', 'vet group')`)).rejects.toThrow(/workspaces_name_key/);
  await pool.query(`insert into users (id, email, name) values ('w-new', 'new@example.test', 'New')`);
  await expect(pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_vet', 'w-new', 'admin')`)).rejects.toThrow(/workspace_members_role_check/);

  await migrateAll();
  expect(await applied()).toBe(count + 1);
  expect(await one('select count(*)::int as n from workspace_members')).toEqual({ n: 2 });
});
