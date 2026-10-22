// The Run caps (plan M.3), read from the jobs table and the cost ledger in Asia/Ho_Chi_Minh time. Money stays in numeric, never a float.
import type { Queryable } from './ledger';

export type CapRefusal = 'daily_clips' | 'monthly_usd';

/**
 * Whether one more Run by `userId` with the given estimate would break a cap, or null. Call it in the transaction that inserts the job,
 * under `pg_advisory_xact_lock(hashtext('caps'))`, so two Runs cannot both take the last slot. `at` is the clock (default now()).
 * - Daily: jobs the user created that ICT day, except `failed` jobs whose ledger total is 0 (timed_out and failed_unknown count).
 * - Monthly: every ledger row of the ICT month (reservations, adjustments, releases, late bills, shared rows) plus the estimate.
 */
export async function checkCaps(tx: Queryable, userId: string, estimateUsd: string, at?: Date): Promise<CapRefusal | null> {
  const { rows } = await tx.query(
    `with t as (select coalesce($3::timestamptz, now()) as at)
     select
       (select count(*) from jobs j left join job_costs c on c.job_id = j.id
         where j.user_id = $1 and not (j.status = 'failed' and coalesce(c.usd, 0) = 0)
           and (j.created_at at time zone 'Asia/Ho_Chi_Minh')::date = (t.at at time zone 'Asia/Ho_Chi_Minh')::date) >= s.member_daily_clip_cap as day_full,
       (select coalesce(sum(usd), 0) from cost_entries where month = to_char(t.at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM')) + $2::numeric > s.monthly_cap_usd as month_full
     from t, settings s where s.id = 1`,
    [userId, estimateUsd, at?.toISOString() ?? null],
  );
  if (rows[0].day_full) return 'daily_clips';
  return rows[0].month_full ? 'monthly_usd' : null;
}
