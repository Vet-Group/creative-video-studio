import { randomUUID } from 'node:crypto';
import { type Analysis, mergeShots } from '@cvs/core/analysis/breakdown';
import { remakeScene, remakeShotsProblem, remakeShotUsd } from '@cvs/core/analysis/remake';
import { withTransaction } from '@cvs/core/ledger';
import { checkCaps } from '@cvs/core/limits';
import { REMAKE_QUEUE } from '@cvs/core/queue';
import { readableAsset, readJson } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { storeAllowed } from '@/lib/billing';
import { CAP_MESSAGES } from '@/lib/caps';
import { boss } from '@/lib/queue';
import { REMAKE_COLUMNS, reaRemakeEnabled, spendOf } from '@/lib/remake';
import { guard } from '@/lib/session';

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const notHere = () => Response.json({ error: 'not found' }, { status: 404 });

/** The caller's remakes, newest first. */
export async function GET(request: Request) {
  if (!reaRemakeEnabled()) return notHere();
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const rows = (await pool.query(`select ${REMAKE_COLUMNS} from remakes where user_id = $1 and workspace_id = $2 order by created_at desc limit 50`, [g.session.user.id, g.workspaceId])).rows;
  return Response.json({ remakes: rows.map((r) => spendOf(r, g.workspaceId)) });
}

/** Queues a Smart Remake: one of the caller's own images put into chosen shots of one of their finished analyses, or of one an Admin shared in their workspace, on the worker.
 * A remake of their own analysis takes its store, unless the caller may no longer pick it (another billing team's, lib/billing.ts); one of a shared analysis has none, as the sharer's store is not the caller's. Answers with the new remake id to poll. */
export async function POST(request: Request) {
  if (!reaRemakeEnabled()) return notHere();
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const b = (await readJson(request)) as { analysisId?: unknown; productAssetId?: unknown; shots?: unknown } | null;
  const analysisId = b?.analysisId;
  const productAssetId = b?.productAssetId;
  if (typeof analysisId !== 'string' || typeof productAssetId !== 'string') return bad('analysisId, productAssetId and shots are required');

  const userId = g.session.user.id;
  const analysis = (
    // The analysis' store goes with the remake only while the caller may still pick it (another billing team's is dropped, lib/billing.ts).
    await pool.query(
      `select status, result, store_id, user_id = $2 as own,
              (store_id is null or exists (select 1 from stores s where s.id = analyses.store_id and ${storeAllowed('s', '$2')})) as store_ok
         from analyses where id = $1 and workspace_id = $3 and (user_id = $2 or shared_at is not null)`,
      [
      analysisId,
      userId,
      g.workspaceId,
    ])
  ).rows[0];
  if (!analysis) return bad('the analysis does not exist', 404);
  if (analysis.status !== 'succeeded') return bad('the analysis has not finished');
  // A remake takes whole scenes, as the result list and the picker show them: each is chosen by its first stored shot (mergeShots).
  const result = analysis.result as Analysis;
  const problem = remakeShotsProblem(b?.shots, mergeShots(result).first);
  if (problem) return bad(problem);

  const found = await readableAsset(g.session, g.workspaceId, productAssetId);
  if (found.error) return found.error;
  if (found.asset.ownerId !== userId) return bad('productAssetId must be one of your own images', 403);
  if (!found.asset.mime.startsWith('image/')) return bad('productAssetId must be an image');

  const id = randomUUID();
  // The clips are joined in shot order, whatever order they were picked in.
  const shots = [...(b!.shots as number[])].sort((x, y) => x - y);
  const cap = await withTransaction(pool, async (tx) => {
    // One writer at a time, as for a Run, so two remakes cannot both take the last dollars of the month or of the member's caps.
    await tx.query(`select pg_advisory_xact_lock(hashtext('caps'))`);
    // checkCaps adds what the open remakes have yet to book: they have booked only the calls made so far.
    const estimate = shots.reduce((sum, index) => sum + remakeShotUsd(remakeScene(result, index)!), 0);
    const refused = await checkCaps(tx, userId, estimate.toFixed(6), undefined, 'remake');
    if (refused) return refused;
    await tx.query(
      `insert into remakes (id, user_id, team_id, store_id, analysis_id, product_asset_id, shots, workspace_id)
         values ($1, $2, (select team_id from users where id = $2), $3, $4, $5, $6, $7)`,
      [id, userId, analysis.own && analysis.store_ok ? analysis.store_id : null, analysisId, productAssetId, JSON.stringify(shots), g.workspaceId],
    );
    return null;
  });
  if (cap) return Response.json({ error: CAP_MESSAGES[cap] }, { status: 429 });
  try {
    await (await boss()).send(REMAKE_QUEUE, { remakeId: id });
  } catch (e) {
    // A failed send must not leave the row 'queued' for the worker's stale sweep to find hours later: fail it so the caller retries now.
    console.error(`Could not send remake ${id} to the queue:`, e);
    await pool.query(`update remakes set status = 'failed', error = 'could not queue the remake', finished_at = now() where id = $1`, [id]);
    return bad('could not queue the remake; try again', 503);
  }
  return Response.json({ id }, { status: 201 });
}
