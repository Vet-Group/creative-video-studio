// The suggestion run against a disposable database on the compose Postgres (`pnpm services:up`). The suggester is a fake: no call reaches fal.
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import type { Suggester } from '@cvs/core/suggest';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { fakeSuggester, runSuggestion } from './suggest';

const testDb = await createTestDatabase();
const pool = createPool(testDb.url, 2);
const input = { field: 'brief', text: 'linen dress', context: '', max: 1200 };
let seq = 0;

async function queued(ageSeconds = 0): Promise<string> {
  const id = `run-${++seq}`;
  await pool.query(`insert into suggestion_runs (id, user_id, input, created_at) values ($1, 'u1', $2, now() - make_interval(secs => $3))`, [id, JSON.stringify(input), ageSeconds]);
  return id;
}
const row = async (id: string) => (await pool.query('select status, output, cost_usd from suggestion_runs where id = $1', [id])).rows[0];
const ledger = async (id: string) => (await pool.query(`select kind, usd::text as usd, user_id, team_id, job_id, model, is_final from cost_entries where ref = $1`, [`llm:suggestion:${id}`])).rows;

beforeAll(async () => {
  await pool.query(`insert into users (id, email, name) values ('u1', 'u1@example.test', 'u1')`);
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

test('writes the options and the cost of a queued run, calling the suggester once with its input', async () => {
  const calls: unknown[] = [];
  const suggest: Suggester = async (i) => (calls.push(i), { options: ['a', 'b', 'c'], costUsd: 0.0004, provider: 'fal', model: 'google/gemini-2.5-flash' });
  const id = await queued();
  await runSuggestion(pool, suggest, id);
  expect(calls).toEqual([input]);
  expect(await row(id)).toEqual({ status: 'succeeded', output: ['a', 'b', 'c'], cost_usd: '0.000400' });
  await runSuggestion(pool, suggest, id); // a repeated delivery does nothing
  expect(calls).toHaveLength(1);
  expect(await ledger(id)).toEqual([{ kind: 'llm', usd: '0.0004', user_id: 'u1', team_id: 'team-unassigned', job_id: null, model: 'google/gemini-2.5-flash', is_final: true }]);
});

test('books no ledger row for a run without a cost or a failed call', async () => {
  const free = await queued();
  await runSuggestion(pool, async () => ({ options: ['a'], costUsd: 0, provider: 'fal', model: 'google/gemini-2.5-flash' }), free);
  const unknown = await queued();
  await runSuggestion(pool, async () => ({ options: ['a'], costUsd: null, provider: 'fal', model: 'google/gemini-2.5-flash' }), unknown);
  const failing = await queued();
  await expect(runSuggestion(pool, async () => Promise.reject(new Error('down')), failing)).rejects.toThrow('down');
  for (const id of [free, unknown, failing]) expect(await ledger(id)).toEqual([]);
});

test("a failed call or a missing suggester marks the run failed; a run past the page's wait (90 s) is not sent at all", async () => {
  const failing = await queued();
  await expect(runSuggestion(pool, async () => Promise.reject(new Error('rate limited')), failing)).rejects.toThrow('rate limited');
  expect((await row(failing)).status).toBe('failed');
  const none = await queued();
  await expect(runSuggestion(pool, undefined, none)).rejects.toThrow('FAL_KEY');
  expect((await row(none)).status).toBe('failed');
  let called = false;
  const stale = await queued(91);
  await runSuggestion(pool, async () => ((called = true), { options: ['x'], costUsd: null, provider: 'fal', model: 'google/gemini-2.5-flash' }), stale);
  expect(called).toBe(false);
  expect((await row(stale)).status).toBe('queued'); // the page marks it failed when it polls
});

test('the e2e stand-in answers three options from the text, within the limit', async () => {
  expect(await fakeSuggester({ field: 'script', text: '', context: '', max: 12 })).toEqual({
    options: ['Option 1: sc', 'Option 2: sc', 'Option 3: sc'],
    meanings: ['Reading 1: script', 'Reading 2: script', 'Reading 3: script'],
    costUsd: 0,
    provider: 'mock',
    model: 'fake',
  });
  expect(await fakeSuggester({ field: 'translate', text: 'slow turn', context: '', max: 100 })).toEqual({ options: ['Translation: slow turn'], costUsd: 0, provider: 'mock', model: 'fake' });
});

test('an option with a Vietnamese reading is stored as text and vi, one without as its text', async () => {
  const id = await queued();
  await runSuggestion(pool, async () => ({ options: ['a', 'b'], meanings: ['nghĩa a', null], costUsd: 0, provider: 'fal', model: 'google/gemini-2.5-flash' }), id);
  expect((await row(id)).output).toEqual([{ text: 'a', vi: 'nghĩa a' }, 'b']);
});
