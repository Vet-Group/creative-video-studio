import { reserve, withTransaction } from '@cvs/core/ledger';
import { type CapRefusal, checkCaps } from '@cvs/core/limits';
import { estimateUsd } from '@cvs/core/models';
import { VIDEO_QUEUE, videoSendOptions } from '@cvs/core/queue';
import { FEATURES } from '@cvs/db';
import { pool } from '@/lib/auth';
import { boss } from '@/lib/queue';
import { guard } from '@/lib/session';

const MAX_IMAGES = 4;
/** An image job may name more inputs; the model's own max_images is checked under the lock. */
const MAX_IMAGE_INPUTS = 16;
const MAX_PROMPT = 2000;
/** The features that run on a video model; every other feature runs on an image model. */
const VIDEO_FEATURES = ['video', 'marketing'];
const QUALITIES = ['auto', 'low', 'medium', 'high'];
/** Try On may be sent without a prompt (the person image first, then the garment); this is stored and sent instead. */
const TRY_ON_PROMPT = 'Dress the person in the first image in the garment from the other image(s). Keep the person, face, pose, body and background exactly unchanged. Do not add any text, logos or watermarks.';
/** `presetId` is null for a free prompt, and `prompt` is null when a preset supplies it (or, in a retry, when the original's is copied). An image job has no preset and `durationSec` 0. */
type Spec = {
  assetIds: string[]; modelId: string; presetId: string | null; prompt: string | null; ratio: string; durationSec: number; storeId: string | null;
  feature: string; params: Record<string, string>;
};
const bad = (error: string) => Response.json({ error }, { status: 400 });
/** Member-facing text for a Run a cap refused. */
const CAP_MESSAGES: Record<CapRefusal, string> = {
  daily_clips: 'Bạn đã dùng hết số clip trong ngày hôm nay',
  monthly_usd: 'Đã hết ngân sách tháng của công ty',
  features_monthly_usd: 'Đã hết ngân sách tháng cho ảnh và ứng dụng',
  member_daily_usd: 'Bạn đã dùng hết hạn mức chi phí hôm nay',
  member_monthly_usd: 'Bạn đã dùng hết hạn mức chi phí tháng này',
};

/**
 * `?mine`: the "My jobs" tray. The caller's 20 latest jobs that are not deleted, newest first, and whether the worker is offline
 * (no heartbeat for 60 s). `retried` is true once the job has its one manual retry.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  if (!new URL(request.url).searchParams.has('mine')) return bad('only ?mine is supported');
  const [jobs, worker] = await Promise.all([
    pool.query(
      `select j.id, j.status, j.error, j.is_mock, j.feature, j.aspect, j.duration_s, j.params, j.model, j.retry_of, j.output_asset_id, j.poster_asset_id, j.created_at, j.finished_at,
              exists (select 1 from jobs r where r.retry_of = j.id) as retried
         from jobs j where j.user_id = $1 and j.deleted_at is null order by j.created_at desc, j.id desc limit 20`,
      [g.session.user.id],
    ),
    pool.query(`select not exists (select 1 from worker_heartbeat where beat_at > now() - interval '60 seconds') as offline`),
  ]);
  return Response.json({
    workerOffline: worker.rows[0].offline,
    jobs: jobs.rows.map((r) => ({
      id: r.id, status: r.status, error: r.error, isMock: r.is_mock, feature: r.feature, ratio: r.aspect, durationSec: r.duration_s, resolution: r.params.resolution ?? null, modelId: r.model, retryOf: r.retry_of,
      retried: r.retried, outputAssetId: r.output_asset_id, posterAssetId: r.poster_asset_id, createdAt: r.created_at, finishedAt: r.finished_at,
    })),
  });
}

/**
 * Create a video job: 1-4 input images the caller may use (their own, or the inputs of a succeeded Library clip for Reuse), an enabled
 * model, a preset or a free prompt (exactly one; a free prompt is trimmed, 1 to 2000 characters, and stored with a null preset), the ratio and duration the model allows, and an optional visible store. The caps are checked and the job and its
 * `estimate` ledger row are written in one transaction (429 when a cap refuses, nothing sent); the pg-boss job is sent afterwards.
 * `feature` (default `video`) picks the kind of job. `video` and `marketing` take a video model, the durations above and no `params`. Any other feature is an
 * image job: an enabled image model that lists the feature, no preset, a prompt (Try On may omit it and gets a default), 1 to the model's `max_images`
 * inputs (Try On needs at least 2), one of the model's ratios (or `auto`), `params.resolution` (a key of the model's `image_prices`, which also sets the
 * estimate) and an optional `params.quality`. `durationSec` is not read and the job stores 0.
 * `retryOf` retries the caller's own failed job once: the inputs, model, preset, prompt, ratio, duration, team and store all come from the
 * original (the body may carry just `retryOf`), the estimate from the model's current price.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const { retryOf = null } = body ?? {};
  if (retryOf !== null && typeof retryOf !== 'string') return bad('retryOf must be a job id');
  const userId = g.session.user.id;

  // A retry takes everything from the original job, so only a new Run is validated against the body.
  let spec: Spec | null = null;
  if (retryOf === null) {
    const { assetIds, modelId, presetId = null, prompt: freePrompt = null, ratio, durationSec, storeId = null, feature = 'video', params: rawParams } = body ?? {};
    const params = rawParams ?? {}; // null as well as absent: video clients may send it
    if (typeof feature !== 'string' || !(FEATURES as readonly string[]).includes(feature)) return bad(`feature must be one of ${FEATURES.join(', ')}`);
    const isImage = !VIDEO_FEATURES.includes(feature);
    const maxInputs = isImage ? MAX_IMAGE_INPUTS : MAX_IMAGES;
    if (!Array.isArray(assetIds) || assetIds.length < 1 || assetIds.length > maxInputs || !assetIds.every((a) => typeof a === 'string') || new Set(assetIds).size !== assetIds.length) {
      return bad(`assetIds must list 1 to ${maxInputs} different asset ids`);
    }
    if (feature === 'try_on' && assetIds.length < 2) return bad('Try On needs the person image and at least one garment image');
    if (typeof modelId !== 'string' || (presetId !== null && typeof presetId !== 'string') || (freePrompt !== null && typeof freePrompt !== 'string') || typeof ratio !== 'string' || (!isImage && !Number.isInteger(durationSec)) || (storeId !== null && typeof storeId !== 'string')) {
      return bad('modelId, ratio, durationSec (a whole number, video only), a presetId or a prompt, and an optional storeId are required');
    }
    const entries = params && typeof params === 'object' && !Array.isArray(params) ? Object.entries(params) : null;
    if (!entries || entries.some(([k, v]) => !['resolution', 'quality'].includes(k) || typeof v !== 'string')) return bad('params may hold only resolution and quality, as text');
    const given = params as Record<string, string>;
    if (isImage ? given.resolution === undefined : entries.length > 0) return bad(isImage ? 'params.resolution is required' : 'params are for image features only');
    if (given.quality !== undefined && !QUALITIES.includes(given.quality)) return bad(`params.quality must be one of ${QUALITIES.join(', ')}`);
    // The PRD gives "an optional prompt, or one of the presets" for video: exactly one of the two. An image job has no presets.
    if (isImage ? presetId !== null || (freePrompt === null && feature !== 'try_on') : (presetId === null) === (freePrompt === null)) {
      return bad(isImage ? 'an image job takes a prompt and no preset (only Try On may omit the prompt)' : 'give either a presetId or a prompt, not both and not neither');
    }
    const prompt = freePrompt?.trim() ?? (isImage ? TRY_ON_PROMPT : null);
    if (prompt !== null && (prompt === '' || prompt.length > MAX_PROMPT)) return bad(`the prompt must have 1 to ${MAX_PROMPT} characters`);
    const usable = await pool.query(
      `select a.id from assets a
        where a.id = any($1::text[]) and a.deleted_at is null and a.kind = 'input'
          and (a.owner_id = $2 or exists (select 1 from jobs j where a.id = any(j.input_asset_ids) and j.status = 'succeeded' and j.deleted_at is null and j.purged_at is null))`,
      [assetIds, userId],
    );
    if (usable.rowCount !== assetIds.length) return bad('one or more assets do not exist or cannot be used');
    spec = { assetIds, modelId, presetId, prompt, ratio, durationSec: isImage ? 0 : (durationSec as number), storeId: storeId as string | null, feature, params: params as Record<string, string> };
  }

  const id = crypto.randomUUID();
  const refused = await withTransaction(pool, async (tx): Promise<Response | null> => {
    // One writer at a time, so two Runs cannot both take the last daily slot or the last dollars of the month.
    await tx.query(`select pg_advisory_xact_lock(hashtext('caps'))`);
    // The model, preset, store and assets are read under the lock, so one disabled or hidden meanwhile is refused.
    let s = spec;
    let original: { team_id: string; provider: string; prompt: string } | undefined;
    if (retryOf !== null) {
      const o = (await tx.query('select user_id, team_id, store_id, status, retry_of, input_asset_ids, model, provider, preset_id, prompt, aspect, duration_s, feature, params from jobs where id = $1', [retryOf])).rows[0];
      if (!o) return Response.json({ error: 'the job to retry does not exist' }, { status: 404 });
      if (o.user_id !== userId) return Response.json({ error: 'only the owner of a job may retry it' }, { status: 403 });
      if (!['failed', 'timed_out', 'failed_unknown'].includes(o.status)) return Response.json({ error: 'only a failed job can be retried' }, { status: 409 });
      if (o.retry_of !== null || (await tx.query('select 1 from jobs where retry_of = $1', [retryOf])).rowCount) {
        return Response.json({ error: 'a job can be retried only once, and a retry cannot be retried' }, { status: 409 });
      }
      s = { assetIds: o.input_asset_ids, modelId: o.model, presetId: o.preset_id, prompt: o.prompt, ratio: o.aspect, durationSec: o.duration_s, storeId: o.store_id, feature: o.feature, params: o.params };
      original = o;
    }
    const { assetIds, modelId, presetId, prompt: freePrompt, ratio, durationSec, storeId, feature, params } = s!;
    const isImage = !VIDEO_FEATURES.includes(feature);
    // A new Run was checked before the lock and a retry never was, so both look again: an image deleted meanwhile is refused.
    const live = await tx.query('select 1 from assets where id = any($1::text[]) and deleted_at is null', [assetIds]);
    if (live.rowCount !== assetIds.length) return bad('one or more assets were deleted');
    const model = (await tx.query('select enabled, provider, kind, features, ratios, durations_sec, max_images, usd_per_second, image_prices from model_configs where id = $1', [modelId])).rows[0];
    if (!model?.enabled) return bad('the model does not exist or is not enabled');
    if (model.kind !== (isImage ? 'image' : 'video') || !model.features.includes(feature)) return bad('the model does not offer this feature');
    // Own keys only, with a plain decimal price: `in` would also accept "constructor" and friends.
    const imagePrice = isImage && Object.hasOwn(model.image_prices ?? {}, params.resolution!) ? String(model.image_prices[params.resolution!]) : null;
    if (!model.ratios.includes(ratio) || !(isImage ? imagePrice !== null && /^\d+(\.\d+)?$/.test(imagePrice) : model.durations_sec.includes(durationSec)) || assetIds.length > model.max_images) {
      return bad(isImage ? 'the model does not allow this ratio, resolution or number of images' : 'the model does not allow this ratio, duration or number of images');
    }
    let prompt = original?.prompt ?? freePrompt;
    if (!original) {
      if (presetId !== null) {
        prompt = (await tx.query('select prompt from presets where id = $1 and enabled', [presetId])).rows[0]?.prompt;
        if (prompt === undefined) return bad('the preset does not exist or is not enabled');
      }
      if (storeId !== null && (await tx.query('select 1 from stores where id = $1 and not hidden', [storeId])).rowCount === 0) {
        return bad('the store does not exist or is hidden');
      }
    }
    const provider = original?.provider ?? model.provider;
    const estimate = isImage ? Number(imagePrice).toFixed(4) : estimateUsd(model.usd_per_second, durationSec);
    // A mock job books 0 USD (see the ledger), so it adds nothing to the monthly cap.
    const cap = await checkCaps(tx, userId, provider === 'mock' ? '0' : estimate, undefined, feature);
    if (cap) return Response.json({ error: CAP_MESSAGES[cap] }, { status: 429 });
    await tx.query(
      `insert into jobs (id, user_id, team_id, store_id, retry_of, feature, model, provider, preset_id, prompt, aspect, duration_s, params, input_asset_ids, is_mock)
       values ($1, $2, coalesce($3, (select team_id from users where id = $2)), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)`,
      [id, userId, original?.team_id ?? null, storeId, retryOf, feature, modelId, provider, presetId, prompt, ratio, durationSec, JSON.stringify(params), assetIds, provider === 'mock'],
    );
    await reserve(tx, id, estimate);
    return null;
  });
  if (refused) return refused;
  // The row is already queued: if the send fails, the worker's reconcile loop sends it later.
  try {
    await (await boss()).send(VIDEO_QUEUE, { jobId: id }, videoSendOptions(userId, id));
  } catch (e) {
    console.error(`Could not send job ${id} to the queue:`, e);
  }
  return Response.json({ id, status: 'queued' }, { status: 201 });
}
