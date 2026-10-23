// The weekly report of the Admin area (plan M.5), shared by GET /api/admin/report and its CSV.
import { pool } from '@/lib/auth';

const ICT = `'Asia/Ho_Chi_Minh'`;

/** True for null (the current week) or a real calendar date like 2026-10-14. */
export function validWeek(week: string | null): boolean {
  return week === null || (/^\d{4}-\d{2}-\d{2}$/.test(week) && !Number.isNaN(Date.parse(`${week}T00:00:00Z`)) && new Date(`${week}T00:00:00Z`).toISOString().startsWith(week));
}

/** The weekly KPIs per user for the ICT week (Monday 00:00 to Sunday 24:00) that holds `week` (default: this week). */
export async function weeklyReport(week: string | null) {
  const { rows } = await pool.query(
    `with w as (select date_trunc('week', coalesce($1::date, (now() at time zone ${ICT})::date)::timestamp)::date as start),
          wj as (select j.* from jobs j, w where j.feature in ('video', 'marketing') and (j.created_at at time zone ${ICT})::date >= w.start and (j.created_at at time zone ${ICT})::date < w.start + 7),
          spend as (select ce.user_id, sum(ce.usd) as usd from cost_entries ce join jobs j on j.id = ce.job_id and j.feature in ('video', 'marketing'), w where ce.day >= w.start and ce.day < w.start + 7 group by ce.user_id),
          per_user as (
            select j.user_id, count(*)::int as jobs, (count(*) filter (where v.verdict = 'pass'))::int as accepted,
                   (count(*) filter (where j.status in ('failed', 'timed_out', 'failed_unknown')))::int as failed,
                   (count(*) filter (where j.status in ('succeeded', 'failed', 'timed_out', 'failed_unknown')))::int as finished,
                   percentile_cont(0.5) within group (order by extract(epoch from j.finished_at - j.created_at)) filter (where j.status = 'succeeded') as median_s
              from wj j left join verdicts v on v.job_id = j.id group by j.user_id)
     select w.start::text as start, (w.start + 6)::text as "end",
            to_char(w.start::timestamp, 'YYYY-MM') as cap_month, s.monthly_cap_usd::text as monthly_cap, s.member_daily_clip_cap as daily_cap,
            coalesce((select sum(usd) from cost_entries ce where month = to_char(w.start::timestamp, 'YYYY-MM') and not exists (select 1 from jobs j where j.id = ce.job_id and j.feature not in ('video', 'marketing'))), 0)::numeric(12, 4)::text as cap_used,
            u.id as user_id, u.name, u.email, t.name as team, p.jobs, p.accepted, p.failed, p.finished, p.median_s,
            coalesce(sp.usd, 0)::numeric(12, 4)::text as spend, round(sp.usd / nullif(p.accepted, 0), 4)::text as per_accepted,
            round(coalesce(sp.usd, 0) / nullif(s.monthly_cap_usd, 0), 4)::text as of_cap
       from w cross join settings s
       left join per_user p on true
       left join users u on u.id = p.user_id
       left join teams t on t.id = u.team_id
       left join spend sp on sp.user_id = p.user_id
      where s.id = 1 order by sp.usd desc nulls last, u.name`,
    [week],
  );
  const head = rows[0];
  return {
    week: { start: head.start as string, end: head.end as string },
    cap: { month: head.cap_month as string, monthlyCapUsd: head.monthly_cap as string, usedUsd: head.cap_used as string, memberDailyClipCap: head.daily_cap as number },
    users: rows
      .filter((r) => r.user_id)
      .map((r) => ({
        userId: r.user_id as string, name: r.name as string, email: r.email as string, team: r.team as string, jobs: r.jobs as number, acceptedClips: r.accepted as number,
        spendUsd: r.spend as string, costPerAcceptedUsd: r.per_accepted as string | null, medianRunSeconds: r.median_s as number | null,
        failureRate: (r.finished ? Math.round((r.failed / r.finished) * 1e4) / 1e4 : null) as number | null, spendOfCap: r.of_cap as string,
      })),
  };
}
