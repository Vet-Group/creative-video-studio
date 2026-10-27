// The Run caps (plan M.3), read from the jobs table and the cost ledger in Asia/Ho_Chi_Minh time. Money stays in numeric, never a float.
import type { Queryable } from './ledger';

export type CapRefusal = 'daily_clips' | 'monthly_usd' | 'features_monthly_usd' | 'member_daily_usd' | 'member_monthly_usd';

/** The features that spend the company video budget; every other feature is under the image and apps caps (schema FEATURE_BUDGET). */
const VIDEO_FEATURES = ['video', 'marketing'];
/** Ledger rows of the image and apps features; shared rows (no job) belong to the video budget. */
const BUDGET_ROW = `exists (select 1 from jobs bj where bj.id = cost_entries.job_id and bj.feature <> all($4::text[]))`;

/** The video clips (features in parameter `features`) the user in parameter `user` made on the ICT day of `t.at`, as the daily clip cap counts them:
 * `failed` jobs with nothing booked do not count. */
const dayClips = (user: string, features: string) => `select count(*) from jobs j left join job_costs c on c.job_id = j.id
           where j.user_id = ${user} and j.feature = any(${features}::text[]) and not (j.status = 'failed' and coalesce(c.usd, 0) = 0)
             and (j.created_at at time zone 'Asia/Ho_Chi_Minh')::date = (t.at at time zone 'Asia/Ho_Chi_Minh')::date`;

/** The video clips `userId` made today and the daily clip cap, for the page to say how many a Run would use before it is sent. */
export async function dailyClips(q: Queryable, userId: string): Promise<{ today: number; cap: number }> {
  const { rows } = await q.query(
    `with t as (select now() as at) select (${dayClips('$1', '$2')})::int as today, s.member_daily_clip_cap as cap from t, settings s where s.id = 1`,
    [userId, VIDEO_FEATURES],
  );
  return { today: rows[0].today, cap: rows[0].cap };
}

/**
 * Whether one more Run by `userId` of `feature` with the given estimate would break a cap, or null. Call it in the transaction that inserts the job,
 * under `pg_advisory_xact_lock(hashtext('caps'))`, so two Runs cannot both take the last slot. `at` is the clock (default now()).
 * - Video (`video`, `marketing`): the daily clip count (jobs the user created that ICT day, except `failed` jobs whose ledger total is 0;
 *   timed_out and failed_unknown count), then the company month: every ledger row of the ICT month outside the image and apps features plus the estimate.
 * - Image and apps features: the member's ICT day and month, then the month for everyone, each over those features' ledger rows plus the estimate.
 *   The per-feature caps (feature_caps) never refuse; the Costs page shows them.
 */
export async function checkCaps(tx: Queryable, userId: string, estimateUsd: string, at?: Date, feature = 'video'): Promise<CapRefusal | null> {
  const values = [userId, estimateUsd, at?.toISOString() ?? null, VIDEO_FEATURES];
  if (VIDEO_FEATURES.includes(feature)) {
    const { rows } = await tx.query(
      `with t as (select coalesce($3::timestamptz, now()) as at)
       select
         (${dayClips('$1', '$4')}) >= s.member_daily_clip_cap as day_full,
         (select coalesce(sum(usd), 0) from cost_entries
           where month = to_char(t.at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') and not ${BUDGET_ROW}) + $2::numeric > s.monthly_cap_usd as month_full
       from t, settings s where s.id = 1`,
      values,
    );
    if (rows[0].day_full) return 'daily_clips';
    return rows[0].month_full ? 'monthly_usd' : null;
  }
  const { rows } = await tx.query(
    `with t as (select coalesce($3::timestamptz, now()) as at),
          m as (select to_char(t.at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as month, (t.at at time zone 'Asia/Ho_Chi_Minh')::date as day from t)
     select
       (select coalesce(sum(usd), 0) from cost_entries, m where cost_entries.user_id = $1 and cost_entries.day = m.day and ${BUDGET_ROW}) + $2::numeric > s.member_daily_usd_cap as member_day_full,
       (select coalesce(sum(usd), 0) from cost_entries, m where cost_entries.user_id = $1 and cost_entries.month = m.month and ${BUDGET_ROW}) + $2::numeric > s.member_monthly_usd_cap as member_month_full,
       (select coalesce(sum(usd), 0) from cost_entries, m where cost_entries.month = m.month and ${BUDGET_ROW}) + $2::numeric > s.features_monthly_cap_usd as month_full
     from settings s where s.id = 1`,
    values,
  );
  if (rows[0].member_day_full) return 'member_daily_usd';
  if (rows[0].member_month_full) return 'member_monthly_usd';
  return rows[0].month_full ? 'features_monthly_usd' : null;
}
