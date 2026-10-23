// The one-off migration that marks every existing user's email as verified (D.1), run against a database that already has users.
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, expect, test } from 'vitest';
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
