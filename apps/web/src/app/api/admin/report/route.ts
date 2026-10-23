import { bad } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

const ICT = `'Asia/Ho_Chi_Minh'`;

/**
 * Admin: the weekly KPIs per user for the ICT week (Monday 00:00 to Sunday 24:00) that holds `?week=YYYY-MM-DD` (default: this week). A job belongs to
 * the week of its Run, and so does every ledger row it gets later. Per user: jobs, accepted clips (Pass verdicts), `spendUsd`, `costPerAcceptedUsd`
 * (null with no accepted clip), `medianRunSeconds` (created to finished, succeeded jobs), `failureRate` (failed, timed out or lost jobs over finished
 * jobs) and `spendOfCap`, the spend as a fraction of the monthly cap. `cap` is the ledger usage of the month the week starts in. Hidden teams and
 * stores do not matter: history stays.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const week = new URL(request.url).searchParams.get('week');
  const day = week === null ? 0 : Date.parse(`${week}T00:00:00Z`);
  if (week !== null && !(/^\d{4}-\d{2}-\d{2}$/.test(week) && !Number.isNaN(day) && new Date(day).toISOString().startsWith(week))) return bad('week must be a date like 2026-10-14');

  const { rows } = await pool.query(
    `with w as (select date_trunc('week', coalesce($1::date, (now() at time zone ${ICT})::date)::timestamp)::date as start),
          wj as (select j.* from jobs j, w where (j.created_at at time zone ${ICT})::date >= w.start and (j.created_at at time zone ${ICT})::date < w.start + 7),
          spend as (select user_id, sum(usd) as usd from cost_entries, w where job_id is not null and day >= w.start and day < w.start + 7 group by user_id),
          per_user as (
            select j.user_id, count(*)::int as jobs, (count(*) filter (where v.verdict = 'pass'))::int as accepted,
                   (count(*) filter (where j.status in ('failed', 'timed_out', 'failed_unknown')))::int as failed,
                   (count(*) filter (where j.status in ('succeeded', 'failed', 'timed_out', 'failed_unknown')))::int as finished,
                   percentile_cont(0.5) within group (order by extract(epoch from j.finished_at - j.created_at)) filter (where j.status = 'succeeded') as median_s
              from wj j left join verdicts v on v.job_id = j.id group by j.user_id)
     select w.start::text as start, (w.start + 6)::text as "end",
            to_char(w.start::timestamp, 'YYYY-MM') as cap_month, s.monthly_cap_usd::text as monthly_cap, s.member_daily_clip_cap as daily_cap,
            coalesce((select sum(usd) from cost_entries where month = to_char(w.start::timestamp, 'YYYY-MM')), 0)::numeric(12, 4)::text as cap_used,
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
  return Response.json({
    week: { start: head.start, end: head.end },
    cap: { month: head.cap_month, monthlyCapUsd: head.monthly_cap, usedUsd: head.cap_used, memberDailyClipCap: head.daily_cap },
    users: rows
      .filter((r) => r.user_id)
      .map((r) => ({
        userId: r.user_id, name: r.name, email: r.email, team: r.team, jobs: r.jobs, acceptedClips: r.accepted, spendUsd: r.spend, costPerAcceptedUsd: r.per_accepted,
        medianRunSeconds: r.median_s, failureRate: r.finished ? Math.round((r.failed / r.finished) * 1e4) / 1e4 : null, spendOfCap: r.of_cap,
      })),
  });
}
