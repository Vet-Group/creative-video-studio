// The Admin Usage page (/admin/usage): per team and per person, who uses CVS in a period. Shared by GET /api/admin/usage and its CSV.
import { pool } from '@/lib/auth';
import type { Period } from '@/lib/period';
import { realUserSql } from '@/lib/real-users';
import { USAGE_STATUS, type UsageStatus, usageStatus } from '@/lib/usage-status';

const ICT = `'Asia/Ho_Chi_Minh'`;

/**
 * Two select columns for the users row `u`: `lastUsedAt`, its last job (mock jobs aside) or video analysis, and `lastSeenAt`, the last trace of its own
 * sign-in. Sign-out deletes a session row, so a linked sign-in account (Lark, made on the first sign-in) counts too; an Admin-made password account and an
 * Admin's impersonation do not. The Overview's sales-team list uses it too.
 */
export const lastUseSql = (u = 'u'): string =>
  `greatest((select max(created_at) from jobs j where j.user_id = ${u}.id and not j.is_mock), (select max(created_at) from analyses a where a.user_id = ${u}.id)) as "lastUsedAt",
   greatest((select max(updated_at) from sessions s where s.user_id = ${u}.id and s.impersonated_by is null),
            (select max(created_at) from accounts a where a.user_id = ${u}.id and a.provider_id <> 'credential')) as "lastSeenAt"`;

// USD at 4 decimals, and at 2 for display with ties to even, as the Costs page rounds.
const usd4 = (v: string) => `coalesce(${v}, 0)::numeric(12, 4)::text`;
const usd2 = (v: string) => `(round_half_even(coalesce(${v}, 0) * 100) / 100)::numeric(12, 2)::text`;
const inPeriod = (day: string) => `${day} between $1::date and $2::date`;

/**
 * Every unlocked user by their current team, with their figures for `period` (ICT days) and of all time. Spend is the ledger rows of their jobs and their
 * job-less llm calls; creations are their jobs other than mock ones. `real` keeps the real users (lib/real-users.ts) and counts the rest as hidden; without it
 * everyone shows, tagged. Teams go by the period's spend, then name; a team's people by status (USAGE_STATUS order), then spend, then name.
 */
export async function usageReport(period: Period, real: boolean) {
  const { rows } = await pool.query(
    `with spend as (select ce.user_id, sum(ce.usd) filter (where ${inPeriod('ce.day')}) as usd, sum(ce.usd) as usd_all
                      from cost_entries ce where ce.job_id is not null or ce.kind = 'llm' group by ce.user_id),
          made as (select user_id, (count(*) filter (where ${inPeriod(`(created_at at time zone ${ICT})::date`)}))::int as n, count(*)::int as n_all
                     from jobs where not is_mock group by user_id),
          analysed as (select user_id, (count(*) filter (where ${inPeriod(`(created_at at time zone ${ICT})::date`)}))::int as n, count(*)::int as n_all
                         from analyses group by user_id),
          p as (
            select u.id, u.name, u.email, u.role, u.system, u.outside_lark, u.team_id, coalesce(t.name, 'Chưa phân team') as team,
                   coalesce(t.excluded_from_reports, false) as excluded, (${realUserSql()} or not $3::boolean) as shown,
                   s.usd, s.usd_all, coalesce(m.n, 0) as jobs, coalesce(m.n_all, 0) as jobs_all, coalesce(a.n, 0) as analyses, coalesce(a.n_all, 0) as analyses_all,
                   ${lastUseSql()}
              from users u
              left join teams t on t.id = u.team_id
              left join spend s on s.user_id = u.id
              left join made m on m.user_id = u.id
              left join analysed a on a.user_id = u.id
             where not u.banned)
     select p.*, ${usd4('p.usd')} as usd4, ${usd2('p.usd')} as usd2, ${usd4('p.usd_all')} as usd_all4, ${usd2('p.usd_all')} as usd_all2,
            ${usd4('sum(p.usd) filter (where p.shown) over (partition by p.team_id)')} as team_usd4,
            ${usd2('sum(p.usd) filter (where p.shown) over (partition by p.team_id)')} as team_usd2,
            ${usd4('sum(p.usd) filter (where p.shown) over ()')} as total_usd4, ${usd2('sum(p.usd) filter (where p.shown) over ()')} as total_usd2,
            ${usd4('sum(p.usd_all) filter (where p.shown) over ()')} as total_usd_all4, ${usd2('sum(p.usd_all) filter (where p.shown) over ()')} as total_usd_all2
       from p`,
    [period.from, period.to, real],
  );
  const shown = rows.filter((r) => r.shown);
  const order = Object.keys(USAGE_STATUS);
  const people = shown
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      email: r.email as string,
      role: r.role as string,
      tags: [r.system && 'Hệ thống', r.excluded && 'Không tính báo cáo', r.outside_lark && 'Đối tác'].filter(Boolean) as string[],
      status: usageStatus(r),
      usd: r.usd4 as string,
      usdDisplay: r.usd2 as string,
      usdAll: r.usd_all4 as string,
      usdAllDisplay: r.usd_all2 as string,
      jobs: r.jobs as number,
      jobsAll: r.jobs_all as number,
      analyses: r.analyses as number,
      analysesAll: r.analyses_all as number,
      lastUsedAt: r.lastUsedAt as string | null,
      lastSeenAt: r.lastSeenAt as string | null,
      team: { id: r.team_id as string, name: r.team as string, excluded: r.excluded as boolean, usd: r.team_usd4 as string, usdDisplay: r.team_usd2 as string },
    }))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || Number(b.usd) - Number(a.usd) || a.name.localeCompare(b.name, 'vi'));
  type Team = (typeof people)[number]['team'] & { people: number; using: number; users: Omit<(typeof people)[number], 'team'>[] };
  const teams = new Map<string, Team>();
  for (const { team, ...user } of people) {
    let t = teams.get(team.id);
    if (!t) teams.set(team.id, (t = { ...team, people: 0, using: 0, users: [] }));
    t.people++;
    if (user.status === 'using') t.using++;
    t.users.push(user);
  }
  const count = (s: UsageStatus) => people.filter((u) => u.status === s).length;
  const using = count('using');
  return {
    period,
    real,
    totals: {
      people: people.length,
      using,
      usingPct: people.length ? Math.round((using * 100) / people.length) : 0,
      lapsed: count('lapsed'),
      idle: count('idle'),
      never: count('never'),
      usd: (rows[0]?.total_usd4 as string) ?? '0.0000',
      usdDisplay: (rows[0]?.total_usd2 as string) ?? '0.00',
      usdAll: (rows[0]?.total_usd_all4 as string) ?? '0.0000',
      usdAllDisplay: (rows[0]?.total_usd_all2 as string) ?? '0.00',
    },
    hidden: { people: rows.length - shown.length },
    teams: [...teams.values()].sort((a, b) => Number(b.usd) - Number(a.usd) || a.name.localeCompare(b.name, 'vi')),
  };
}

export type UsageReport = Awaited<ReturnType<typeof usageReport>>;
