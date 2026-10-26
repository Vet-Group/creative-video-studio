import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { LIVE_CLIP } from '@/lib/clips';
import { guard } from '@/lib/session';

const notFound = () => Response.json({ error: 'not found' }, { status: 404 });

/**
 * A job (an image job carries its `feature` and `resolution`, and `durationSec` 0) with what Reuse needs to prefill Create: the input images that still exist, preset, prompt, ratio, duration, model and store
 * (null when the store is hidden now, since a Run cannot take it). Visible to its owner and to Admins, and to everyone once it is a
 * Library clip. A deleted or purged job is 404.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const job = (
    await pool.query(
      `select j.id, j.user_id, j.status, j.error, j.is_mock, j.feature, j.params, j.preset_id, j.prompt, j.enhance, j.enhanced_prompt, j.aspect, j.duration_s, j.model, j.input_asset_ids, j.output_asset_id, j.poster_asset_id,
              (select s.id from stores s where s.id = j.store_id and not s.hidden) as store_id
         from jobs j where j.id = $1 and j.deleted_at is null and j.purged_at is null`,
      [id],
    )
  ).rows[0];
  const mine = job?.user_id === g.session.user.id || g.session.user.role === 'admin';
  if (!job || !(mine || (job.status === 'succeeded' && job.output_asset_id))) return notFound();
  const images = await pool.query(
    'select id, filename, width, height from assets where id = any($1::text[]) and deleted_at is null order by array_position($1::text[], id)',
    [job.input_asset_ids],
  );
  return Response.json({
    id: job.id, userId: job.user_id, status: job.status, error: job.error, isMock: job.is_mock, feature: job.feature, resolution: job.params.resolution ?? null, presetId: job.preset_id, prompt: job.prompt, enhance: job.enhance, enhancedPrompt: job.enhanced_prompt, audio: job.params.audio ?? null, ratio: job.aspect,
    durationSec: job.duration_s, modelId: job.model, storeId: job.store_id, outputAssetId: job.output_asset_id, posterAssetId: job.poster_asset_id, images: images.rows,
  });
}

/** Soft-deletes a Library clip (and its video and poster assets; the purge removes them after 30 days). The creator may, and so may an Admin, whose deletion of another user's clip is audited. */
export async function DELETE(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const { id: userId, role } = g.session.user;
  const refused = await withTransaction(pool, async (tx): Promise<Response | null> => {
    const job = (await tx.query(`select j.user_id, j.output_asset_id, j.poster_asset_id from jobs j where j.id = $1 and ${LIVE_CLIP} for update of j`, [id])).rows[0];
    if (!job) return notFound();
    if (job.user_id !== userId && role !== 'admin') return Response.json({ error: 'forbidden' }, { status: 403 });
    await tx.query('update jobs set deleted_at = now() where id = $1', [id]);
    await tx.query('update assets set deleted_at = now() where id = any($1::text[])', [[job.output_asset_id, job.poster_asset_id].filter(Boolean)]);
    if (job.user_id !== userId) await audit(tx, { actorId: userId, action: 'clip.delete', target: `job:${id}`, oldValue: { ownerId: job.user_id, deleted: false }, newValue: { ownerId: job.user_id, deleted: true } });
    return null;
  });
  return refused ?? Response.json({ id, deleted: true });
}
