// The Replicate credit and guard against a disposable database (needs the compose Postgres: `pnpm services:up`); nothing reaches a provider.
import { bookShared } from '@cvs/core/ledger';
import { replicateCredit } from '@cvs/core/providers/balances';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, describe, expect, test } from 'vitest';
import { replicateGuard } from './replicate-guard';

const testDb = await createTestDatabase();
const pool = createPool(testDb.url);

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

let ref = 0;
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
    expect(await replicateGuard(pool)).toEqual([]);
    expect([await enabled(), await modelAudits()]).toEqual([before, []]);
  });

  test('remaining = the credit minus the ledger rows of replicate since it was entered; at 2 USD or more nothing changes', async () => {
    await enterCredit('5');
    await book('replicate', '1.25');
    await book('fal', '9');
    await book('replicate', '-0.25'); // a release counts back
    expect(await replicateCredit(pool)).toMatchObject({ creditUsd: '5.0000', spentUsd: '1.0000', remainingUsd: 4 });
    await book('replicate', '2');
    expect((await replicateCredit(pool))?.remainingUsd).toBe(2);
    expect(await replicateGuard(pool)).toEqual([]);
    expect(await modelAudits()).toEqual([]);
  });

  test('under 2 USD turns every enabled Replicate model off and its fal twin on, audited as the system, once; fal and Vertex rows are not touched', async () => {
    await book('replicate', '0.5');
    expect((await replicateCredit(pool))?.remainingUsd).toBe(1.5);
    const before = await enabled();
    expect(await replicateGuard(pool)).toEqual(['seedance-2.0-replicate', 'veo-3.1-replicate']);
    expect(await enabled()).toEqual({ ...before, 'seedance-2.0-replicate': false, 'veo-3.1-replicate': false, 'seedance-2.0-reference': true });
    expect(await modelAudits()).toEqual([
      { actor_id: null, target: 'model:seedance-2.0-replicate', old_value: { enabled: true }, new_value: { enabled: false, replicateRemainingUsd: 1.5 } },
      { actor_id: null, target: 'model:seedance-2.0-reference', old_value: { enabled: false }, new_value: { enabled: true, replicateRemainingUsd: 1.5 } },
      { actor_id: null, target: 'model:veo-3.1-replicate', old_value: { enabled: true }, new_value: { enabled: false, replicateRemainingUsd: 1.5 } },
    ]); // veo-3.1 on fal was already on: no entry
    expect(await replicateGuard(pool)).toEqual([]);
    expect(await modelAudits()).toHaveLength(3);
  });

  test('a new credit restarts the count', async () => {
    await enterCredit('20');
    expect(await replicateCredit(pool)).toMatchObject({ creditUsd: '20.0000', spentUsd: '0.0000', remainingUsd: 20 });
    await enterCredit(null);
    expect(await replicateCredit(pool)).toBeNull();
  });
});
