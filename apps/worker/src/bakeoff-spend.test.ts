// Migration 0012 books the bake-off spend (plan B.7); the amounts must stay equal to the Spend line of docs/BAKEOFF.md (needs the compose Postgres).
import { readFileSync } from 'node:fs';
import { bookShared } from '@cvs/core/ledger';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, expect, test } from 'vitest';

const testDb = await createTestDatabase();
const pool = createPool(testDb.url);

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

const rows = async () =>
  (await pool.query(`select kind, usd::text as usd, month, provider, model, is_final, ref, job_id from cost_entries order by provider`)).rows;

test('the migration books one final bakeoff row per provider for the ICT month, with no job', async () => {
  expect(await rows()).toEqual([
    { kind: 'bakeoff', usd: '5.6000', month: '2026-10', provider: 'fal', model: 'kling-o3-pro', is_final: true, ref: 'bakeoff-2026-10-fal', job_id: null },
    { kind: 'bakeoff', usd: '13.8720', month: '2026-10', provider: 'replicate', model: 'seedance-2.5', is_final: true, ref: 'bakeoff-2026-10-replicate', job_id: null },
  ]);
});

test('the booked amounts equal docs/BAKEOFF.md Spend line, to the cent, per provider and in total', async () => {
  const md = readFileSync(new URL('../../../docs/BAKEOFF.md', import.meta.url), 'utf8');
  const m = /^Total \$(\d+\.\d\d) \((.+?)\), counting/m.exec(md);
  if (!m) throw new Error('docs/BAKEOFF.md has no Spend line');
  const doc = Object.fromEntries(m[2]!.split(', ').map((s) => { const [p, usd] = s.split(' $'); return [p!, usd!]; }));
  const booked = Object.fromEntries((await rows()).map((r) => [r.provider, (Math.round(Number(r.usd) * 100) / 100).toFixed(2)]));
  expect(booked).toEqual(doc);
  const total = (await rows()).reduce((a, r) => a + Math.round(Number(r.usd) * 10_000), 0) / 10_000;
  expect(total.toFixed(2)).toBe(m[1]);
});

test('booking the same ref again books nothing', async () => {
  expect(await bookShared(pool, { kind: 'bakeoff', usd: '5.6000', month: '2026-10', provider: 'fal', model: 'kling-o3-pro', ref: 'bakeoff-2026-10-fal' })).toBe(false);
  expect(await bookShared(pool, { kind: 'bakeoff', usd: '13.8720', month: '2026-10', provider: 'replicate', model: 'seedance-2.5', ref: 'bakeoff-2026-10-replicate' })).toBe(false);
  expect(await rows()).toHaveLength(2);
});
