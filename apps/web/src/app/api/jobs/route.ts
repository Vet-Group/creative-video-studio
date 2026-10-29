import { reserve, withTransaction } from '@cvs/core/ledger';
import { type CapRefusal, checkCaps, dailyClips } from '@cvs/core/limits';
import { estimateUsd, FEATURE_PROMPTS, PROMPT_CEILING, promptLimit, textToImage, usdPerSecondFor } from '@cvs/core/models';
import { videoInputs } from '@cvs/core/providers/fal';
import { VIDEO_QUEUE, videoSendOptions } from '@cvs/core/queue';
import { FEATURES } from '@cvs/db';
import { pool } from '@/lib/auth';
import { boss } from '@/lib/queue';
import { findChoice } from '@/lib/choices';
import { ADVANCED_MAX_SCRIPT } from '@/lib/marketing';
import { guard } from '@/lib/session';

/** Create Video takes up to 9 images (the most a fal reference schema allows, as Fash offers); the model's max_images is checked under the lock. */
const MAX_IMAGES = 9;
/** Marketing Studio Advanced (`params.format` 'advanced') takes up to 7 reference images, as on the reference site; the model's max_images is checked under the lock. */
const MAX_ADVANCED_IMAGES = 7;
/** An image job may name more inputs; the model's own max_images is checked under the lock. */
const MAX_IMAGE_INPUTS = 16;
/** The features that run on a video model; every other feature runs on an image model. */
const VIDEO_FEATURES = ['video', 'marketing', 'motion_control'];
/** The features that offer Enhance, as on Fash: Create Videos and Image Generation. */
const ENHANCE_FEATURES = ['video', 'image'];
const QUALITIES = ['auto', 'low', 'medium', 'high'];
/** The apps that need more than one input image; the model's own max_images is the upper limit. Try On has its own message below. */
/** The apps whose fixed instruction a member's own prompt is added to, not replaced by. */
const APPEND_TO_INSTRUCTION = ['character_swap', 'model_swap'];
const MIN_INPUTS: Record<string, number> = { character_swap: 2, model_swap: 2, face_swap: 2, jewelry_try_on: 2 };
/** `presetId` is null for a free prompt, and `prompt` is null when a preset supplies it (or, in a retry, when the original's is copied). An image job has no preset and `durationSec` 0. */
type Spec = {
  assetIds: string[]; modelId: string; presetId: string | null; prompt: string | null; ratio: string; durationSec: number; storeId: string | null;
  feature: string; params: Record<string, string>;
  /** Enhance: the worker has an LLM rewrite the member's own prompt first (Create video and Image Generation only). */
  enhance: boolean;
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
 * `?mine`: the "My jobs" tray. The caller's 20 latest jobs that are not deleted, newest first, whether the worker is offline
 * (no heartbeat for 60 s), and `clips`: the video clips made today against the daily clip cap. `retried` is true once the job has its one manual retry.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  if (!new URL(request.url).searchParams.has('mine')) return bad('only ?mine is supported');
  const [jobs, worker, clips] = await Promise.all([
    pool.query(
      `select j.id, j.status, j.error, j.is_mock, j.feature, j.aspect, j.duration_s, j.params, j.model, j.retry_of, j.output_asset_id, j.poster_asset_id, j.created_at, j.finished_at,
              j.prompt, j.preset_id, j.input_asset_ids, exists (select 1 from jobs r where r.retry_of = j.id) as retried,
              exists (select 1 from favorites f where f.user_id = $1 and f.job_id = j.id) as favorite,
              (select c.usd::text from cost_entries c where c.job_id = j.id and c.kind = 'estimate') as estimate_usd
         from jobs j where j.user_id = $1 and j.deleted_at is null order by j.created_at desc, j.id desc limit 20`,
      [g.session.user.id],
    ),
    pool.query(`select not exists (select 1 from worker_heartbeat where beat_at > now() - interval '60 seconds') as offline`),
    dailyClips(pool, g.session.user.id),
  ]);
  return Response.json({
    workerOffline: worker.rows[0].offline,
    clips,
    jobs: jobs.rows.map((r) => ({
      id: r.id, status: r.status, error: r.error, isMock: r.is_mock, feature: r.feature, ratio: r.aspect, durationSec: r.duration_s, resolution: r.params.resolution ?? null, modelId: r.model, retryOf: r.retry_of,
      retried: r.retried, outputAssetId: r.output_asset_id, posterAssetId: r.poster_asset_id, createdAt: r.created_at, finishedAt: r.finished_at,
      // For the History card: the member's own words (a free prompt on Create video and Image Generation; elsewhere the prompt is composed, so the kept brief),
      // the inputs, the format and the caller's favourite.
      text: r.params.brief ?? ((r.feature === 'video' && !r.preset_id) || r.feature === 'image' ? r.prompt : null), inputAssetIds: r.input_asset_ids,
      garments: r.params.garments ? Number(r.params.garments) : null, format: r.params.format ?? null, favorite: r.favorite, estimateUsd: r.estimate_usd,
    })),
  });
}

/**
 * Create a video job: 1-9 input images the caller may use (none on a model with a text-to-video twin, videoInputs `textOnly`: then a free prompt, no preset or end frame) (their own, or the inputs of a succeeded Library clip for Reuse), an enabled
 * model, a preset or a free prompt (exactly one; a free prompt is trimmed, 1 character up to the model's prompt limit (promptLimit), and stored with a null preset), the ratio and duration the model allows, and an optional visible store. The caps are checked and the job and its
 * `estimate` ledger row are written in one transaction (429 when a cap refuses, nothing sent); the pg-boss job is sent afterwards.
 * `feature` (default `video`) picks the kind of job. `video` and `marketing` take a video model and the durations above, and an optional `params.audio` (below); `video` also takes
 * an optional `params.endAssetId`, the end frame: one of the caller's own live images, on a model whose fal request builder takes one (videoInputs), and no other `params`. `marketing` needs exactly 2 inputs (the model photo, then the product photo) and a prompt, no preset;
 * with `params.format` 'advanced' (Marketing Studio Advanced) it takes 1 to 7 reference images instead, up to the model's `max_images`. A video job's optional `params.audio` 'on' prices
 * it at the endpoint's audio price (AUDIO_USD_PER_SECOND; refused on a model without one), and 'off' or none keeps it silent. Any other feature is an
 * image job: an enabled image model that lists the feature, no preset, a prompt (the apps in FEATURE_PROMPTS may omit it and get that one), 1 to the model's `max_images`
 * inputs (Try On, the two swaps and Face Swap need at least 2; Background Changer takes a prompt or a second image as the reference), one of the model's ratios (or `auto`), `params.resolution` (a key of the model's `image_prices`, which also sets the
 * estimate), an optional `params.quality` and an optional `params.thinking` (one of the model's `thinking_levels`; the price per image stays). `durationSec` is not read and the job stores 0.
 * `motion_control` takes a video model that lists it, exactly 2 inputs (the character image, then an MP4/MOV reference video), ratio `auto`, no preset and
 * an optional prompt; its duration is the reference video's length rounded up (the body's `durationSec` is not read), which the model must allow.
 * Every other feature takes images only.
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
    const { assetIds, modelId, presetId = null, prompt: rawPrompt = null, ratio, durationSec, storeId = null, feature = 'video', params: rawParams, enhance = false } = body ?? {};
    const params = rawParams ?? {}; // null as well as absent: video clients may send it
    if (typeof feature !== 'string' || !(FEATURES as readonly string[]).includes(feature)) return bad(`feature must be one of ${FEATURES.join(', ')}`);
    const isImage = !VIDEO_FEATURES.includes(feature);
    const motion = feature === 'motion_control';
    // An app's empty prompt box means "no prompt", so its default applies (Motion Control has none: it sends no prompt).
    const freePrompt = (isImage || motion) && typeof rawPrompt === 'string' && rawPrompt.trim() === '' ? null : rawPrompt;
    const given = (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams) ? rawParams : {}) as Record<string, string>;
    const advanced = feature === 'marketing' && given.format === 'advanced';
    const maxInputs = isImage ? MAX_IMAGE_INPUTS : advanced ? MAX_ADVANCED_IMAGES : MAX_IMAGES;
    // Image Generation and Create video may have no image (text to image or video, on a model that offers it: checked with the model below).
    const fewest = feature === 'image' || feature === 'video' ? 0 : 1;
    if (!Array.isArray(assetIds) || assetIds.length < fewest || assetIds.length > maxInputs || !assetIds.every((a) => typeof a === 'string') || new Set(assetIds).size !== assetIds.length) {
      return bad(`assetIds must list ${fewest} to ${maxInputs} different asset ids`);
    }
    if (feature === 'try_on' && assetIds.length < 2) return bad('Try On needs the person image and at least one garment image');
    if (feature === 'marketing' && !advanced && assetIds.length !== 2) return bad('Marketing Studio needs exactly 2 images: the model photo first, then the product photo');
    if (feature === 'marketing' && (presetId !== null || typeof freePrompt !== 'string' || freePrompt.trim() === '')) return bad('Marketing Studio takes a prompt and no preset');
    if (assetIds.length < (MIN_INPUTS[feature] ?? fewest)) return bad(`${feature} needs ${MIN_INPUTS[feature]} images`);
    if (motion && (assetIds.length !== 2 || presetId !== null)) return bad('Motion Control needs exactly 2 inputs (the character image, then the reference video) and no preset');
    if (typeof modelId !== 'string' || (presetId !== null && typeof presetId !== 'string') || (freePrompt !== null && typeof freePrompt !== 'string') || typeof ratio !== 'string' || (!isImage && !motion && !Number.isInteger(durationSec)) || (storeId !== null && typeof storeId !== 'string')) {
      return bad('modelId, ratio, durationSec (a whole number, video only), a presetId or a prompt, and an optional storeId are required');
    }
    const entries = params && typeof params === 'object' && !Array.isArray(params) ? Object.entries(params) : null;
    // Images take resolution, quality and thinking, plus the member's own text (and Try On its garment count) kept for reuse; Marketing Studio takes format ('advanced'),
    // audio ('on' or 'off') and the form's own inputs. The kept inputs are never read by the worker. Create video takes audio and an end frame; the others none.
    const keys = isImage ? ['resolution', 'quality', 'thinking', 'brief', ...(feature === 'try_on' ? ['garments'] : [])] : feature === 'marketing' ? ['format', 'audio', 'hook', 'location', 'brief', 'script'] : feature === 'video' ? ['audio', 'endAssetId'] : [];
    if (!entries || entries.some(([k, v]) => !keys.includes(k) || typeof v !== 'string')) {
      return bad(keys.length > 0 ? `params may hold only ${keys.length > 1 ? `${keys.slice(0, -1).join(', ')} and ${keys.at(-1)}` : keys[0]}, as text` : 'params are for image features, Create video and Marketing Studio only');
    }
    if (isImage && given.resolution === undefined) return bad('params.resolution is required');
    if (given.format !== undefined && given.format !== 'advanced') return bad('params.format must be advanced');
    if (given.audio !== undefined && given.audio !== 'on' && given.audio !== 'off') return bad('params.audio must be on or off');
    if (given.quality !== undefined && !QUALITIES.includes(given.quality)) return bad(`params.quality must be one of ${QUALITIES.join(', ')}`);
    // A built-in hook or location, or the member's own or a company one (lib/choices.ts).
    for (const key of ['hook', 'location'] as const) {
      if (given[key] !== undefined && !(await findChoice(userId, key, given[key]))) return bad(`params.${key} must be one of the built-in ${key}s, your own or the company's`);
    }
    // The member's text kept for reuse: the brief is part of the prompt, which the model's limit holds below; the script is held to what a clip can say.
    for (const [key, max] of [['brief', PROMPT_CEILING], ['script', ADVANCED_MAX_SCRIPT]] as const) {
      if (given[key] !== undefined && given[key].length > max) return bad(`params.${key} may be at most ${max} characters`);
    }
    if (given.script !== undefined && !advanced) return bad('params.script is for Advanced only');
    if (given.garments !== undefined && !(/^[1-9]$/.test(given.garments) && Number(given.garments) <= assetIds.length - 1)) {
      return bad(`params.garments must count the garment images (1 to ${assetIds.length - 1})`);
    }
    // The PRD gives "an optional prompt, or one of the presets" for video: exactly one of the two. An image job has no presets.
    if (!motion && (isImage ? presetId !== null || (freePrompt === null && !Object.hasOwn(FEATURE_PROMPTS, feature)) : (presetId === null) === (freePrompt === null))) {
      return bad(isImage ? 'an image job takes a prompt and no preset (only the apps may omit the prompt)' : 'give either a presetId or a prompt, not both and not neither');
    }
    // The presets move the product in the image, and the end frame is where the first image goes.
    if (feature === 'video' && assetIds.length === 0 && (presetId !== null || given.endAssetId !== undefined)) return bad('a Run with no image takes a prompt, and no preset or end frame');
    // Background Changer takes a prompt (one image) or a reference image (two images), the schema says not both.
    if (feature === 'background_changer' && (assetIds.length > 1) === (freePrompt !== null)) return bad('Background Changer takes a prompt or a reference image (the second image), not both and not neither');
    if (typeof enhance !== 'boolean') return bad('enhance must be true or false');
    if (enhance && (!ENHANCE_FEATURES.includes(feature) || presetId !== null)) return bad('Enhance rewrites your own prompt in Create video and Image Generation only');
    const written = freePrompt?.trim();
    const prompt = written && APPEND_TO_INSTRUCTION.includes(feature) ? `${FEATURE_PROMPTS[feature]}. ${written}` : (written ?? FEATURE_PROMPTS[feature] ?? (motion ? '' : null));
    if (prompt !== null && ((prompt === '' && !motion) || prompt.length > PROMPT_CEILING)) return bad(`the prompt must have 1 to ${PROMPT_CEILING} characters`);
    const usable = await pool.query(
      `select a.id, a.mime, a.duration_ms from assets a
        where a.id = any($1::text[]) and a.deleted_at is null and a.kind = 'input'
          and (a.owner_id = $2 or exists (select 1 from jobs j where a.id = any(j.input_asset_ids) and j.status = 'succeeded' and j.deleted_at is null and j.purged_at is null))`,
      [assetIds, userId],
    );
    if (usable.rowCount !== assetIds.length) return bad('one or more assets do not exist or cannot be used');
    const byId = new Map(usable.rows.map((r: { id: string; mime: string; duration_ms: number | null }) => [r.id, r]));
    const isVideo = (i: number) => byId.get(assetIds[i] as string)!.mime.startsWith('video/');
    if (motion ? isVideo(0) || !isVideo(1) : assetIds.some((_, i) => isVideo(i))) {
      return bad(motion ? 'Motion Control needs the character image first, then the reference video' : 'only Motion Control takes a video input');
    }
    // The end frame is the caller's own image (whether the model takes one is checked with the model below).
    if (given.endAssetId !== undefined) {
      const end = await pool.query(`select mime from assets where id = $1 and owner_id = $2 and kind = 'input' and deleted_at is null`, [given.endAssetId, userId]);
      if (!end.rows[0]?.mime.startsWith('image/')) return bad('params.endAssetId must be one of your own images');
    }
    const length = motion ? Math.ceil(byId.get(assetIds[1] as string)!.duration_ms! / 1000) : (durationSec as number);
    spec = { assetIds, modelId, presetId, prompt, ratio, durationSec: isImage ? 0 : length, storeId: storeId as string | null, feature, params: params as Record<string, string>, enhance };
  }

  const id = crypto.randomUUID();
  const refused = await withTransaction(pool, async (tx): Promise<Response | null> => {
    // One writer at a time, so two Runs cannot both take the last daily slot or the last dollars of the month.
    await tx.query(`select pg_advisory_xact_lock(hashtext('caps'))`);
    // The model, preset, store and assets are read under the lock, so one disabled or hidden meanwhile is refused.
    let s = spec;
    let original: { team_id: string; provider: string; prompt: string; enhanced_prompt: string | null } | undefined;
    if (retryOf !== null) {
      const o = (await tx.query('select user_id, team_id, store_id, status, retry_of, input_asset_ids, model, provider, preset_id, prompt, enhance, enhanced_prompt, aspect, duration_s, feature, params from jobs where id = $1', [retryOf])).rows[0];
      if (!o) return Response.json({ error: 'the job to retry does not exist' }, { status: 404 });
      if (o.user_id !== userId) return Response.json({ error: 'only the owner of a job may retry it' }, { status: 403 });
      if (!['failed', 'timed_out', 'failed_unknown'].includes(o.status)) return Response.json({ error: 'only a failed job can be retried' }, { status: 409 });
      if (o.retry_of !== null || (await tx.query('select 1 from jobs where retry_of = $1', [retryOf])).rowCount) {
        return Response.json({ error: 'a job can be retried only once, and a retry cannot be retried' }, { status: 409 });
      }
      s = { assetIds: o.input_asset_ids, modelId: o.model, presetId: o.preset_id, prompt: o.prompt, ratio: o.aspect, durationSec: o.duration_s, storeId: o.store_id, feature: o.feature, params: o.params, enhance: o.enhance };
      original = o;
    }
    const { assetIds, modelId, presetId, prompt: freePrompt, ratio, durationSec, storeId, feature, params, enhance } = s!;
    const isImage = !VIDEO_FEATURES.includes(feature);
    // A new Run was checked before the lock and a retry never was, so both look again: an image deleted meanwhile is refused.
    const inputs = [...new Set([...assetIds, ...(params.endAssetId ? [params.endAssetId] : [])])];
    const live = await tx.query('select 1 from assets where id = any($1::text[]) and deleted_at is null', [inputs]);
    if (live.rowCount !== inputs.length) return bad('one or more assets were deleted');
    const model = (await tx.query('select enabled, provider, endpoint, kind, features, ratios, thinking_levels, durations_sec, max_images, max_prompt_chars, usd_per_second, image_prices from model_configs where id = $1', [modelId])).rows[0];
    if (!model?.enabled) return bad('the model does not exist or is not enabled');
    if (model.kind !== (isImage ? 'image' : 'video') || !model.features.includes(feature)) return bad('the model does not offer this feature');
    if (feature === 'image' && assetIds.length === 0 && !textToImage(model)) return bad('the model needs at least one input image');
    // A retry copies a Run this check already passed.
    if (!original && feature === 'video' && assetIds.length === 0 && !videoInputs(model.endpoint).textOnly) return bad('the model needs at least one input image');
    if (params.endAssetId !== undefined && !videoInputs(model.endpoint).endFrame) return bad('the model does not take an end frame');
    // Own keys only, with a plain decimal price: `in` would also accept "constructor" and friends.
    const imagePrice = isImage && Object.hasOwn(model.image_prices ?? {}, params.resolution!) ? String(model.image_prices[params.resolution!]) : null;
    if (!model.ratios.includes(ratio) || !(isImage ? imagePrice !== null && /^\d+(\.\d+)?$/.test(imagePrice) : model.durations_sec.includes(durationSec)) || assetIds.length > model.max_images) {
      return bad(isImage ? 'the model does not allow this ratio, resolution or number of images' : 'the model does not allow this ratio, duration or number of images');
    }
    if (params.thinking !== undefined && !model.thinking_levels.includes(params.thinking)) {
      return bad(model.thinking_levels.length > 0 ? `params.thinking must be one of ${model.thinking_levels.join(', ')} on this model` : 'the model has no thinking level');
    }
    let prompt = original?.prompt ?? freePrompt;
    if (!original) {
      if (presetId !== null) {
        prompt = (await tx.query('select prompt from presets where id = $1 and enabled', [presetId])).rows[0]?.prompt;
        if (prompt === undefined) return bad('the preset does not exist or is not enabled');
      }
      // Checked here, before anything is reserved, rather than refused by the provider after the money is held. A retry sends the prompt it was checked with.
      const limit = promptLimit(model.max_prompt_chars);
      if (prompt && prompt.length > limit) return bad(`the prompt may be at most ${limit} characters on this model`);
      if (storeId !== null && (await tx.query('select 1 from stores where id = $1 and not hidden', [storeId])).rowCount === 0) {
        return bad('the store does not exist or is hidden');
      }
    }
    const provider = original?.provider ?? model.provider;
    const perSecond = isImage ? null : usdPerSecondFor({ endpoint: model.endpoint, usdPerSecond: model.usd_per_second }, params.audio);
    if (!isImage && perSecond === undefined) return bad('the model cannot generate audio');
    const estimate = isImage ? Number(imagePrice).toFixed(4) : estimateUsd(perSecond!, durationSec);
    // A mock job books 0 USD (see the ledger), so it adds nothing to the monthly cap.
    const cap = await checkCaps(tx, userId, provider === 'mock' ? '0' : estimate, undefined, feature);
    if (cap) return Response.json({ error: CAP_MESSAGES[cap] }, { status: 429 });
    await tx.query(
      // A retry keeps the original's brief, so it is not rewritten (and paid for) again.
      `insert into jobs (id, user_id, team_id, store_id, retry_of, feature, model, provider, preset_id, prompt, aspect, duration_s, params, input_asset_ids, is_mock, enhance, enhanced_prompt)
       values ($1, $2, coalesce($3, (select team_id from users where id = $2)), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17)`,
      [id, userId, original?.team_id ?? null, storeId, retryOf, feature, modelId, provider, presetId, prompt, ratio, durationSec, JSON.stringify(params), assetIds, provider === 'mock', enhance, original?.enhanced_prompt ?? null],
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
