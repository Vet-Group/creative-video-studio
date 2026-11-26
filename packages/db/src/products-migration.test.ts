// Migration 0121 (products) run by the migrator, as a deploy runs it, on a database that is at 0120 and holds rows: it adds the table and touches nothing else.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, expect, test } from 'vitest';
import { createPool } from './client';
import { createTestDatabase } from './testing';

const TAG = '0121_products';
const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

// The migrations folder as it was before 0121.
const before = mkdtempSync(join(tmpdir(), 'cvs-before-0121-'));
cpSync(migrationsFolder, before, { recursive: true });
const journalFile = join(before, 'meta', '_journal.json');
const journal = JSON.parse(readFileSync(journalFile, 'utf8')) as { entries: { tag: string }[] };
const at = journal.entries.findIndex((e) => e.tag === TAG);
writeFileSync(journalFile, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));

const testDb = await createTestDatabase(undefined, before);
const pool = createPool(testDb.url, 2);
const one = async (q: string) => (await pool.query(q)).rows[0];

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    rmSync(before, { recursive: true, force: true });
    await testDb.drop();
  }
});

test('a database at 0120 migrates to 0121: the table appears, its migration is recorded and the rows already there are unchanged', async () => {
  expect((await one(`select to_regclass('public.products') is not null as ok`)).ok).toBe(false);
  await pool.query(`insert into users (id, email, name) values ('u-0121', 'u0121@example.test', 'u0121')`);
  const applied = async () => Number((await one('select count(*) from drizzle.__drizzle_migrations')).count);
  const was = await applied();
  await migrate(drizzle(pool), { migrationsFolder });
  expect((await one(`select to_regclass('public.products') is not null as ok`)).ok).toBe(true);
  expect(await applied()).toBe(was + journal.entries.length - at); // 0121, and any migration written after it
  expect((await one(`select count(*)::int as n from users where id = 'u-0121'`)).n).toBe(1);
  expect((await one(`select count(*)::int as n from products`)).n).toBe(0);
});
