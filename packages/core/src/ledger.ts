// The only code that writes cost_entries and the job status that goes with it (plan M.2, ARCHITECTURE "Cost ledger").
// Every function locks the job row (FOR UPDATE) and checks its status in the same transaction as the status change, so two
// reconcile loops cannot book a job twice. Money is summed in whole 1/10000 USD, never as floats. A mock job books 0 USD.
// Plain SQL over a structural pg interface keeps this package free of database dependencies.

export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

/** A pg.Pool, as far as the ledger needs it. */
export interface LedgerPool extends Queryable {
  connect(): Promise<Queryable & { release(): void }>;
}

export type SharedKind = 'bakeoff' | 'manual_adjustment';
type JobCostKind = 'estimate' | 'actual_adjustment' | 'release' | 'late_bill' | 'store_reassign';

interface JobRow {
  id: string;
  status: string;
  user_id: string;
  team_id: string;
  store_id: string | null;
  provider: string;
  model: string;
  is_mock: boolean;
  /** The job has been timed out or lost for 24 hours. */
  stale: boolean;
  /** ICT month 'YYYY-MM' and date 'YYYY-MM-DD' of the job's Run. */
  month: string;
  day: string;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const units = (usd: string | number): number => {
  const n = Math.round(Number(usd) * 10_000);
  if (!Number.isFinite(n)) throw new Error(`not an amount: ${usd}`);
  return n;
};
const fmt = (u: number): string => (u / 10_000).toFixed(4);

/** Runs `fn` in one transaction on its own connection. */
export async function withTransaction<T>(pool: LedgerPool, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

async function lockJob(tx: Queryable, jobId: string): Promise<JobRow> {
  const { rows } = await tx.query(
    `select id, status, user_id, team_id, store_id, provider, model, is_mock,
            coalesce(finished_at <= now() - interval '24 hours', false) as stale,
            to_char(created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as month,
            (created_at at time zone 'Asia/Ho_Chi_Minh')::date::text as day
       from jobs where id = $1 for update`,
    [jobId],
  );
  if (!rows[0]) throw new Error(`job ${jobId} does not exist`);
  return rows[0];
}

/** The job's rows so far: their sum and the sum of the estimate, in 1/10000 USD, how many there are, and whether one closes the job. */
async function balance(tx: Queryable, jobId: string): Promise<{ total: number; estimate: number; rows: number; final: boolean }> {
  const { rows } = await tx.query(
    `select coalesce(sum(usd), 0)::text as total, coalesce(sum(usd) filter (where kind = 'estimate'), 0)::text as estimate,
            count(*)::int as rows, coalesce(bool_or(is_final), false) as final
       from cost_entries where job_id = $1`,
    [jobId],
  );
  return { total: units(rows[0].total), estimate: units(rows[0].estimate), rows: rows[0].rows, final: rows[0].final };
}

async function append(tx: Queryable, job: JobRow, row: { kind: JobCostKind; usd: number; isFinal: boolean; storeId?: string | null }): Promise<void> {
  await tx.query(
    `insert into cost_entries (kind, usd, month, day, user_id, team_id, store_id, job_id, provider, model, is_final)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [row.kind, job.is_mock ? fmt(0) : fmt(row.usd), job.month, job.day, job.user_id, job.team_id, row.storeId === undefined ? job.store_id : row.storeId, job.id, job.provider, job.model, row.isFinal],
  );
}

/** Closes the job with a row that brings its total to `target`. */
async function bookTo(tx: Queryable, job: JobRow, kind: 'actual_adjustment' | 'late_bill' | 'release', target: number, total: number): Promise<void> {
  await append(tx, job, { kind, usd: target - total, isFinal: true });
}

/** The larger of the reported cost and the estimate (plan v3 rule); an unbilled failure (cost 0) goes to 0. */
function closingRow(costUsd: string | number, estimate: number, unbilledAsRelease: boolean): { kind: 'actual_adjustment' | 'release'; target: number } {
  const cost = units(costUsd);
  return cost === 0 && unbilledAsRelease ? { kind: 'release', target: 0 } : { kind: 'actual_adjustment', target: Math.max(cost, estimate) };
}

/** The reservation, written in the transaction that inserts the job (status queued). False when the job is not queued or already has rows. */
export async function reserve(tx: Queryable, jobId: string, estimateUsd: string | number): Promise<boolean> {
  const job = await lockJob(tx, jobId);
  if (job.status !== 'queued' || (await balance(tx, jobId)).rows > 0) return false;
  await append(tx, job, { kind: 'estimate', usd: units(estimateUsd), isFinal: false });
  return true;
}

export type Settlement =
  | { status: 'succeeded'; costUsd: string | number; outputAssetId: string; posterAssetId: string | null }
  | { status: 'failed'; costUsd: string | number; error: string };

/** A running job reached the provider's final state: succeeded, or failed with the cost the provider reports (0 means unbilled). False when it is no longer running. */
export async function settle(pool: LedgerPool, jobId: string, s: Settlement): Promise<boolean> {
  return withTransaction(pool, async (tx) => {
    const job = await lockJob(tx, jobId);
    if (job.status !== 'running') return false;
    const bal = await balance(tx, jobId);
    const { kind, target } = closingRow(s.costUsd, bal.estimate, s.status === 'failed');
    await bookTo(tx, job, kind, target, bal.total);
    if (s.status === 'succeeded') {
      await tx.query(`update jobs set status = 'succeeded', output_asset_id = $2, poster_asset_id = $3, finished_at = now() where id = $1`, [jobId, s.outputAssetId, s.posterAssetId]);
    } else {
      await tx.query(`update jobs set status = 'failed', error = $2, finished_at = now() where id = $1`, [jobId, s.error]);
    }
    return true;
  });
}

/** A failure the provider did not bill: brings the job to 0. A queued, submitting or running job becomes failed; a timed-out one keeps its status. False when the job is already closed. */
export async function release(pool: LedgerPool, jobId: string, error: string): Promise<boolean> {
  return withTransaction(pool, async (tx) => {
    const job = await lockJob(tx, jobId);
    const bal = await balance(tx, jobId);
    if (bal.final || bal.rows === 0 || !['queued', 'submitting', 'running', 'timed_out', 'failed_unknown'].includes(job.status)) return false;
    await bookTo(tx, job, 'release', 0, bal.total);
    await tx.query(`update jobs set status = case when status in ('timed_out', 'failed_unknown') then status else 'failed' end, error = $2, finished_at = coalesce(finished_at, now()) where id = $1`, [jobId, error]);
    return true;
  });
}

/** The provider reported a final cost for a job we had given up on (timed_out or failed_unknown). A cost of 0 means unbilled and releases the estimate. */
export async function lateBill(pool: LedgerPool, jobId: string, costUsd: string | number): Promise<boolean> {
  return withTransaction(pool, async (tx) => {
    const job = await lockJob(tx, jobId);
    const bal = await balance(tx, jobId);
    if (bal.final || bal.rows === 0 || !['timed_out', 'failed_unknown'].includes(job.status)) return false;
    const { kind, target } = closingRow(costUsd, bal.estimate, true);
    await bookTo(tx, job, kind === 'release' ? 'release' : 'late_bill', target, bal.total);
    return true;
  });
}

/** A job still unresolved 24 h after its timeout keeps its estimate and is closed with a final 0 USD actual_adjustment. False when it is not that old, not timed out, or already closed. */
export async function close24h(pool: LedgerPool, jobId: string): Promise<boolean> {
  return withTransaction(pool, async (tx) => {
    const job = await lockJob(tx, jobId);
    const bal = await balance(tx, jobId);
    if (bal.final || bal.rows === 0 || !job.stale || !['timed_out', 'failed_unknown'].includes(job.status)) return false;
    await append(tx, job, { kind: 'actual_adjustment', usd: 0, isFinal: true });
    return true;
  });
}

/** Moves a job to another store (null for none) and its net balance per old store with it, as a store_reassign pair. Later rows land on the new store. */
export async function reassignStore(pool: LedgerPool, jobId: string, storeId: string | null): Promise<boolean> {
  return withTransaction(pool, async (tx) => {
    const job = await lockJob(tx, jobId);
    if (job.store_id === storeId) return false;
    await tx.query('update jobs set store_id = $2 where id = $1', [jobId, storeId]);
    const { rows } = await tx.query(`select store_id, sum(usd)::text as usd from cost_entries where job_id = $1 group by store_id having sum(usd) <> 0`, [jobId]);
    for (const r of rows) {
      await append(tx, job, { kind: 'store_reassign', usd: -units(r.usd), isFinal: false, storeId: r.store_id });
      await append(tx, job, { kind: 'store_reassign', usd: units(r.usd), isFinal: false, storeId });
    }
    return true;
  });
}

/** A row with no job: one bake-off row per provider, or an Admin's correction (the note is required). `ref` makes it idempotent. False when the ref was booked before. */
export async function bookShared(
  db: Queryable,
  e: { kind: SharedKind; usd: string | number; month: string; provider?: string; model?: string; ref?: string; note?: string },
): Promise<boolean> {
  const { rowCount } = await db.query(
    `insert into cost_entries (kind, usd, month, provider, model, is_final, ref, note) values ($1, $2, $3, $4, $5, true, $6, $7) on conflict (ref) do nothing`,
    [e.kind, fmt(units(e.usd)), e.month, e.provider ?? null, e.model ?? null, e.ref ?? null, e.note ?? null],
  );
  return rowCount === 1;
}

/**
 * Records the provider's invoice total for a month and books the difference to everything the ledger already holds for that
 * provider and month (job rows, bake-off rows, earlier invoice_diff rows), so entering the same invoice again books nothing
 * and a corrected total books only the new difference. Returns the difference booked now, in USD.
 */
export async function bookInvoice(pool: LedgerPool, i: { month: string; provider: string; totalUsd: string | number }): Promise<string> {
  if (!MONTH.test(i.month)) throw new Error(`not a month: ${i.month}`);
  return withTransaction(pool, async (tx) => {
    await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`invoice:${i.month}:${i.provider}`]);
    await tx.query(
      `insert into provider_invoices (month, provider, total_usd) values ($1, $2, $3)
       on conflict (month, provider) do update set total_usd = excluded.total_usd, updated_at = now()`,
      [i.month, i.provider, fmt(units(i.totalUsd))],
    );
    const { rows } = await tx.query(
      `select coalesce(sum(usd), 0)::text as booked, count(*) filter (where kind = 'invoice_diff')::int as diffs from cost_entries where month = $1 and provider = $2`,
      [i.month, i.provider],
    );
    const diff = units(i.totalUsd) - units(rows[0].booked);
    if (diff !== 0) {
      await tx.query(
        `insert into cost_entries (kind, usd, month, provider, is_final, ref) values ('invoice_diff', $1, $2, $3, true, $4)`,
        [fmt(diff), i.month, i.provider, `invoice-${i.month}-${i.provider}-${rows[0].diffs + 1}`],
      );
    }
    return fmt(diff);
  });
}
