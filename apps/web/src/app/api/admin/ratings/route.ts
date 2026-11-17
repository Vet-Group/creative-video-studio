import { pool } from '@/lib/auth';
import type { AdminRatings } from '@/lib/rating';
import { guard } from '@/lib/session';

const DAYS = 30;
const RECENT = `r.created_at > now() - make_interval(days => $1)`;
const TEAM = `coalesce(t.name, 'Chưa có nhóm')`;

/** Admin: the satisfaction scores of the last 30 days: the average, the count and the share of 8 or more, the average per team and the 20 newest comments. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const [total, teams, comments] = await Promise.all([
    pool.query(`select count(*)::int as count, avg(score)::float8 as average, (count(*) filter (where score >= 8))::float8 / nullif(count(*), 0) as "highShare" from ratings r where ${RECENT}`, [DAYS]),
    pool.query(`select ${TEAM} as team, avg(r.score)::float8 as average, count(*)::int as count from ratings r left join teams t on t.id = r.team_id where ${RECENT} group by r.team_id, t.name order by count(*) desc, 1`, [DAYS]),
    pool.query(
      `select r.score, r.comment, ${TEAM} as team, r.created_at as "createdAt" from ratings r left join teams t on t.id = r.team_id where ${RECENT} and r.comment is not null order by r.created_at desc, r.id limit 20`,
      [DAYS],
    ),
  ]);
  const body: AdminRatings = { days: DAYS, ...total.rows[0], teams: teams.rows, comments: comments.rows };
  return Response.json(body);
}
