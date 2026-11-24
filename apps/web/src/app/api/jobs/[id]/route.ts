import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { storeAllowed } from '@/lib/billing';
import { LIVE_CLIP } from '@/lib/clips';
import { guard } from '@/lib/session';

const notFound = () => Response.json({ error: 'not found' }, { status: 404 });

/**
 * A job (an image job carries its `feature` and `resolution`, and `durationSec` 0) with what Reuse needs to prefill Create: the input images that still exist, preset, prompt, ratio, duration, model and store
 * (null when the store is hidden now or the caller may not pick it, another billing team's, since a Run cannot take it, and `storeLost` says so), the model's label, how many input images the job had (`inputCount`, so the form can say how many no longer exist) and their ids in the job's order (`inputIds`, so each image goes back to its own slot when one before it is gone), the end frame that still exists (to everyone who gets the inputs when it is one of them, a clip that loops, since a Run takes an end frame among its own images;
 * else to its creator only, as a Run takes only the caller's own), and to its creator the reference audio that still exists. Visible to its owner and to Admins, and to everyone once it is a
 * Library clip. A deleted or purged job is 404. `batchItems` lists, to its creator, every job of a batch app's Run with its item (view, breed, style, product, name, pose or own pose words, colour or shot), id, status and
 * `outputAssetId` (null once purged), so History's select-the-Run button picks the whole Run's results, however many; else null.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const job = (
    await pool.query(
      `select j.id, j.user_id, j.status, j.error, j.is_mock, j.feature, j.params, j.preset_id, j.prompt, j.enhance, j.enhanced_prompt, j.aspect, j.duration_s, j.model, j.input_asset_ids, j.output_asset_id, j.poster_asset_id, j.face_match, j.store_id as job_store_id,
              (select m.label from model_configs m where m.id = j.model) as model_label,
              (select s.id from stores s where s.id = j.store_id and s.workspace_id = j.workspace_id and not s.hidden and ${storeAllowed('s', '$3')}) as store_id
         from jobs j where j.id = $1 and j.workspace_id = $2 and j.deleted_at is null and j.purged_at is null`,
      [id, g.workspaceId, g.session.user.id],
    )
  ).rows[0];
  const own = job?.user_id === g.session.user.id;
  const mine = own || g.session.user.role === 'admin';
  if (!job || !(mine || (job.status === 'succeeded' && job.output_asset_id))) return notFound();
  const images = await pool.query(
    'select id, filename, width, height, mime, duration_ms as "durationMs" from assets where id = any($1::text[]) and workspace_id = $2 and deleted_at is null order by array_position($1::text[], id)',
    [job.input_asset_ids, g.workspaceId],
  );
  // `bytes` adds the size, which the reference video's form check reads (ReferenceVideo.tsx); the other inputs do not carry it.
  const owned = (ids: string[], bytes = false) =>
    pool.query(
      `select id, filename, mime${bytes ? ', bytes' : ''}, duration_ms as "durationMs" from assets where id = any($1::text[]) and owner_id = $2 and workspace_id = $3 and kind = 'input' and deleted_at is null order by array_position($1::text[], id)`,
      [own ? ids : [], job.user_id, g.workspaceId],
    );
  // An end frame that is one of the inputs (a clip that loops) comes back with them, as a Run takes it (POST /api/jobs); any other only to its creator.
  const endId = job.params.endAssetId;
  const looped = endId !== undefined && job.input_asset_ids.includes(endId);
  const [end, clips, video] = await Promise.all([looped ? { rows: images.rows.filter((r) => r.id === endId) } : owned(endId ? [endId] : []), owned(job.params.audioAssetIds?.split(',') ?? []), owned(job.params.videoAssetId ? [job.params.videoAssetId] : [], true)]);
  // A job of a batch app's Run (params.batch): every job of that Run, so Reuse picks all their items again and History all their results. Only the creator's own Run: another member reuses the one job.
  const items = own && job.params.batch
    ? (
        await pool.query(
          `select id, status, case when purged_at is null then output_asset_id end as output_asset_id, params from jobs
            where user_id = $1 and workspace_id = $2 and feature = $3 and params->>'batch' = $4 and deleted_at is null order by created_at, id`,
          [job.user_id, g.workspaceId, job.feature, job.params.batch],
        )
      ).rows.map(({ params: p, ...r }) => ({ view: p.view ?? null, breed: p.breed ?? null, style: p.style ?? null, product: p.product ?? null, name: p.name ?? null, pose: p.pose ?? null, poseText: p.poseText ?? null, poseRef: p.poseRef ?? null, background: p.background ?? null, color: p.color ?? null, shot: p.shot ?? null, id: r.id, status: r.status, outputAssetId: r.output_asset_id }))
    : null;
  // The pose photos of the whole Run (the creator's own), which the pose generator's Reuse puts back in its pose photo box; only the job's own one is among `images`.
  const refIds = [...new Set((items ?? [{ poseRef: job.params.poseRef }]).flatMap((i) => (i.poseRef ? [i.poseRef as string] : [])))]; // none unless it is a pose generator job with pose photos
  const poseRefs = refIds.length > 0 ? (await owned(refIds)).rows : [];
  return Response.json({
    id: job.id, userId: job.user_id, status: job.status, error: job.error, isMock: job.is_mock, feature: job.feature, resolution: job.params.resolution ?? null, presetId: job.preset_id, prompt: job.prompt, enhance: job.enhance, enhancedPrompt: job.enhanced_prompt, audio: job.params.audio ?? null, orientation: job.params.orientation ?? null, view: job.params.view ?? null, breed: job.params.breed ?? null, style: job.params.style ?? null, product: job.params.product ?? null, name: job.params.name ?? null, ratio: job.aspect,
    // The form inputs kept for reuse (Marketing Studio's, the image pages' own text, Try On's garment count). The brief and the script show to everyone who may see the job (owner, 2026-11-03):
    // the Library is where staff learn how a result was made, and the composed prompt carries them anyway.
    garments: job.params.garments ? Number(job.params.garments) : null, pose: job.params.pose ?? null, poseText: job.params.poseText ?? null, poseRef: job.params.poseRef ?? null, faceMatch: job.face_match, background: job.params.background ?? null, color: job.params.color ?? null, shot: job.params.shot ?? null, format: job.params.format ?? null, hook: job.params.hook ?? null, location: job.params.location ?? null, brief: job.params.brief ?? null, script: job.params.script ?? null, roles: job.params.roles ?? null, highlights: job.params.highlights?.split('\n') ?? null, brand: job.params.brand === 'on',
    hookText: job.params.hookText ?? null, ending: job.params.ending ?? null, endText: job.params.endText ?? null, endTextPos: job.params.endTextPos ?? null,
    // The AI model generator's own traits (JSON), which its Reuse puts back on the form.
    traits: job.feature === 'fashion_model' ? (job.params.traits ?? null) : null,
    durationSec: job.duration_s, modelId: job.model, modelLabel: job.model_label, storeId: job.store_id, storeLost: job.job_store_id !== null && job.store_id === null, inputCount: job.input_asset_ids.length, inputIds: job.input_asset_ids, outputAssetId: job.output_asset_id, posterAssetId: job.poster_asset_id, images: images.rows, endFrame: end.rows[0] ?? null, videoRef: video.rows[0] ?? null, clips: clips.rows, poseImages: poseRefs, batchItems: items,
  });
}

/** Soft-deletes a Library clip (and its video and poster assets; the purge removes them after 30 days). The creator may, and so may an Admin, whose deletion of another user's clip is audited. */
export async function DELETE(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const { id: userId, role } = g.session.user;
  const refused = await withTransaction(pool, async (tx): Promise<Response | null> => {
    const job = (await tx.query(`select j.user_id, j.output_asset_id, j.poster_asset_id from jobs j where j.id = $1 and j.workspace_id = $2 and ${LIVE_CLIP} for update of j`, [id, g.workspaceId])).rows[0];
    if (!job) return notFound();
    if (job.user_id !== userId && role !== 'admin') return Response.json({ error: 'forbidden' }, { status: 403 });
    await tx.query('update jobs set deleted_at = now() where id = $1', [id]);
    await tx.query('update assets set deleted_at = now() where id = any($1::text[]) and workspace_id = $2', [[job.output_asset_id, job.poster_asset_id].filter(Boolean), g.workspaceId]);
    if (job.user_id !== userId) await audit(tx, { actorId: userId, action: 'clip.delete', target: `job:${id}`, oldValue: { ownerId: job.user_id, deleted: false }, newValue: { ownerId: job.user_id, deleted: true } });
    return null;
  });
  return refused ?? Response.json({ id, deleted: true });
}
