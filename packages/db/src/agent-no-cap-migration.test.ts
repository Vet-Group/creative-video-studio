// Migration 0129 (agent_no_cap) run by the migrator, as a deploy runs it, on a database at 0128 whose connections hold caps: the column and its check go, the rows
// stay, and a personal access token may then have no expiry.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, expect, test } from 'vitest';
import { createPool } from './client';
import { createTestDatabase } from './testing';

const TAG = '0129_agent_no_cap';
const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

// The migrations folder as it was before 0129.
const before = mkdtempSync(join(tmpdir(), 'cvs-before-0129-'));
cpSync(migrationsFolder, before, { recursive: true });
const journalFile = join(before, 'meta', '_journal.json');
const journal = JSON.parse(readFileSync(journalFile, 'utf8')) as { entries: { tag: string }[] };
const at = journal.entries.findIndex((e) => e.tag === TAG);
writeFileSync(journalFile, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));

const testDb = await createTestDatabase(undefined, before);
const pool = createPool(testDb.url, 2);
const capColumn = async () =>
  (await pool.query(`select count(*)::int as n from information_schema.columns where table_name = 'api_tokens' and column_name = 'monthly_cap_usd'`)).rows[0].n;

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    rmSync(before, { recursive: true, force: true });
    await testDb.drop();
  }
});

test('a database at 0128 with capped connections migrates to 0129: the cap column and its check are gone, the connections are unchanged, and a PAT may never expire', async () => {
  expect(at).toBeGreaterThan(0);
  expect(await capColumn()).toBe(1);
  await pool.query(`insert into users (id, email, name, role) values ('u-0129', 'u0129@example.test', 'u0129', 'admin')`);
  await pool.query(
    `insert into api_tokens (id, user_id, workspace_id, kind, name, secret_hash, monthly_cap_usd, expires_at) values
       ('t-0129-a', 'u-0129', 'ws_vet', 'pat', 'capped', '\\x01', 5, now() + interval '30 days'),
       ('t-0129-b', 'u-0129', 'ws_vet', 'pat', 'zero', '\\x02', 0, now() + interval '7 days')`,
  );
  await migrate(drizzle(pool), { migrationsFolder });
  expect(await capColumn()).toBe(0);
  expect((await pool.query(`select count(*)::int as n from pg_constraint where conname = 'api_tokens_cap_check'`)).rows[0].n).toBe(0);
  expect((await pool.query(`select id, name, kind from api_tokens where user_id = 'u-0129' order by id`)).rows).toEqual([
    { id: 't-0129-a', name: 'capped', kind: 'pat' },
    { id: 't-0129-b', name: 'zero', kind: 'pat' },
  ]);
  await pool.query(`insert into api_tokens (id, user_id, workspace_id, kind, name, secret_hash) values ('t-0129-c', 'u-0129', 'ws_vet', 'pat', 'never', '\\x03')`);
  await expect(pool.query(`insert into api_tokens (id, user_id, workspace_id, kind, name) values ('t-0129-d', 'u-0129', 'ws_vet', 'pat', 'no hash')`)).rejects.toThrow(/api_tokens_pat_check/);
});
