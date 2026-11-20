// Needs the compose Postgres: `pnpm services:up`.
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, expect, test, vi } from 'vitest';
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

test('a client the server drops while idle is logged, not thrown as an uncaught exception', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const own = createPool(url, 1);
  try {
    const { rows } = await own.query<{ pid: number }>('select pg_backend_pid() as pid');
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query('select pg_terminate_backend($1)', [rows[0]?.pid]);
    await admin.end();
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith('pg pool: idle client dropped:', expect.stringContaining('terminating connection')));
    expect((await own.query('select 1 as one')).rows).toEqual([{ one: 1 }]);
  } finally {
    log.mockRestore();
    await own.end();
  }
});

test('opens up to 15 connections by default', async () => {
  const own = createPool(url);
  try {
    expect(own.options.max).toBe(15);
  } finally {
    await own.end();
  }
});

test('a query that finds every connection held waits 10 s at most, then rejects instead of hanging', async () => {
  const own = createPool(url, 1);
  const held = await own.connect();
  try {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const waiting = own.query('select 1').then(
      () => 'ran',
      (e: Error) => e.message,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    vi.useRealTimers();
    expect(await Promise.race([waiting, new Promise((resolve) => setTimeout(resolve, 200, 'still waiting'))])).toBe('timeout exceeded when trying to connect');
  } finally {
    vi.useRealTimers();
    held.release();
    await own.end();
  }
});
