// realUserSql against a disposable database (`pnpm services:up`): system accounts and members of a team left out of the reports are not real users.
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, expect, test } from 'vitest';
import { realUserSql } from './real-users';

const testDb = await createTestDatabase();
const pool = createPool(testDb.url, 2);
afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

test('reads the system flag of the user and the report flag of the joined team, under any aliases', () => {
  expect(realUserSql()).toBe('(not u.system and not coalesce(t.excluded_from_reports, false))');
  expect(realUserSql('bu', 'bt')).toBe('(not bu.system and not coalesce(bt.excluded_from_reports, false))');
});

test('keeps a person of a counted team and drops a system account and every member of an excluded team', async () => {
  await pool.query(`insert into teams (id, name, excluded_from_reports) values ('sales', 'Sales', false), ('eng', 'Kỹ thuật', true)`);
  await pool.query(
    `insert into users (id, email, name, team_id, system) values
       ('seller', 'seller@example.test', 'Seller', 'sales', false), ('bot', 'bot@example.test', 'Bot', 'sales', true),
       ('dev', 'dev@example.test', 'Dev', 'eng', false), ('dev-bot', 'dev-bot@example.test', 'Dev bot', 'eng', true)`,
  );
  const real = async (sql: string) => (await pool.query(sql)).rows.map((r) => r.id);
  expect(await real(`select u.id from users u left join teams t on t.id = u.team_id where ${realUserSql()} and u.id in ('seller', 'bot', 'dev', 'dev-bot')`)).toEqual(['seller']);
  // With no team row (a left join that found none) the account counts on its system flag alone.
  expect(await real(`select u.id from users u left join teams t on false where ${realUserSql()} and u.id in ('seller', 'bot', 'dev', 'dev-bot') order by u.id`)).toEqual(['dev', 'seller']);
});
