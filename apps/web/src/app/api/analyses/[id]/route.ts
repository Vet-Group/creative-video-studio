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
