import { randomUUID } from 'node:crypto';
import { ANALYZE_QUEUE } from '@cvs/core/queue';
import { reaAnalyzeEnabled } from '@/lib/analyze';
import { readableAsset, readJson } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { boss } from '@/lib/queue';
import { guard } from '@/lib/session';

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const notHere = () => Response.json({ error: 'not found' }, { status: 404 });

/** The caller's analyses, newest first, for the analysis page's history. */
export async function GET(request: Request) {
  if (!reaAnalyzeEnabled()) return notHere();
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const rows = (
    await pool.query(
      `select id, status, provider, model, result, cost_usd as "costUsd", error, created_at as "createdAt", finished_at as "finishedAt",
              (select a.id from assets a where a.s3_key = analyses.source_key) as "sourceAssetId"
         from analyses where user_id = $1 order by created_at desc limit 50`,
      [g.session.user.id],
    )
  ).rows;
  return Response.json({ analyses: rows });
}

/** Queues an analysis of one of the caller's own videos (an upload, a History clip or an Example, each already copied to
 * their own input): rea-video decomposes it on the worker. Answers with the new analysis id to poll. */
export async function POST(request: Request) {
  if (!reaAnalyzeEnabled()) return notHere();
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const b = (await readJson(request)) as { sourceAssetId?: unknown; storeId?: unknown } | null;
  const sourceAssetId = b?.sourceAssetId;
  const storeId = b?.storeId ?? null;
  if (typeof sourceAssetId !== 'string' || (storeId !== null && typeof storeId !== 'string')) return bad('sourceAssetId, and an optional storeId, are required');

  const found = await readableAsset(g.session, sourceAssetId);
  if (found.error) return found.error;
  if (found.asset.ownerId !== g.session.user.id) return bad('sourceAssetId must be one of your own videos', 403);
  if (!found.asset.mime.startsWith('video/')) return bad('sourceAssetId must be a video');

  const userId = g.session.user.id;
  if (storeId !== null) {
    const store = (await pool.query('select 1 from stores where id = $1 and not hidden', [storeId])).rows[0];
    if (!store) return bad('the store does not exist or is hidden');
  }

  const id = randomUUID();
  await pool.query(
    `insert into analyses (id, user_id, team_id, store_id, source_key)
       values ($1, $2, (select team_id from users where id = $2), $3, $4)`,
    [id, userId, storeId, found.asset.s3Key],
  );
  try {
    await (await boss()).send(ANALYZE_QUEUE, { analysisId: id });
  } catch (e) {
    // No reconcile loop covers analyses (unlike jobs' resendQueued), so a send failure must not leave the row stuck
    // 'queued': fail it so the caller retries cleanly instead of polling a spinner that never resolves.
    console.error(`Could not send analysis ${id} to the queue:`, e);
    await pool.query(`update analyses set status = 'failed', error = 'could not queue the analysis', finished_at = now() where id = $1`, [id]);
    return bad('could not queue the analysis; try again', 503);
  }
  return Response.json({ id }, { status: 201 });
}
