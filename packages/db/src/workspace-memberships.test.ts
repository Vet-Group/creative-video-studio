// Migration 0108 (workspaces, phase 2) run by the migrator, as a deploy runs it, on users created between 0106 and the phase 2 deploy.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, expect, test } from 'vitest';
import { createPool } from './client';
import { createTestDatabase } from './testing';

const TAG = '0108_workspace_memberships';
const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

// The migrations folder as it was before 0108.
const before = mkdtempSync(join(tmpdir(), 'cvs-before-0108-'));
cpSync(migrationsFolder, before, { recursive: true });
const journalFile = join(before, 'meta', '_journal.json');
const journal = JSON.parse(readFileSync(journalFile, 'utf8')) as { entries: { tag: string }[] };
const at = journal.entries.findIndex((e) => e.tag === TAG);
writeFileSync(journalFile, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));

const testDb = await createTestDatabase(undefined, before);
const pool = createPool(testDb.url, 2);

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    rmSync(before, { recursive: true, force: true });
    await testDb.drop();
  }
});

test('0108 files every user without a membership under ws_vet (an Admin as owner), leaves a partner-only user alone, and a rerun adds nothing', async () => {
  expect(at).toBeGreaterThan(0);
  // As in production between 0106 and this deploy: nothing adds a membership for a new user.
  await pool.query('drop trigger if exists test_company_member on users');
  await pool.query(
    `insert into users (id, email, name, role) values ('m-admin', 'a@example.test', 'A', 'admin'), ('m-member', 'm@example.test', 'M', 'member'),
       ('m-partner', 'p@example.test', 'P', 'member'), ('m-company', 'c@example.test', 'C', 'member')`,
  );
  await pool.query(`insert into workspaces (id, name) values ('ws_partner', 'Partner')`);
  await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ('ws_partner', 'm-partner', 'owner'), ('ws_vet', 'm-company', 'member')`);
  const members = async () =>
    (await pool.query(`select workspace_id, user_id, role from workspace_members where user_id like 'm-%' order by user_id, workspace_id`)).rows.map((r) => `${r.user_id}:${r.workspace_id}:${r.role}`);

  await migrate(drizzle(pool), { migrationsFolder });
  const after = ['m-admin:ws_vet:owner', 'm-company:ws_vet:member', 'm-member:ws_vet:member', 'm-partner:ws_partner:owner'];
  expect(await members()).toEqual(after);
  // Idempotent: the statement itself adds nothing when run again.
  await pool.query(readFileSync(join(migrationsFolder, `${TAG}.sql`), 'utf8'));
  expect(await members()).toEqual(after);
});
