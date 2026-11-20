import { randomUUID } from 'node:crypto';
import { type Analysis, mergeShots } from '@cvs/core/analysis/breakdown';
import { ANALYZE_QUEUE } from '@cvs/core/queue';
import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { reaAnalyzeEnabled } from '@/lib/analyze';
import { readableAsset, readJson } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { STORE_TEAM_CODE, storeAllowed } from '@/lib/billing';
import { boss } from '@/lib/queue';
import { guard } from '@/lib/session';

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const notHere = () => Response.json({ error: 'not found' }, { status: 404 });

/** The caller's analyses in the active workspace, newest first, for the analysis page's history. `?scope=all`, Admin only: everyone's in the workspace, each other member's with its creator's name. `?shared=1`: the analyses an Admin shared as reference videos in the workspace, from any
 * owner, newest share first, with only what a card shows (no owner, cost or result). `costUsd` is null outside the company workspace, which alone sees spend. */
export async function GET(request: Request) {
  if (!reaAnalyzeEnabled()) return notHere();
  const params = new URL(request.url).searchParams;
  const all = params.get('scope') === 'all';
  const g = await guard(request, all ? 'admin' : 'member');
  if (g.error) return g.error;
  const source = `(select a.id from assets a where a.s3_key = analyses.source_key and a.workspace_id = analyses.workspace_id) as "sourceAssetId"`;
  if (params.get('shared') === '1') {
    // One whose source video was deleted cannot be remade, so it leaves the shelf.
    const { rows } = await pool.query(
      `select id, shared_title as title, shared_at as "sharedAt", result, ${source} from analyses
        where workspace_id = $1 and shared_at is not null and exists (select 1 from assets a where a.s3_key = analyses.source_key and a.workspace_id = $1 and a.deleted_at is null)
        order by shared_at desc limit 50`,
      [g.workspaceId],
    );
    return Response.json({
      analyses: rows.map(({ result, ...r }) => ({ ...r, durationS: (result as Analysis).durationS ?? null, sceneCount: mergeShots(result as Analysis).shots.length })),
    });
  }
  const rows = (
    await pool.query(
      `select id, status, provider, model, result, case when $3 = $4 then cost_usd end as "costUsd", error, created_at as "createdAt", finished_at as "finishedAt", shared_title as "sharedTitle", ${source},
              case when user_id <> $1 then (select u.name from users u where u.id = analyses.user_id) end as "creatorName"
         from analyses where workspace_id = $3 and ($2 or user_id = $1) order by created_at desc limit 50`,
      [g.session.user.id, all, g.workspaceId, COMPANY_WORKSPACE_ID],
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

  const found = await readableAsset(g.session, g.workspaceId, sourceAssetId);
  if (found.error) return found.error;
  if (found.asset.ownerId !== g.session.user.id) return bad('sourceAssetId must be one of your own videos', 403);
  if (!found.asset.mime.startsWith('video/')) return bad('sourceAssetId must be a video');

  const userId = g.session.user.id;
  if (storeId !== null) {
    const store = (await pool.query(`select ${storeAllowed('s', '$3')} as allowed from stores s where s.id = $1 and s.workspace_id = $2 and not s.hidden`, [storeId, g.workspaceId, userId])).rows[0];
    if (!store) return bad('the store does not exist or is hidden');
    if (!store.allowed) return Response.json({ error: 'a member of a billing team runs jobs only for the stores of their team', code: STORE_TEAM_CODE }, { status: 403 });
  }

  const id = randomUUID();
  await pool.query(
    `insert into analyses (id, user_id, team_id, store_id, source_key, workspace_id)
       values ($1, $2, (select team_id from users where id = $2), $3, $4, $5)`,
    [id, userId, storeId, found.asset.s3Key, g.workspaceId],
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
