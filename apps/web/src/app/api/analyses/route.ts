import { randomUUID } from 'node:crypto';
import { withTransaction } from '@cvs/core/ledger';
import { ANALYZE_QUEUE, ANALYZE_QUEUE_OPTIONS } from '@cvs/core/queue';
import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { reaAnalyzeEnabled } from '@/lib/analyze';
import { readableAsset, readJson } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { STORE_TEAM_CODE, storeAllowed } from '@/lib/billing';
import { boss } from '@/lib/queue';
import { sharedVideos } from '@/lib/remake';
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
  if (params.get('shared') === '1') return Response.json({ analyses: await sharedVideos(pool, g.workspaceId) });
  const source = `(select a.id from assets a where a.s3_key = analyses.source_key and a.workspace_id = analyses.workspace_id) as "sourceAssetId", (select a.duration_ms::float8 / 1000 from assets a where a.s3_key = analyses.source_key and a.workspace_id = analyses.workspace_id) as "sourceDurationS"`;
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
 * their own input): rea-video decomposes it on the worker. Answers with the new analysis id to poll, or 429 while the caller has one unfinished or has used the day's cap (settings.member_daily_analysis_cap). */
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
  // Refusals members read (errorText).
  const refused = await withTransaction(pool, async (tx): Promise<Response | null> => {
    await tx.query(`select pg_advisory_xact_lock(hashtext('analyses:' || $1))`, [userId]); // two quick sends cannot both pass the checks
    // A running row holds the next analysis back (a stale one is closed by the worker), and so does a queued row while its queue job waits, however long
    // (a backed-up queue, a stopped worker). A queued row with no waiting job lost it: a worker stopped between taking the job and starting the row, and the
    // queue never retries one, nor can the member delete a queued row. Within the queue's expiry a queued row holds anyway (its job may not be sent yet).
    const unfinished = (
      await tx.query(`select id, status, created_at > now() - $2 * interval '1 second' as young from analyses where user_id = $1 and status in ('queued', 'running')`, [
        userId,
        ANALYZE_QUEUE_OPTIONS.expireInSeconds,
      ])
    ).rows as { id: string; status: string; young: boolean }[];
    for (const a of unfinished) {
      if (a.status === 'running' || a.young || (await (await boss()).findJobs(ANALYZE_QUEUE, { data: { analysisId: a.id }, queued: true })).length) {
        return bad('Bạn đang có một phân tích chưa xong. Hãy đợi nó xong rồi phân tích video tiếp theo.', 429);
      }
    }
    // The member's analyses of this ICT day, as a range on the bare created_at like the daily clip cap (dayClips, packages/core/src/limits.ts). Every one
    // the worker started counts, failed or not, as its model calls may have been paid; only one that failed before it started (the queue refused it) is free.
    const day = (
      await tx.query(
        `select (select count(*) from analyses a
                  where a.user_id = $1
                    and not (a.status = 'failed' and a.started_at is null)
                    and a.created_at >= (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh')
                    and a.created_at < ((date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') + interval '1 day') at time zone 'Asia/Ho_Chi_Minh'))::int as today,
                s.member_daily_analysis_cap as cap
           from settings s where s.id = 1`,
        [userId],
      )
    ).rows[0] as { today: number; cap: number };
    if (day.cap === 0) return bad('Phân tích video đang tạm tắt.', 429);
    if (day.today >= day.cap) return bad(`Hôm nay bạn đã dùng hết ${day.cap} lượt phân tích. Mai bạn dùng tiếp được.`, 429);
    await tx.query(
      `insert into analyses (id, user_id, team_id, store_id, source_key, workspace_id)
         values ($1, $2, (select team_id from users where id = $2), $3, $4, $5)`,
      [id, userId, storeId, found.asset.s3Key, g.workspaceId],
    );
    return null;
  });
  if (refused) return refused;
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
