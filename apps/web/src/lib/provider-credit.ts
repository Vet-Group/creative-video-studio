// The fal credit lock: a fal model whose Run would cost more than fal can still spend is locked until the balance is topped up (owner request, 2026-11-05).
import type { Queryable } from '@cvs/core/ledger';
import { type FalBalance, readFalBalances } from '@cvs/core/providers/balances';
import { pool } from '@/lib/auth';

const CACHE_MS = 60_000;
let falCache: { at: number; fal: Extract<FalBalance, { ok: true }> } | undefined;

/**
 * fal's balance from its API; a good read is kept a minute, so a top-up unlocks the models within a minute. Admin Costs shows the same read. With a
 * second key (FAL_KEY_NEXT) it is both accounts until the worker switched to the second (settings.fal_next_at), then the second (readFalBalances).
 */
export async function falBalance(): Promise<FalBalance> {
  if (falCache && Date.now() - falCache.at < CACHE_MS) return falCache.fal;
  const switched = process.env.FAL_KEY_NEXT ? (await pool.query('select fal_next_at is not null as s from settings where id = 1')).rows[0]?.s === true : false;
  const fal = await readFalBalances({ key: process.env.FAL_KEY, nextKey: process.env.FAL_KEY_NEXT, switched });
  falCache = fal.ok ? { at: Date.now(), fal } : undefined;
  return fal;
}

/**
 * What fal can still spend, as a 4-decimal string: its USD balance minus the estimates of the fal jobs that have not ended (fal bills a job when it ends).
 * Null when the balance cannot be read or is not in USD: then nothing is locked and fal itself refuses a job it cannot pay for.
 * `fal` is a falBalance() read, taken before any lock since it may call fal.
 */
export async function falCreditUsd(q: Queryable, fal: FalBalance): Promise<string | null> {
  if (!fal.ok || fal.currency !== 'USD') return null;
  const { rows } = await q.query(
    `select coalesce(sum(c.usd), 0)::text as usd from cost_entries c join jobs j on j.id = c.job_id
      where c.kind = 'estimate' and j.provider = 'fal' and not j.is_mock and j.status in ('queued', 'submitting', 'running')`,
  );
  return (fal.balance - Number(rows[0].usd)).toFixed(4);
}

/** Whether a Run estimated at `estimateUsd` on `provider` is locked by the credit `creditUsd` (falCreditUsd; null locks nothing). */
export const overCredit = (provider: string, estimateUsd: string, creditUsd: string | null): boolean =>
  provider === 'fal' && creditUsd !== null && Number(estimateUsd) > Number(creditUsd);

/** Tests only: drop the kept read, so the next falBalance() asks fal again. */
export const forgetFalBalance = () => {
  falCache = undefined;
};
