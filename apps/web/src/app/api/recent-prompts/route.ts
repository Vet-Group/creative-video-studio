import { FEATURES } from '@cvs/db';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

const bad = (error: string) => Response.json({ error }, { status: 400 });

/**
 * `?feature=&format=`: the caller's last 10 distinct own words on that page, newest first, from the latest 200 jobs (deleted ones left out).
 * Own words are the kept brief, else the prompt of a free-prompt Create video, an Image Generation or a Motion Control job (elsewhere the prompt is composed).
 * `format` is `advanced` for Marketing Studio Advanced; without it only jobs with no format count.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const q = new URL(request.url).searchParams;
  const feature = q.get('feature') ?? '';
  const format = q.get('format');
  if (!(FEATURES as readonly string[]).includes(feature)) return bad(`feature must be one of ${FEATURES.join(', ')}`);
  if (format !== null && format !== 'advanced') return bad('format must be advanced when given');
  const { rows } = await pool.query(
    `select p from (
       select distinct on (p) p, created_at, id from (
         select nullif(btrim(coalesce(nullif(j.params->>'brief', ''), case when (j.feature = 'video' and j.preset_id is null) or j.feature in ('image', 'motion_control') then j.prompt end)), '') as p, j.created_at, j.id
           from jobs j
          where j.user_id = $1 and j.feature = $2 and j.deleted_at is null and j.params->>'format' is not distinct from $3
          order by j.created_at desc, j.id desc limit 200
       ) latest where p is not null order by p, created_at desc, id desc
     ) words order by created_at desc, id desc limit 10`,
    [g.session.user.id, feature, format],
  );
  return Response.json({ prompts: rows.map((r) => r.p as string) });
}
