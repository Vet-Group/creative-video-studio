import { ASPECTS } from '@cvs/db';
import { pool } from '@/lib/auth';
import { downloadName, ICT_DAY, LIVE_CLIP } from '@/lib/clips';
import { guard } from '@/lib/session';

const PAGE = 24;
const bad = (error: string) => Response.json({ error }, { status: 400 });

/**
 * The Library: every user's live clips, newest first. Filters: `creator` (a user id), `date` (YYYY-MM-DD, Asia/Ho_Chi_Minh) and `ratio`;
 * `offset` pages by 24. `creators` fills the creator filter. `costUsd` is the job's ledger total, provisional while `costFinal` is false.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const q = new URL(request.url).searchParams;
  const creator = q.get('creator');
  const date = q.get('date');
  const ratio = q.get('ratio');
  const offset = Number(q.get('offset') ?? 0);
  const day = date === null ? null : new Date(`${date}T00:00:00Z`);
  if (date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(day!.getTime()) || day!.toISOString().slice(0, 10) !== date)) return bad('date must be a valid YYYY-MM-DD');
  if (ratio !== null && !(ASPECTS as readonly string[]).includes(ratio)) return bad(`ratio must be one of ${ASPECTS.join(', ')}`);
  if (!Number.isInteger(offset) || offset < 0) return bad('offset must be a whole number from 0');

  const [clips, creators] = await Promise.all([
    pool.query(
      `select j.id, j.user_id, u.name as creator_name, j.created_at, ${ICT_DAY} as day, j.model, m.label as model_label, j.aspect, j.duration_s, j.is_mock,
              j.output_asset_id, j.poster_asset_id, coalesce(c.usd, 0)::numeric(12, 4)::text as cost_usd, coalesce(c.is_final, false) as cost_final, v.verdict, v.fault, v.marked_by
         from jobs j
         join users u on u.id = j.user_id
         join model_configs m on m.id = j.model
         left join job_costs c on c.job_id = j.id
         left join verdicts v on v.output_asset_id = j.output_asset_id
        where ${LIVE_CLIP}
          and ($1::text is null or j.user_id = $1)
          and ($2::date is null or (j.created_at at time zone 'Asia/Ho_Chi_Minh')::date = $2::date)
          and ($3::text is null or j.aspect = $3)
        order by j.created_at desc, j.id desc limit $4 offset $5`,
      [creator, date, ratio, PAGE + 1, offset],
    ),
    pool.query(`select distinct u.id, u.name from jobs j join users u on u.id = j.user_id where ${LIVE_CLIP} order by u.name, u.id`),
  ]);
  const me = g.session.user;
  return Response.json({
    hasMore: clips.rows.length > PAGE,
    creators: creators.rows,
    clips: clips.rows.slice(0, PAGE).map((r) => ({
      id: r.id,
      creator: { id: r.user_id, name: r.creator_name },
      createdAt: r.created_at,
      modelId: r.model,
      modelLabel: r.model_label,
      ratio: r.aspect,
      durationSec: r.duration_s,
      isMock: r.is_mock,
      videoAssetId: r.output_asset_id,
      posterAssetId: r.poster_asset_id,
      costUsd: r.cost_usd,
      costFinal: r.cost_final,
      verdict: r.verdict ? { verdict: r.verdict, fault: r.fault, markedBy: r.marked_by } : null,
      canEdit: r.user_id === me.id || me.role === 'admin',
      downloadName: downloadName(r.day, r.creator_name, r.id),
    })),
  });
}
