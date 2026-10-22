// A disposable database per test file: created next to DATABASE_URL, migrated, dropped afterwards.
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { databaseUrl } from './client';

export async function createTestDatabase(): Promise<{ url: string; drop: () => Promise<void> }> {
  const base = new URL(databaseUrl());
  const name = `cvs_test_${randomBytes(6).toString('hex')}`;
  const run = async (q: string) => {
    const c = new pg.Client({ connectionString: base.toString() });
    await c.connect();
    try {
      await c.query(q);
    } finally {
      await c.end();
    }
  };
  await run(`create database ${name}`);
  const url = new URL(base);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) });
  } finally {
    await pool.end();
  }
  return { url: url.toString(), drop: () => run(`drop database if exists ${name} with (force)`) };
}
