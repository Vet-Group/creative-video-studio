import { reserve, withTransaction } from '@cvs/core/ledger';
import { VIDEO_QUEUE, videoSendOptions } from '@cvs/core/queue';
import { pool } from '@/lib/auth';
import { boss } from '@/lib/queue';
import { guard } from '@/lib/session';

const MAX_IMAGES = 4;
const bad = (error: string) => Response.json({ error }, { status: 400 });

/**
 * Create a video job: 1-4 input images the caller may use (their own, or the inputs of a succeeded Library clip for Reuse), an enabled
 * model, a preset, the ratio and duration the model allows, and an optional visible store. The job and its `estimate`
 * ledger row are written in one transaction; the pg-boss job is sent afterwards.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const { assetIds, modelId, presetId, ratio, durationSec, storeId = null } = body ?? {};
  if (!Array.isArray(assetIds) || assetIds.length < 1 || assetIds.length > MAX_IMAGES || !assetIds.every((a) => typeof a === 'string') || new Set(assetIds).size !== assetIds.length) {
    return bad(`assetIds must list 1 to ${MAX_IMAGES} different asset ids`);
  }
  if (typeof modelId !== 'string' || typeof presetId !== 'string' || typeof ratio !== 'string' || !Number.isInteger(durationSec) || (storeId !== null && typeof storeId !== 'string')) {
    return bad('modelId, presetId, ratio, durationSec (a whole number) and an optional storeId are required');
  }
  const userId = g.session.user.id;

  const usable = await pool.query(
    `select a.id from assets a
      where a.id = any($1::text[]) and a.deleted_at is null and a.kind = 'input'
        and (a.owner_id = $2 or exists (select 1 from jobs j where a.id = any(j.input_asset_ids) and j.status = 'succeeded' and j.deleted_at is null and j.purged_at is null))`,
    [assetIds, userId],
  );
  if (usable.rowCount !== assetIds.length) return bad('one or more assets do not exist or cannot be used');

  const model = (await pool.query('select enabled, provider, ratios, durations_sec, max_images, usd_per_second from model_configs where id = $1', [modelId])).rows[0];
  if (!model?.enabled) return bad('the model does not exist or is not enabled');
  if (!model.ratios.includes(ratio) || !model.durations_sec.includes(durationSec) || assetIds.length > model.max_images) {
    return bad('the model does not allow this ratio, duration or number of images');
  }
  const preset = (await pool.query('select prompt from presets where id = $1 and enabled', [presetId])).rows[0];
  if (!preset) return bad('the preset does not exist or is not enabled');
  if (storeId !== null && (await pool.query('select 1 from stores where id = $1 and not hidden', [storeId])).rowCount === 0) {
    return bad('the store does not exist or is hidden');
  }

  const id = crypto.randomUUID();
  const estimateUsd = (Number(model.usd_per_second) * (durationSec as number)).toFixed(4);
  await withTransaction(pool, async (tx) => {
    await tx.query(
      `insert into jobs (id, user_id, team_id, store_id, model, provider, preset_id, prompt, aspect, duration_s, input_asset_ids, is_mock)
       values ($1, $2, (select team_id from users where id = $2), $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, userId, storeId, modelId, model.provider, presetId, preset.prompt, ratio, durationSec, assetIds, model.provider === 'mock'],
    );
    await reserve(tx, id, estimateUsd);
  });
  // The row is already queued: if the send fails, the worker's reconcile loop sends it later.
  try {
    await (await boss()).send(VIDEO_QUEUE, { jobId: id }, videoSendOptions(userId, id));
  } catch (e) {
    console.error(`Could not send job ${id} to the queue:`, e);
  }
  return Response.json({ id, status: 'queued' }, { status: 201 });
}
