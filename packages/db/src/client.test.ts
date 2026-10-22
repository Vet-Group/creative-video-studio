// Needs the compose Postgres: `pnpm services:up`.
import { sql } from 'drizzle-orm';
import { afterAll, expect, test } from 'vitest';
import { createDb, createPool } from './client';

try {
  process.loadEnvFile('../../.env');
} catch {
  // No .env file; DATABASE_URL must come from the environment.
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set; copy .env.example to .env');

const pool = createPool(url, 1);
afterAll(() => pool.end());

test('connects to the dev Postgres 16', async () => {
  const { rows } = await createDb(pool).execute<{ server_version: string }>(sql`show server_version`);
  expect(rows[0]?.server_version ?? '').toMatch(/^16\./);
});
