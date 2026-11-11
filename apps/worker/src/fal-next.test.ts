// The fal account switch against a disposable database (needs the compose Postgres: `pnpm services:up`); both fal accounts and Lark are stubs.
import type { FalBalance } from '@cvs/core/providers/balances';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { falActive, falNext } from './fal-next';

const testDb = await createTestDatabase();
const pool = createPool(testDb.url);

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

beforeAll(async () => {
  await pool.query('update settings set balance_warning_usd = 10 where id = 1');
  await pool.query(`insert into users (id, email, name, role) values ('admin-a', 'admin-a@example.test', 'admin-a', 'admin')`);
  await pool.query(`insert into accounts (id, user_id, account_id, provider_id) values ('acc-a', 'admin-a', 'ou_a', 'lark')`);
});

beforeEach(async () => {
  await pool.query('update settings set fal_next_at = null where id = 1');
  await pool.query(`delete from audit_entries where action = 'fal.switch'`);
});

type Job = { providerJobId: string };
/** A stub account: submit answers `<name>-<n>` or throws `fail`; status and cancel record the id they were asked about. */
function account(name: string, fail?: Error) {
  const calls: string[] = [];
  let n = 0;
  return {
    calls,
    provider: {
      async submit(_req: string) {
        calls.push('submit');
        if (fail) throw fail;
        return { providerJobId: `${name}-${++n}` };
      },
      async status(job: Job) {
        calls.push(`status ${job.providerJobId}`);
        return name;
      },
      async cancel(job: Job) {
        calls.push(`cancel ${job.providerJobId}`);
        return { supported: false };
      },
    },
  };
}
const usd = (balance: number) => async (): Promise<FalBalance> => ({ ok: true, balance, currency: 'USD' });

test('jobs go to the personal account while it works; a job keeps its account, and an id from before the switch existed is the personal one', async () => {
  const personal = account('p');
  const team = account('t');
  const fal = falNext(personal.provider, team.provider, { pool, readPersonal: usd(28) });
  expect(await fal.submit('req')).toEqual({ providerJobId: 'acct:personal|p-1' });
  expect(await fal.status({ providerJobId: 'acct:personal|p-1' })).toBe('p');
  expect(await fal.status({ providerJobId: '5:old-request' })).toBe('p');
  expect(personal.calls).toEqual(['submit', 'status p-1', 'status 5:old-request']);
  expect(team.calls).toEqual([]);
  expect(await falActive(pool)).toBe('personal');
});

test('a failed personal submit under the warning threshold switches once: audited, the Admins told on Lark, the job sent to the team, later ones too', async () => {
  const personal = account('p', new Error('fal submit: HTTP 403 {"detail":"User is locked. Reason: Exhausted balance."}'));
  const team = account('t');
  const sent: [string, string][] = [];
  const fal = falNext(personal.provider, team.provider, { pool, readPersonal: usd(0.42), send: async (id, text) => void sent.push([id, text]) });

  expect(await fal.submit('req')).toEqual({ providerJobId: 'acct:team|t-1' });
  expect(await falActive(pool)).toBe('team');
  expect(await fal.submit('req')).toEqual({ providerJobId: 'acct:team|t-2' }); // straight to the team now
  expect(personal.calls).toEqual(['submit']);
  expect(await fal.status({ providerJobId: 'acct:personal|p-9' })).toBe('p'); // sent before the switch: still polled on the personal account

  const audits = (await pool.query(`select actor_id, old_value, new_value from audit_entries where action = 'fal.switch'`)).rows;
  expect(audits).toEqual([{ actor_id: null, old_value: { account: 'personal', balance: 0.42 }, new_value: { account: 'team', error: 'fal submit: HTTP 403 {"detail":"User is locked. Reason: Exhausted balance."}' } }]);
  expect(sent).toHaveLength(1);
  expect(sent[0]![0]).toBe('ou_a');
  expect(sent[0]![1]).toContain('tài khoản fal cá nhân đã hết tiền (còn $0.42)');
});

test('a failed personal submit with money left, or an unreadable balance, is the job own failure: no switch, nothing sent to the team', async () => {
  const boom = new Error('fal submit: HTTP 422 content policy');
  for (const readPersonal of [usd(15), async (): Promise<FalBalance> => ({ ok: false, reason: 'failed', error: 'down' })]) {
    const team = account('t');
    const fal = falNext(account('p', boom).provider, team.provider, { pool, readPersonal });
    await expect(fal.submit('req')).rejects.toBe(boom);
    expect(team.calls).toEqual([]);
    expect(await falActive(pool)).toBe('personal');
  }
  expect((await pool.query(`select count(*)::int as n from audit_entries where action = 'fal.switch'`)).rows[0].n).toBe(0);
});

test('after the switch a failed team submit is thrown as it is', async () => {
  await pool.query('update settings set fal_next_at = now() where id = 1');
  const boom = new Error('fal submit: HTTP 500');
  const personal = account('p');
  const fal = falNext(personal.provider, account('t', boom).provider, { pool, readPersonal: usd(0) });
  await expect(fal.submit('req')).rejects.toBe(boom);
  expect(personal.calls).toEqual([]);
});
