// Needs the compose Postgres: `pnpm services:up`.
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, expect, test, vi } from 'vitest';
import { databaseUrl } from './client';
import { createTestDatabase, staleTestDatabases } from './testing';

const migrateMock = vi.hoisted(() => vi.fn());
vi.mock('drizzle-orm/node-postgres/migrator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm/node-postgres/migrator')>();
  migrateMock.mockImplementation(actual.migrate);
  return { ...actual, migrate: migrateMock };
});

const admin = new pg.Client({ connectionString: databaseUrl() });
await admin.connect();
afterAll(() => admin.end());

const exists = async (name: string) => (await admin.query('select 1 from pg_database where datname = $1', [name])).rowCount === 1;
const hex = () => randomBytes(6).toString('hex');
const named = (ageHours: number) => `cvs_test_${Math.floor((Date.now() - ageHours * 3600_000) / 1000).toString(36)}_${hex()}`;

test('only timestamped test databases older than 6 hours are stale', () => {
  const now = Date.parse('2026-11-16T12:00:00Z');
  const at = (ageHours: number) => `cvs_test_${Math.floor((now - ageHours * 3600_000) / 1000).toString(36)}_0123456789ab`;
  expect(staleTestDatabases([at(7), at(5.9), at(0), at(100)], now)).toEqual([at(7), at(100)]);
  // Legacy names carry no timestamp, and nothing outside the cvs_test_ family is ever touched.
  expect(staleTestDatabases(['cvs_test_0123456789ab', 'cvs', 'postgres', 'cvs_e2e', 'e2e_x', 'cvs_ux_ab', 'cvs_test_', `x${at(7)}`], now)).toEqual([]);
});

test('creating a test database sweeps stale ones and leaves fresh, legacy and unrelated databases alone', { timeout: 30_000 }, async () => {
  const stale = named(7);
  const fresh = named(1);
  const legacy = `cvs_test_${hex()}`;
  const unrelated = `cvs_e2e_sweep_${hex()}`;
  const names = [stale, fresh, legacy, unrelated];
  for (const n of names) await admin.query(`create database ${n}`);
  const db = await createTestDatabase();
  try {
    expect(await exists(stale)).toBe(false);
    for (const n of [fresh, legacy, unrelated]) expect(await exists(n)).toBe(true);
  } finally {
    await db.drop();
    for (const n of names) await admin.query(`drop database if exists ${n} with (force)`);
  }
});

test('a database whose migration fails is dropped before the error reaches the caller', async () => {
  let name = '';
  migrateMock.mockImplementationOnce(async (db: NodePgDatabase) => {
    name = (await db.execute<{ n: string }>(sql`select current_database() as n`)).rows[0]?.n ?? '';
    throw new Error('boom');
  });
  await expect(createTestDatabase()).rejects.toThrow('boom');
  expect(name).toMatch(/^cvs_test_/);
  expect(await exists(name)).toBe(false);
});
