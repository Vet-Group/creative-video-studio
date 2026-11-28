// The Run caps (plan M.3), read from the jobs table and the cost ledger in Asia/Ho_Chi_Minh time. Money stays in numeric, never a float.
import { REMAKE_MAX_SECONDS, remakeShotUsd } from './analysis/remake';
import type { Queryable } from './ledger';

export type CapRefusal = 'daily_clips' | 'monthly_usd' | 'features_monthly_usd' | 'member_daily_usd' | 'member_monthly_usd';

/** The features that spend the company video budget; every other feature is under the image and apps caps (schema FEATURE_BUDGET). */
const VIDEO_FEATURES = ['video', 'marketing'];
/** Ledger rows of the image and apps features; shared rows (no job) belong to the video budget. */
const budgetRow = (features: string) => `exists (select 1 from jobs bj where bj.id = cost_entries.job_id and bj.feature <> all(${features}::text[]))`;
/**
 * LLM calls (Enhance, suggestions, translations, analyses) never count toward a cap (owner decision, 2026-11-04); the Costs page still shows them.
 * A Smart Remake's fal calls are booked as llm rows too (bookLlm) but are video generation, so they count, like any row with no job, in the video month,
 * and in the member's day and month too (memberSpend).
 * `capRowOf(alias)` is the predicate for a query that names the ledger by an alias; the Admin budget displays use it so they count what the caps do.
 */
export const capRowOf = (alias: string) => `(${alias}.kind <> 'llm' or ${alias}.ref like 'llm:remake:%')`;
const capRow = capRowOf('cost_entries');
/** What the open remakes matching `where` (on alias r) and made in the ICT `period` of CTE m (where bookLlm books their rows) have yet to book: the
 * estimate each was admitted with less what it has booked so far. A row from before migration 0116 has no estimate: its shots count at the longest a
 * shot is billed (REMAKE_MAX_SECONDS). */
const openRemakes = (where: string, period: 'day' | 'month') =>
  `(select coalesce(sum(greatest(coalesce(r.estimate_usd, jsonb_array_length(r.shots) * ${remakeShotUsd({ start: 0, end: REMAKE_MAX_SECONDS }).toFixed(4)}) - coalesce(r.cost_usd, 0), 0)), 0)::numeric(12, 4)
     from remakes r, m where r.status in ('queued', 'running') and ${where}
       and ${period === 'day' ? `(r.created_at at time zone 'Asia/Ho_Chi_Minh')::date = m.day` : `to_char(r.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') = m.month`})`;
/** The member caps' spend of user $1 in the ICT `period` of CTE m (features in parameter `features` are the video ones): the image and apps rows
 * and the user's Smart Remakes (owner decision, 2026-11-21), booked or still to book. */
const memberSpend = (period: 'day' | 'month', features: string) =>
  `((select coalesce(sum(usd), 0.0000) from cost_entries, m where cost_entries.user_id = $1 and cost_entries.${period} = m.${period} and ${capRow}
       and (${budgetRow(features)} or cost_entries.ref like 'llm:remake:%')) + ${openRemakes('r.user_id = $1', period)})`;

/** The video clips (features in parameter `features`) the user in parameter `user` made on the ICT day of `t.at`, as the daily clip cap counts them:
 * `failed` jobs with no provider cost booked (an Enhance llm row aside) do not count. The day is a range on the bare `created_at`, so the tray's poll reads it
 * through jobs_user_id_created_at_idx instead of every job the user ever ran. */
const dayClips = (user: string, features: string) => `select count(*) from jobs j
           where j.user_id = ${user} and j.feature = any(${features}::text[])
             and not (j.status = 'failed' and coalesce((select sum(usd) from cost_entries where cost_entries.job_id = j.id and ${capRow}), 0) = 0)
             and j.created_at >= (date_trunc('day', t.at at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh')
             and j.created_at < ((date_trunc('day', t.at at time zone 'Asia/Ho_Chi_Minh') + interval '1 day') at time zone 'Asia/Ho_Chi_Minh')`;

/** The video clips `userId` made today and the daily clip cap, for the page to say how many a Run would use before it is sent. */
export async function dailyClips(q: Queryable, userId: string): Promise<{ today: number; cap: number }> {
  const { rows } = await q.query(
    `with t as (select now() as at) select (${dayClips('$1', '$2')})::int as today, s.member_daily_clip_cap as cap from t, settings s where s.id = 1`,
    [userId, VIDEO_FEATURES],
  );
  return { today: rows[0].today, cap: rows[0].cap };
}

/** What `userId` has used of the caps checkCaps applies to them, counted the same way: the video clips of the ICT day, and the image, apps and
 * Smart Remake spend (USD as numeric text) of the ICT day and month, each beside its cap. `monthToDate` is everything the ledger holds for them that ICT month
 * (video, image, apps and LLM rows, under a cap or not), provisional while a job of it has no closing row. `at` is the clock (default now()). */
export async function memberUsage(q: Queryable, userId: string, at?: Date) {
  const { rows } = await q.query(
    `with t as (select coalesce($2::timestamptz, now()) as at),
          m as (select to_char(t.at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as month, (t.at at time zone 'Asia/Ho_Chi_Minh')::date as day from t)
     select (${dayClips('$1', '$3')})::int as clips, s.member_daily_clip_cap as clip_cap,
       ${memberSpend('day', '$3')}::text as day_usd,
       s.member_daily_usd_cap::text as day_cap_usd,
       ${memberSpend('month', '$3')}::text as month_usd,
       s.member_monthly_usd_cap::text as month_cap_usd,
       (select coalesce(sum(usd), 0.0000) from cost_entries, m where cost_entries.user_id = $1 and cost_entries.month = m.month)::text as total_usd,
       (select coalesce(bool_or(not c.is_final), false) from job_costs c
         where c.job_id in (select job_id from cost_entries, m where cost_entries.user_id = $1 and cost_entries.month = m.month)) as total_provisional
     from t, settings s where s.id = 1`,
    [userId, at?.toISOString() ?? null, VIDEO_FEATURES],
  );
  const r = rows[0];
  return {
    clips: { used: r.clips as number, cap: r.clip_cap as number },
    dayUsd: { used: r.day_usd as string, cap: r.day_cap_usd as string },
    monthUsd: { used: r.month_usd as string, cap: r.month_cap_usd as string },
    monthToDate: { usd: r.total_usd as string, provisional: r.total_provisional as boolean },
  };
}

/**
 * Whether one more Run by `userId` of `feature` with the given estimate would break a cap, or null. Call it in the transaction that inserts the job,
 * under `pg_advisory_xact_lock(hashtext('caps'))`, so two Runs cannot both take the last slot. `at` is the clock (default now()).
 * - Video (`video`, `marketing`): the daily clip count (jobs the user created that ICT day, except `failed` jobs whose provider rows total 0;
 *   timed_out and failed_unknown count), then the company month: every ledger row of the ICT month outside the image and apps features plus the estimate.
 * - Image and apps features: the member's ICT day and month (memberSpend), then the month for everyone over those features' ledger rows, each plus
 *   the estimate. The per-feature caps (feature_caps) never refuse; the Costs page shows them.
 * - A Smart Remake (`remake`, the estimate is its own): the daily clip count as for video, the member's ICT day and month (memberSpend), then the
 *   company month as for video plus what every open remake has yet to book.
 * - llm rows count toward none of these, except a Smart Remake's (capRow).
 */
export async function checkCaps(tx: Queryable, userId: string, estimateUsd: string, at?: Date, feature = 'video'): Promise<CapRefusal | null> {
  const values = [userId, estimateUsd, at?.toISOString() ?? null, VIDEO_FEATURES];
  if (feature === 'remake') {
    const { rows } = await tx.query(
      `with t as (select coalesce($3::timestamptz, now()) as at),
            m as (select to_char(t.at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as month, (t.at at time zone 'Asia/Ho_Chi_Minh')::date as day from t)
       select
         (${dayClips('$1', '$4')}) >= s.member_daily_clip_cap as day_full,
         ${memberSpend('day', '$4')} + $2::numeric > s.member_daily_usd_cap as member_day_full,
         ${memberSpend('month', '$4')} + $2::numeric > s.member_monthly_usd_cap as member_month_full,
         (select coalesce(sum(usd), 0) from cost_entries, m where cost_entries.month = m.month and ${capRow} and not ${budgetRow('$4')})
           + ${openRemakes('true', 'month')} + $2::numeric > s.monthly_cap_usd as month_full
       from t, settings s where s.id = 1`,
      values,
    );
    if (rows[0].day_full) return 'daily_clips';
    if (rows[0].member_day_full) return 'member_daily_usd';
    if (rows[0].member_month_full) return 'member_monthly_usd';
    return rows[0].month_full ? 'monthly_usd' : null;
  }
  if (VIDEO_FEATURES.includes(feature)) {
    const { rows } = await tx.query(
      `with t as (select coalesce($3::timestamptz, now()) as at)
       select
         (${dayClips('$1', '$4')}) >= s.member_daily_clip_cap as day_full,
         (select coalesce(sum(usd), 0) from cost_entries
           where month = to_char(t.at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') and ${capRow} and not ${budgetRow('$4')}) + $2::numeric > s.monthly_cap_usd as month_full
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
       ${memberSpend('day', '$4')} + $2::numeric > s.member_daily_usd_cap as member_day_full,
       ${memberSpend('month', '$4')} + $2::numeric > s.member_monthly_usd_cap as member_month_full,
       (select coalesce(sum(usd), 0) from cost_entries, m where cost_entries.month = m.month and ${capRow} and ${budgetRow('$4')}) + $2::numeric > s.features_monthly_cap_usd as month_full
     from settings s where s.id = 1`,
    values,
  );
  if (rows[0].member_day_full) return 'member_daily_usd';
  if (rows[0].member_month_full) return 'member_monthly_usd';
  return rows[0].month_full ? 'features_monthly_usd' : null;
}

/**
 * What the agent connection `tokenId` has spent in the ICT month of `at` (default now()), as numeric text: every ledger row booked for it, of every kind
 * (llm and adjustments too, owner decision 2026-11-28), plus what its open remakes have yet to book. The connection's monthly cap holds this
 * (apps/web/src/lib/agent-access.ts agentCharge), under the connection's lock.
 */
export async function tokenMonthSpend(q: Queryable, tokenId: string, at?: Date): Promise<string> {
  const { rows } = await q.query(
    `with t as (select coalesce($2::timestamptz, now()) as at),
          m as (select to_char(t.at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as month from t)
     select ((select coalesce(sum(usd), 0) from cost_entries, m where cost_entries.api_token_id = $1 and cost_entries.month = m.month)
             + ${openRemakes('r.api_token_id = $1', 'month')})::numeric(12, 4)::text as usd`,
    [tokenId, at?.toISOString() ?? null],
  );
  return rows[0].usd;
}
