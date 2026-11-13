import { reaAnalyzeEnabled } from '@/lib/analyze';
import type { RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/** One of the caller's own analyses, polled while it runs. */
export async function GET(request: Request, { params }: RouteContext) {
  if (!reaAnalyzeEnabled()) return Response.json({ error: 'not found' }, { status: 404 });
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const row = (
    await pool.query(
      `select id, status, provider, model, result, cost_usd as "costUsd", error, created_at as "createdAt", finished_at as "finishedAt",
              (select a.id from assets a where a.s3_key = analyses.source_key) as "sourceAssetId"
         from analyses where id = $1 and user_id = $2`,
      [id, g.session.user.id],
    )
  ).rows[0];
  if (!row) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(row);
}

/**
 * Deletes one of the caller's own finished analyses (the database row only: the stored files and the cost ledger stay). 404 for another user's; 409 while it
 * runs and once a Smart Remake was made from it (the remakes row keeps it, and its shots still read the analysis).
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  if (!reaAnalyzeEnabled()) return Response.json({ error: 'not found' }, { status: 404 });
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const userId = g.session.user.id;
  const row = (await pool.query('select status, exists (select 1 from remakes where analysis_id = analyses.id) as "hasRemake" from analyses where id = $1 and user_id = $2', [id, userId])).rows[0];
  if (!row) return Response.json({ error: 'not found' }, { status: 404 });
  const remakeRefused = () => Response.json({ error: 'Phân tích này đã có lượt làm lại nên không xoá được.' }, { status: 409 });
  if (row.status === 'queued' || row.status === 'running') return Response.json({ error: 'Phân tích đang chạy nên chưa xoá được. Hãy đợi nó xong.' }, { status: 409 });
  if (row.hasRemake) return remakeRefused();
  try {
    // The FK refuses a row a remake claimed since the check above.
    const res = await pool.query(`delete from analyses where id = $1 and user_id = $2 and status in ('succeeded', 'failed')`, [id, userId]);
    return res.rowCount ? new Response(null, { status: 204 }) : Response.json({ error: 'not found' }, { status: 404 });
  } catch (e) {
    if ((e as { code?: string }).code === '23503') return remakeRefused();
    throw e;
  }
}
