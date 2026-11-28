import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { reaAnalyzeEnabled } from '@/lib/analyze';
import type { RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/** One of the caller's own analyses, polled while it runs, or one an Admin shared as a reference video, without its owner's cost, provider, model and error.
 * An Admin reads any member's analysis in full, with its creator's name when it is not their own. Only analyses of the active workspace are found, and
 * the cost is sent in the company workspace only. */
export async function GET(request: Request, { params }: RouteContext) {
  if (!reaAnalyzeEnabled()) return Response.json({ error: 'not found' }, { status: 404 });
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const admin = g.session.user.role === 'admin';
  const row = (
    await pool.query(
      `select id, status, case when user_id = $2 or $3 then provider end as provider, case when user_id = $2 or $3 then model end as model, result,
              case when (user_id = $2 or $3) and $4 = $5 then cost_usd end as "costUsd", case when user_id = $2 or $3 then error end as error, created_at as "createdAt", finished_at as "finishedAt",
              shared_title as "sharedTitle", (select a.id from assets a where a.s3_key = analyses.source_key and a.workspace_id = analyses.workspace_id) as "sourceAssetId",
              (select a.duration_ms::float8 / 1000 from assets a where a.s3_key = analyses.source_key and a.workspace_id = analyses.workspace_id) as "sourceDurationS",
              case when user_id <> $2 and $3 then (select u.name from users u where u.id = analyses.user_id) end as "creatorName"
         from analyses where id = $1 and workspace_id = $4 and (user_id = $2 or $3 or shared_at is not null)`,
      [id, g.session.user.id, admin, g.workspaceId, COMPANY_WORKSPACE_ID],
    )
  ).rows[0];
  if (!row) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(row);
}

/**
 * Deletes one of the caller's own finished analyses (the database row only: the stored files and the cost ledger stay). 404 for another user's; 409 while it
 * runs and once a Smart Remake was made from it, by its owner or by another member while it was shared (the remakes row keeps it, and its shots still read the analysis).
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  if (!reaAnalyzeEnabled()) return Response.json({ error: 'not found' }, { status: 404 });
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const userId = g.session.user.id;
  const row = (
    await pool.query(
      `select status, exists (select 1 from remakes r where r.analysis_id = analyses.id and r.user_id = $2) as "ownRemake",
              exists (select 1 from remakes r where r.analysis_id = analyses.id and r.user_id <> $2) as "otherRemake"
         from analyses where id = $1 and user_id = $2 and workspace_id = $3`,
      [id, userId, g.workspaceId],
    )
  ).rows[0];
  if (!row) return Response.json({ error: 'not found' }, { status: 404 });
  const remakeRefused = () => Response.json({ error: 'Phân tích này đã có lượt làm lại nên không xoá được.' }, { status: 409 });
  if (row.status === 'queued' || row.status === 'running') return Response.json({ error: 'Phân tích đang chạy nên chưa xoá được. Hãy đợi nó xong.' }, { status: 409 });
  if (row.ownRemake) return remakeRefused();
  if (row.otherRemake) return Response.json({ error: 'Video mẫu này đã có người dùng để làm lại nên không xoá được.' }, { status: 409 });
  try {
    // The FK refuses a row a remake claimed since the check above.
    const res = await pool.query(`delete from analyses where id = $1 and user_id = $2 and workspace_id = $3 and status in ('succeeded', 'failed')`, [id, userId, g.workspaceId]);
    return res.rowCount ? new Response(null, { status: 204 }) : Response.json({ error: 'not found' }, { status: 404 });
  } catch (e) {
    if ((e as { code?: string }).code === '23503') return remakeRefused();
    throw e;
  }
}
