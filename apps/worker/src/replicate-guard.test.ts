// The Replicate credit and guard against a disposable database (needs the compose Postgres: `pnpm services:up`); nothing reaches a provider.
import { bookInvoice, bookShared, release, reserve, withTransaction } from '@cvs/core/ledger';
import { replicateCredit } from '@cvs/core/providers/balances';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { replicateGuard } from './replicate-guard';

const testDb = await createTestDatabase();
const pool = createPool(testDb.url);

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

beforeAll(async () => {
  await pool.query(`insert into users (id, email, name) values ('u1', 'u1@example.test', 'u1')`);
  await pool.query(`insert into teams (id, name) values ('team-b', 'Team B')`);
});

let ref = 0;
/** A queued Replicate job created now with its estimate booked. */
async function replicateJob(estimate: string): Promise<string> {
  const id = `guard-job-${ref++}`;
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status) values ($1, 'u1', 'team-b', 'seedance-2.5', 'replicate', 'p', '9:16', 5, '{}', 'queued')`,
    [id],
  );
  expect(await withTransaction(pool, (tx) => reserve(tx, id, estimate))).toBe(true);
  return id;
}
const book = (provider: string, usd: string) => bookShared(pool, { kind: 'manual_adjustment', usd, month: '2026-11', provider, ref: `guard-test-${ref++}`, note: 'guard test' });
const enterCredit = (usd: string | null) => pool.query(`update settings set replicate_credit_usd = $1, replicate_credit_since = case when $1::numeric is null then null else now() end where id = 1`, [usd]);
const enabled = async () =>
  Object.fromEntries((await pool.query(`select id, enabled from model_configs where provider in ('replicate', 'fal', 'vertex') order by id`)).rows.map((r) => [r.id, r.enabled]));
const modelAudits = async () => (await pool.query(`select actor_id, target, old_value, new_value from audit_entries where action = 'model.set_enabled' order by id`)).rows;

describe('the Replicate guard', () => {
  test('does nothing until the Admin enters the credit', async () => {
    await pool.query(`update model_configs set enabled = true where id in ('seedance-2.0-replicate', 'veo-3.1-replicate', 'veo-3.1')`);
    await book('replicate', '100');
    expect(await replicateCredit(pool)).toBeNull();
    const before = await enabled();
    expect(await replicateGuard(pool, true)).toEqual([]);
    expect([await enabled(), await modelAudits()]).toEqual([before, []]);
  });

  test('remaining = the balance minus the replicate spending of the credit period; at 2 USD or more nothing changes', async () => {
    const before = await replicateJob('3');
    await enterCredit('5');
    expect(await release(pool, before, 'refused')).toBe(true); // a job sent before the balance was entered: neither its hold nor its release counts
    await bookInvoice(pool, { month: '2026-10', provider: 'replicate', totalUsd: '50' }, null); // a month's invoice difference is not spending
    await replicateJob('1.25');
    await book('fal', '9');
    await book('replicate', '-0.25'); // a manual row after the balance counts, either way
    expect(await replicateCredit(pool)).toMatchObject({ creditUsd: '5.0000', spentUsd: '1.0000', remainingUsd: 4 });
    await book('replicate', '2');
    expect((await replicateCredit(pool))?.remainingUsd).toBe(2);
    expect(await replicateGuard(pool, true)).toEqual([]);
    expect(await modelAudits()).toEqual([]);
  });

  test('under 2 USD on a worker without FAL_KEY turns the Replicate models off and leaves their fal twins off', async () => {
    await book('replicate', '0.5');
    expect((await replicateCredit(pool))?.remainingUsd).toBe(1.5);
    const before = await enabled();
    expect(await replicateGuard(pool, false)).toEqual(['seedance-2.0-replicate', 'veo-3.1-replicate']);
    expect(await enabled()).toEqual({ ...before, 'seedance-2.0-replicate': false, 'veo-3.1-replicate': false });
    expect((await modelAudits()).map((a) => a.target)).toEqual(['model:seedance-2.0-replicate', 'model:veo-3.1-replicate']);
    await pool.query(`delete from audit_entries where action = 'model.set_enabled'`);
    await pool.query(`update model_configs set enabled = true where id in ('seedance-2.0-replicate', 'veo-3.1-replicate')`); // an Admin turns them back on
  });

  test('under 2 USD turns every enabled Replicate model off and its fal twin on, audited as the system, once; fal and Vertex rows are not touched', async () => {
    const before = await enabled();
    expect(await replicateGuard(pool, true)).toEqual(['seedance-2.0-replicate', 'veo-3.1-replicate']);
    expect(await enabled()).toEqual({ ...before, 'seedance-2.0-replicate': false, 'veo-3.1-replicate': false, 'seedance-2.0-reference': true });
    expect(await modelAudits()).toEqual([
      { actor_id: null, target: 'model:seedance-2.0-replicate', old_value: { enabled: true }, new_value: { enabled: false, replicateRemainingUsd: 1.5 } },
      { actor_id: null, target: 'model:seedance-2.0-reference', old_value: { enabled: false }, new_value: { enabled: true, replicateRemainingUsd: 1.5 } },
      { actor_id: null, target: 'model:veo-3.1-replicate', old_value: { enabled: true }, new_value: { enabled: false, replicateRemainingUsd: 1.5 } },
    ]); // veo-3.1 on fal was already on: no entry
    expect(await replicateGuard(pool, true)).toEqual([]);
    expect(await modelAudits()).toHaveLength(3);
  });

  test('a new credit restarts the count', async () => {
    await enterCredit('20');
    expect(await replicateCredit(pool)).toMatchObject({ creditUsd: '20.0000', spentUsd: '0.0000', remainingUsd: 20 });
    await enterCredit(null);
    expect(await replicateCredit(pool)).toBeNull();
  });
});
