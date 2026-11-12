import { randomUUID } from 'node:crypto';
import type { Analysis } from '@cvs/core/analysis/breakdown';
import { remakeShotsProblem } from '@cvs/core/analysis/remake';
import { REMAKE_QUEUE } from '@cvs/core/queue';
import { readableAsset, readJson } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { boss } from '@/lib/queue';
import { REMAKE_COLUMNS, reaRemakeEnabled } from '@/lib/remake';
import { guard } from '@/lib/session';

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const notHere = () => Response.json({ error: 'not found' }, { status: 404 });

/** The caller's remakes, newest first. */
export async function GET(request: Request) {
  if (!reaRemakeEnabled()) return notHere();
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const rows = (await pool.query(`select ${REMAKE_COLUMNS} from remakes where user_id = $1 order by created_at desc limit 50`, [g.session.user.id])).rows;
  return Response.json({ remakes: rows });
}

/** Queues a Smart Remake: one of the caller's own images put into chosen shots of one of their finished analyses, on the worker.
 * Answers with the new remake id to poll. */
export async function POST(request: Request) {
  if (!reaRemakeEnabled()) return notHere();
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const b = (await readJson(request)) as { analysisId?: unknown; productAssetId?: unknown; shots?: unknown } | null;
  const analysisId = b?.analysisId;
  const productAssetId = b?.productAssetId;
  if (typeof analysisId !== 'string' || typeof productAssetId !== 'string') return bad('analysisId, productAssetId and shots are required');

  const userId = g.session.user.id;
  const analysis = (await pool.query('select status, result, store_id from analyses where id = $1 and user_id = $2', [analysisId, userId])).rows[0];
  if (!analysis) return bad('the analysis does not exist', 404);
  if (analysis.status !== 'succeeded') return bad('the analysis has not finished');
  const problem = remakeShotsProblem(b?.shots, ((analysis.result as Analysis).shots ?? []).map((s) => s.index));
  if (problem) return bad(problem);

  const found = await readableAsset(g.session, productAssetId);
  if (found.error) return found.error;
  if (found.asset.ownerId !== userId) return bad('productAssetId must be one of your own images', 403);
  if (!found.asset.mime.startsWith('image/')) return bad('productAssetId must be an image');

  const id = randomUUID();
  // The clips are joined in shot order, whatever order they were picked in.
  const shots = [...(b!.shots as number[])].sort((x, y) => x - y);
  await pool.query(
    `insert into remakes (id, user_id, team_id, store_id, analysis_id, product_asset_id, shots)
       values ($1, $2, (select team_id from users where id = $2), $3, $4, $5, $6)`,
    [id, userId, analysis.store_id, analysisId, productAssetId, JSON.stringify(shots)],
  );
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
