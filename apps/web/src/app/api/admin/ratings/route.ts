import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { pool } from '@/lib/auth';
import type { AdminRatings } from '@/lib/rating';
import { guard } from '@/lib/session';

const DAYS = 30;
const RECENT = `r.created_at > now() - make_interval(days => $1)`;
const TEAM = `coalesce(t.name, 'Chưa có nhóm')`;
// Each member's newest rating in the window counts once, so rating again from the Feedback page cannot tilt the average.
const LATEST = `with latest as (select distinct on (r.user_id) r.* from ratings r where ${RECENT} order by r.user_id, r.created_at desc, r.id desc)`;

/** Admin: the satisfaction scores of the last 30 days from every workspace, one per member (their newest): the average, the count and the share of 8 or more, the average per team, and the 20 newest comments,
 * each labelled with the rater's workspaces when they are in any but the company's. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const [total, teams, comments] = await Promise.all([
    pool.query(`${LATEST} select count(*)::int as count, avg(score)::float8 as average, (count(*) filter (where score >= 8))::float8 / nullif(count(*), 0) as "highShare" from latest`, [DAYS]),
    pool.query(`${LATEST} select ${TEAM} as team, avg(r.score)::float8 as average, count(*)::int as count from latest r left join teams t on t.id = r.team_id group by r.team_id, t.name order by count(*) desc, 1`, [DAYS]),
    pool.query(
      `select r.score, r.comment, ${TEAM} as team, r.created_at as "createdAt",
              (select string_agg(w.name, ', ' order by w.name) from workspace_members m join workspaces w on w.id = m.workspace_id
                where m.user_id = r.user_id having bool_or(m.workspace_id <> $2)) as workspace
         from ratings r left join teams t on t.id = r.team_id where ${RECENT} and r.comment is not null order by r.created_at desc, r.id limit 20`,
      [DAYS, COMPANY_WORKSPACE_ID],
    ),
  ]);
  const body: AdminRatings = { days: DAYS, ...total.rows[0], teams: teams.rows, comments: comments.rows };
  return Response.json(body);
}
