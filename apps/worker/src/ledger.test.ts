// The cost ledger functions against a disposable database (needs the compose Postgres: `pnpm services:up`).
import { bookInvoice, bookShared, close24h, lateBill, reassignStore, release, reserve, settle, withTransaction } from '@cvs/core/ledger';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
const pool = createPool(testDb.url);

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

let seq = 0;
const next = (prefix: string) => `${prefix}${++seq}`;

beforeAll(async () => {
  await pool.query(`insert into users (id, email, name) values ('u1', 'u1@example.test', 'u1')`);
  await pool.query(`insert into teams (id, name) values ('team-b', 'Team B')`);
  await pool.query(`insert into stores (id, name, code) values ('store-a', 'Store A', 'A'), ('store-b', 'Store B', 'B')`);
});

type JobOpts = { status?: string; storeId?: string | null; isMock?: boolean; createdAt?: string; provider?: string; finishedAt?: string };
async function newJob(o: JobOpts = {}): Promise<string> {
  const id = next('job');
  await pool.query(
    `insert into jobs (id, user_id, team_id, store_id, model, provider, prompt, aspect, duration_s, input_asset_ids, status, is_mock, created_at, finished_at)
     values ($1, 'u1', 'team-b', $2, 'kling-o3-pro', $3, 'p', '9:16', 5, '{}', $4, $5, coalesce($6::timestamptz, now()), $7)`,
    [id, o.storeId ?? null, o.provider ?? 'fal', o.status ?? 'queued', o.isMock ?? false, o.createdAt ?? null, o.finishedAt ?? null],
  );
  return id;
}

/** A queued job with its estimate booked, moved on to `status`. */
async function reservedJob(estimate: string, o: JobOpts = {}): Promise<string> {
  const id = await newJob({ ...o, status: 'queued' });
  expect(await withTransaction(pool, (tx) => reserve(tx, id, estimate))).toBe(true);
  if (o.status && o.status !== 'queued') await pool.query('update jobs set status = $2 where id = $1', [id, o.status]);
  return id;
}

async function asset(): Promise<string> {
  const id = next('asset');
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, 'u1', 'output', $1, 'v.mp4', 'video/mp4', 1)`, [id]);
  return id;
}

const total = async (jobId: string) => (await pool.query(`select usd::text, is_final from job_costs where job_id = $1`, [jobId])).rows[0];
const rowsOf = async (jobId: string) => (await pool.query(`select kind, usd::text as usd, store_id, is_final from cost_entries where job_id = $1 order by id`, [jobId])).rows;
const statusOf = async (jobId: string) => (await pool.query('select status from jobs where id = $1', [jobId])).rows[0].status;

describe('reserve', () => {
  test('books the estimate for a queued job, once', async () => {
    const id = await newJob();
    expect(await withTransaction(pool, (tx) => reserve(tx, id, '1.2500'))).toBe(true);
    expect(await withTransaction(pool, (tx) => reserve(tx, id, '1.2500'))).toBe(false);
    expect(await rowsOf(id)).toEqual([{ kind: 'estimate', usd: '1.2500', store_id: null, is_final: false }]);
  });

  test('does not book a job that is no longer queued', async () => {
    const id = await newJob({ status: 'running' });
    expect(await withTransaction(pool, (tx) => reserve(tx, id, '1'))).toBe(false);
    expect(await rowsOf(id)).toEqual([]);
  });

  test('books 0 USD for a mock job, from reserve to settle', async () => {
    const id = await reservedJob('9.0000', { isMock: true, status: 'running' });
    expect(await settle(pool, id, { status: 'succeeded', costUsd: 9, outputAssetId: await asset(), posterAssetId: null })).toBe(true);
    expect(await rowsOf(id)).toEqual([
      { kind: 'estimate', usd: '0.0000', store_id: null, is_final: false },
      { kind: 'actual_adjustment', usd: '0.0000', store_id: null, is_final: true },
    ]);
  });
});

describe('month and day', () => {
  test.each([
    ['2026-10-31T16:59:00Z', '2026-10', '2026-10-31'], // 23:59 ICT on the last day of the month
    ['2026-10-31T17:00:00Z', '2026-11', '2026-11-01'], // 00:00 ICT the next day
  ])('a job created at %s is booked in %s (ICT)', async (createdAt, month, day) => {
    const id = await reservedJob('1.0000', { createdAt, status: 'running' });
    await settle(pool, id, { status: 'succeeded', costUsd: 2, outputAssetId: await asset(), posterAssetId: null });
    const { rows } = await pool.query(`select distinct month, day::text from cost_entries where job_id = $1`, [id]);
    expect(rows).toEqual([{ month, day }]);
  });
});

describe('settle', () => {
  test('brings a succeeded job to the larger of the reported cost and the estimate', async () => {
    const dear = await reservedJob('1.0000', { status: 'running' });
    const cheap = await reservedJob('3.0000', { status: 'running' });
    const output = await asset();
    expect(await settle(pool, dear, { status: 'succeeded', costUsd: '1.7500', outputAssetId: output, posterAssetId: null })).toBe(true);
    expect(await settle(pool, cheap, { status: 'succeeded', costUsd: 1, outputAssetId: await asset(), posterAssetId: null })).toBe(true);
    expect(await total(dear)).toEqual({ usd: '1.7500', is_final: true });
    expect(await total(cheap)).toEqual({ usd: '3.0000', is_final: true });
    expect((await pool.query('select status, output_asset_id from jobs where id = $1', [dear])).rows[0]).toEqual({ status: 'succeeded', output_asset_id: output });
  });

  test('releases the estimate of a failed job the provider did not bill, and bills one it did', async () => {
    const free = await reservedJob('2.0000', { status: 'running' });
    const billed = await reservedJob('2.0000', { status: 'running' });
    await settle(pool, free, { status: 'failed', costUsd: 0, error: 'rejected' });
    await settle(pool, billed, { status: 'failed', costUsd: 2.5, error: 'crashed late' });
    expect((await rowsOf(free)).map((r) => [r.kind, r.usd])).toEqual([['estimate', '2.0000'], ['release', '-2.0000']]);
    expect(await total(free)).toEqual({ usd: '0.0000', is_final: true });
    expect(await total(billed)).toEqual({ usd: '2.5000', is_final: true });
    expect(await statusOf(free)).toBe('failed');
  });

  test('only one of two concurrent settlements books the job', async () => {
    const id = await reservedJob('1.0000', { status: 'running' });
    const results = await Promise.all([
      settle(pool, id, { status: 'succeeded', costUsd: 4, outputAssetId: await asset(), posterAssetId: null }),
      settle(pool, id, { status: 'succeeded', costUsd: 4, outputAssetId: await asset(), posterAssetId: null }),
    ]);
    expect(results.sort()).toEqual([false, true]);
    expect((await rowsOf(id)).map((r) => r.kind)).toEqual(['estimate', 'actual_adjustment']);
  });

  test('ignores a job that is not running', async () => {
    const id = await reservedJob('1.0000', { status: 'timed_out' });
    expect(await settle(pool, id, { status: 'failed', costUsd: 0, error: 'x' })).toBe(false);
    expect(await total(id)).toEqual({ usd: '1.0000', is_final: false });
  });

  test('refuses a running job whose ledger is already closed', async () => {
    const id = await reservedJob('1.0000', { status: 'running' });
    await pool.query(
      `insert into cost_entries (kind, usd, month, day, user_id, team_id, job_id, provider, model, is_final)
       select 'actual_adjustment', 0, month, day, user_id, team_id, job_id, provider, model, true from cost_entries where job_id = $1`,
      [id],
    );
    expect(await settle(pool, id, { status: 'succeeded', costUsd: 9, outputAssetId: await asset(), posterAssetId: null })).toBe(false);
    expect(await statusOf(id)).toBe('running');
    expect((await rowsOf(id)).map((r) => r.kind)).toEqual(['estimate', 'actual_adjustment']);
  });
});

describe('release', () => {
  test('fails a queued job and takes its estimate back, once', async () => {
    const id = await reservedJob('2.0000');
    expect(await release(pool, id, 'no adapter')).toBe(true);
    expect(await release(pool, id, 'no adapter')).toBe(false);
    expect(await total(id)).toEqual({ usd: '0.0000', is_final: true });
    expect((await pool.query('select status, error from jobs where id = $1', [id])).rows[0]).toEqual({ status: 'failed', error: 'no adapter' });
  });
});

describe('lateBill', () => {
  test('bills a timed-out job to the larger of the cost and the estimate, and keeps its status', async () => {
    const id = await reservedJob('2.0000', { status: 'timed_out' });
    expect(await lateBill(pool, id, 3.5)).toBe(true);
    expect(await lateBill(pool, id, 3.5)).toBe(false);
    expect((await rowsOf(id)).map((r) => [r.kind, r.usd])).toEqual([['estimate', '2.0000'], ['late_bill', '1.5000']]);
    expect(await total(id)).toEqual({ usd: '3.5000', is_final: true });
    expect(await statusOf(id)).toBe('timed_out');
  });

  test('releases the estimate when the provider reports no charge for a failed job', async () => {
    const id = await reservedJob('2.0000', { status: 'timed_out' });
    expect(await lateBill(pool, id, 0)).toBe(true);
    expect(await total(id)).toEqual({ usd: '0.0000', is_final: true });
  });

  test('keeps the estimate of a late success that reports no cost', async () => {
    const id = await reservedJob('2.0000', { status: 'failed_unknown' });
    expect(await lateBill(pool, id, 0, true)).toBe(true);
    expect(await total(id)).toEqual({ usd: '2.0000', is_final: true });
  });

  test('ignores a job that is still running', async () => {
    const id = await reservedJob('2.0000', { status: 'running' });
    expect(await lateBill(pool, id, 5)).toBe(false);
  });
});

describe('close24h', () => {
  test('closes a job 24 hours after its timeout with a final 0 USD row that keeps the estimate', async () => {
    const id = await reservedJob('2.0000', { status: 'timed_out', finishedAt: new Date(Date.now() - 23 * 3_600_000).toISOString() });
    expect(await close24h(pool, id)).toBe(false);
    await pool.query(`update jobs set finished_at = now() - interval '25 hours' where id = $1`, [id]);
    expect(await close24h(pool, id)).toBe(true);
    expect(await close24h(pool, id)).toBe(false);
    expect((await rowsOf(id)).map((r) => [r.kind, r.usd, r.is_final])).toEqual([['estimate', '2.0000', false], ['actual_adjustment', '0.0000', true]]);
    expect(await total(id)).toEqual({ usd: '2.0000', is_final: true });
  });

  test('also closes a failed_unknown job', async () => {
    const id = await reservedJob('1.0000', { status: 'failed_unknown', finishedAt: new Date(Date.now() - 25 * 3_600_000).toISOString() });
    expect(await close24h(pool, id)).toBe(true);
  });
});

describe('reassignStore', () => {
  const perStore = async (jobId: string) =>
    (await pool.query(`select store_id, sum(usd)::text as usd from cost_entries where job_id = $1 group by store_id order by store_id`, [jobId])).rows;

  test('moves the net balance to the new store as a pair, and later rows follow', async () => {
    const id = await reservedJob('3.0000', { storeId: 'store-a', status: 'running' });
    expect(await reassignStore(pool, id, 'store-b')).toBe(true);
    expect(await reassignStore(pool, id, 'store-b')).toBe(false);
    expect((await rowsOf(id)).map((r) => [r.kind, r.usd, r.store_id])).toEqual([
      ['estimate', '3.0000', 'store-a'],
      ['store_reassign', '-3.0000', 'store-a'],
      ['store_reassign', '3.0000', 'store-b'],
    ]);
    await settle(pool, id, { status: 'succeeded', costUsd: 5, outputAssetId: await asset(), posterAssetId: null });
    expect(await perStore(id)).toEqual([{ store_id: 'store-a', usd: '0.0000' }, { store_id: 'store-b', usd: '5.0000' }]);
    expect(await total(id)).toEqual({ usd: '5.0000', is_final: true });
  });

  test('moves a job with no store to a store and back to none', async () => {
    const id = await reservedJob('2.0000');
    await reassignStore(pool, id, 'store-a');
    await reassignStore(pool, id, null);
    expect(await perStore(id)).toEqual([{ store_id: 'store-a', usd: '0.0000' }, { store_id: null, usd: '2.0000' }]);
    expect((await pool.query('select store_id from jobs where id = $1', [id])).rows[0].store_id).toBeNull();
  });

  test('writes no rows for a mock job, which has no balance to move', async () => {
    const id = await reservedJob('2.0000', { isMock: true });
    await reassignStore(pool, id, 'store-a');
    expect((await rowsOf(id)).map((r) => r.usd)).toEqual(['0.0000']);
  });
});

describe('bookShared', () => {
  test('books a bake-off row once per ref', async () => {
    const entry = { kind: 'bakeoff' as const, usd: '12.3400', month: '2026-08', provider: 'fal', ref: 'bakeoff-2026-08-fal' };
    expect(await bookShared(pool, entry)).toBe(true);
    expect(await bookShared(pool, entry)).toBe(false);
    const { rows } = await pool.query(`select usd::text, is_final, job_id, user_id, team_id from cost_entries where ref = 'bakeoff-2026-08-fal'`);
    expect(rows).toEqual([{ usd: '12.3400', is_final: true, job_id: null, user_id: null, team_id: null }]);
  });

  test('requires a note on a manual adjustment', async () => {
    await expect(bookShared(pool, { kind: 'manual_adjustment', usd: -1, month: '2026-10', ref: 'adj-no-note' })).rejects.toThrow(/cost_entries_manual_note_check/);
    expect(await bookShared(pool, { kind: 'manual_adjustment', usd: -1, month: '2026-10', ref: 'adj-refund', note: 'refund from the provider' })).toBe(true);
  });

  test('refuses a row without a ref, so a re-run cannot book it twice', async () => {
    const before = (await pool.query('select count(*)::int as n from cost_entries')).rows[0].n;
    for (const ref of ['', '  ', undefined]) {
      await expect(bookShared(pool, { kind: 'bakeoff', usd: 1, month: '2026-10', provider: 'fal', ref } as unknown as Parameters<typeof bookShared>[1])).rejects.toThrow(/needs a ref/);
    }
    expect((await pool.query('select count(*)::int as n from cost_entries')).rows[0].n).toBe(before);
  });
});

describe('bookInvoice', () => {
  test('books the difference to the ledger, and a re-entry books only what is new', async () => {
    const month = '2026-09';
    const id = await reservedJob('2.0000', { createdAt: '2026-09-15T05:00:00Z', provider: 'replicate', status: 'running' });
    await settle(pool, id, { status: 'succeeded', costUsd: 5, outputAssetId: await asset(), posterAssetId: null });
    await bookShared(pool, { kind: 'bakeoff', usd: 2, month, provider: 'replicate', ref: 'bakeoff-2026-09-replicate' });
    const invoiceDiffs = async () => (await pool.query(`select usd::text, ref from cost_entries where kind = 'invoice_diff' and month = $1 order by id`, [month])).rows;

    expect(await bookInvoice(pool, { month, provider: 'replicate', totalUsd: 10 })).toBe('3.0000'); // 10 - (5 + 2)
    expect(await bookInvoice(pool, { month, provider: 'replicate', totalUsd: '10.0000' })).toBe('0.0000');
    expect(await invoiceDiffs()).toEqual([{ usd: '3.0000', ref: 'invoice-2026-09-replicate-1' }]);

    expect(await bookInvoice(pool, { month, provider: 'replicate', totalUsd: 9.5 })).toBe('-0.5000');
    expect(await invoiceDiffs()).toEqual([{ usd: '3.0000', ref: 'invoice-2026-09-replicate-1' }, { usd: '-0.5000', ref: 'invoice-2026-09-replicate-2' }]);
    expect((await pool.query(`select sum(usd)::text as usd from cost_entries where month = $1 and provider = 'replicate'`, [month])).rows[0].usd).toBe('9.5000');
    expect((await pool.query(`select total_usd::text from provider_invoices where month = $1 and provider = 'replicate'`, [month])).rows).toEqual([{ total_usd: '9.5000' }]);
  });

  test('refuses a month that is not YYYY-MM', async () => {
    await expect(bookInvoice(pool, { month: '2026-9', provider: 'fal', totalUsd: 1 })).rejects.toThrow(/not a month/);
  });
});
