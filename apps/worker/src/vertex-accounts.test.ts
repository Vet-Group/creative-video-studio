// The Vertex tick against a disposable database (needs the compose Postgres: `pnpm services:up`); the billing reads are fakes, so no test reaches Google.
import { bookShared } from '@cvs/core/ledger';
import type { SkuMonth, VertexBilling } from '@cvs/core/providers/vertex-billing';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { vertexTick, vertexTicker } from './vertex-accounts';

const testDb = await createTestDatabase();
const pool = createPool(testDb.url);

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

beforeEach(async () => {
  await pool.query(`update settings set vertex_active_project = null where id = 1`);
  await pool.query(`delete from vertex_accounts where project_id <> 'cvs-vertex'`);
});

const sku = (month: string, costUsd: number): SkuMonth => ({ month, skuId: '4D50-275D-FC3F', sku: 'Veo', usage: 1, unit: 'count', cost: costUsd * 26_000, costUsd, credits: -costUsd * 26_000, creditsUsd: -costUsd });
const ok = (rows: SkuMonth[], creditsVnd = 0): VertexBilling => ({ ok: true, currency: 'VND', rate: 26_000, creditsAllTime: -creditsVnd, creditsAllTimeUsd: -creditsVnd / 26_000, rows });
const account = (project: string, result: VertexBilling | Error) => ({ project, read: async () => (result instanceof Error ? Promise.reject(result) : result) });

const active = async () => (await pool.query('select vertex_active_project as p from settings where id = 1')).rows[0].p as string | null;
const switches = async () => (await pool.query(`select actor_id, old_value, new_value from audit_entries where action = 'vertex.switch_account' order by id`)).rows;
const invoice = async (month: string) => (await pool.query(`select total_usd::text as total from provider_invoices where month = $1 and provider = 'vertex'`, [month])).rows[0]?.total as string | undefined;
const diffs = async (month: string) => (await pool.query(`select usd::text from cost_entries where month = $1 and provider = 'vertex' and kind = 'invoice_diff' order by id`, [month])).rows.map((r) => r.usd);
const invoiceAudits = async (month: string) =>
  (await pool.query(`select actor_id, old_value, new_value from audit_entries where action = 'invoice.enter' and target = $1 order by id`, [`invoice:${month}:vertex`])).rows;

describe('the credits guard', () => {
  test('makes the first usable account active and audits a switch as the system, once', async () => {
    await pool.query(`insert into vertex_accounts (project_id) values ('next-project')`);
    const accounts = (credits: number) => [account('cvs-vertex', ok([], credits)), account('next-project', ok([]))];
    await vertexTick(pool, accounts(0), new Date('2026-11-10T00:00:00Z'));
    expect(await active()).toBe('cvs-vertex');
    await vertexTick(pool, accounts(0), new Date('2026-11-11T00:00:00Z'));
    expect(await switches()).toEqual([{ actor_id: null, old_value: { project: null }, new_value: { project: 'cvs-vertex' } }]);
    // cvs-vertex is set to stop when its credits end: under $15 left moves new jobs to the next account.
    await vertexTick(pool, accounts(7_825_800 - 10 * 26_000), new Date('2026-11-12T00:00:00Z'));
    expect(await active()).toBe('next-project');
    expect((await switches()).at(-1)).toEqual({ actor_id: null, old_value: { project: 'cvs-vertex', remainingUsd: 10, expiresOn: '2026-12-30', unverified: false }, new_value: { project: 'next-project' } });
  });

  test('fails closed on an account set to stop whose export is unreadable, keeps one that is not set to stop, and leaves none active when none is usable', async () => {
    await vertexTick(pool, [account('cvs-vertex', ok([]))], new Date('2026-11-10T00:00:00Z'));
    expect(await active()).toBe('cvs-vertex');
    await vertexTick(pool, [account('cvs-vertex', { ok: false, reason: 'no_access', error: '403' }), account('next-project', new Error('timeout'))], new Date('2026-11-10T01:00:00Z'));
    expect(await active()).toBe('next-project'); // next-project has no row, so it is not set to stop
    expect((await switches()).at(-1)).toMatchObject({ old_value: { project: 'cvs-vertex', unverified: true } });
    await vertexTick(pool, [account('cvs-vertex', new Error('timeout'))], new Date('2026-11-10T02:00:00Z'));
    expect(await active()).toBeNull();
  });
});

describe('the invoice booking', () => {
  test('books the summed total of every account for the month, audited as the system, and a second run books nothing new', async () => {
    const accounts = [account('cvs-vertex', ok([sku('2026-10', 2.7574), sku('2026-11', 1.5)])), account('next-project', ok([sku('2026-11', 3.41613)]))];
    await vertexTick(pool, accounts, new Date('2026-11-20T00:00:00Z'));
    expect(await invoice('2026-11')).toBe('4.9161');
    expect(await diffs('2026-11')).toEqual(['4.9161']);
    expect(await invoice('2026-10')).toBeUndefined(); // after the 5th only the current month
    await vertexTick(pool, accounts, new Date('2026-11-21T00:00:00Z'));
    expect(await diffs('2026-11')).toEqual(['4.9161']);
    expect(await invoiceAudits('2026-11')).toEqual([{ actor_id: null, old_value: null, new_value: { totalUsd: '4.9161', bookedUsd: '4.9161' } }]);
  });

  test('books the previous month too until the 5th, skips a month with no rows, and books nothing when an account was not read', async () => {
    await vertexTick(pool, [account('cvs-vertex', ok([sku('2026-08', 1)])), account('next-project', { ok: false, reason: 'no_export', error: '404' })], new Date('2026-09-03T00:00:00Z'));
    expect(await invoice('2026-08')).toBeUndefined();
    await vertexTick(pool, [account('cvs-vertex', ok([sku('2026-08', 1)])), account('next-project', new Error('HTTP 500'))], new Date('2026-09-03T00:00:00Z'));
    expect(await invoice('2026-08')).toBeUndefined();
    await vertexTick(pool, [account('cvs-vertex', ok([sku('2026-08', 1)])), account('next-project', ok([]))], new Date('2026-09-03T00:00:00Z'));
    expect(await invoice('2026-08')).toBe('1.0000');
    expect(await invoice('2026-09')).toBeUndefined(); // no row yet: never booked as 0
    await vertexTick(pool, [account('cvs-vertex', ok([sku('2026-08', 1.25)]))], new Date('2026-09-05T23:00:00Z'));
    expect(await diffs('2026-08')).toEqual(['1.0000', '0.2500']);
    await vertexTick(pool, [account('cvs-vertex', ok([sku('2026-08', 9)]))], new Date('2026-09-06T00:00:00Z'));
    expect(await invoice('2026-08')).toBe('1.2500');
  });

  test('never lowers the current month below what the ledger holds, but books a negative difference on the previous month', async () => {
    await bookShared(pool, { kind: 'bakeoff', usd: '5', month: '2026-05', provider: 'vertex', ref: 'vertex-test-2026-05' });
    await vertexTick(pool, [account('cvs-vertex', ok([sku('2026-05', 4.9161)]))], new Date('2026-05-20T00:00:00Z'));
    expect([await invoice('2026-05'), await diffs('2026-05')]).toEqual([undefined, []]); // the export lags: skipped
    await vertexTick(pool, [account('cvs-vertex', ok([sku('2026-05', 6)]))], new Date('2026-05-21T00:00:00Z'));
    expect(await diffs('2026-05')).toEqual(['1.0000']);
    await vertexTick(pool, [account('cvs-vertex', ok([sku('2026-05', 5.5)]))], new Date('2026-05-22T00:00:00Z'));
    expect(await diffs('2026-05')).toEqual(['1.0000']); // 5.5 is below the 6 the ledger now holds
    await vertexTick(pool, [account('cvs-vertex', ok([sku('2026-05', 5.5)]))], new Date('2026-06-02T00:00:00Z'));
    expect([await invoice('2026-05'), await diffs('2026-05')]).toEqual(['5.5000', ['1.0000', '-0.5000']]);
  });

  test('the hourly ticker runs the guard each hour but books once a UTC day, retrying the next hour when a read failed', async () => {
    let google: VertexBilling | Error = ok([sku('2026-01', 1)]);
    const tick = vertexTicker(pool, [{ project: 'cvs-vertex', read: async () => (google instanceof Error ? Promise.reject(google) : google) }]);
    await tick(new Date('2026-01-10T00:10:00Z'));
    expect(await invoice('2026-01')).toBe('1.0000');
    google = ok([sku('2026-01', 2)]);
    await tick(new Date('2026-01-10T01:10:00Z'));
    expect(await invoice('2026-01')).toBe('1.0000');
    google = new Error('HTTP 500');
    await tick(new Date('2026-01-11T00:10:00Z'));
    expect(await active()).toBeNull(); // the guard still ran, and failed closed
    google = ok([sku('2026-01', 2)]);
    await tick(new Date('2026-01-11T01:10:00Z'));
    expect([await invoice('2026-01'), await active()]).toEqual(['2.0000', 'cvs-vertex']);
  });
});
