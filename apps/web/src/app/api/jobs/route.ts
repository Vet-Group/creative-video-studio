import { reserve, withTransaction } from '@cvs/core/ledger';
import { type CapRefusal, checkCaps, dailyClips } from '@cvs/core/limits';
import { estimateUsd, extraInputUsd, FEATURE_PROMPTS, imagePricesFor, PROMPT_CEILING, promptLimit, textToImage, usdPerSecondFor, usdPerSecondWithVideo } from '@cvs/core/models';
import { videoInputs, videoRefProblem } from '@cvs/core/providers/fal';
import { VIDEO_QUEUE, videoSendOptions } from '@cvs/core/queue';
import { FEATURES } from '@cvs/db';
import { fillInputSlots } from '@cvs/db/assets';
import { pool } from '@/lib/auth';
import { mp4VideoInfo } from '@/lib/assets';
import { boss } from '@/lib/queue';
import { findChoice } from '@/lib/choices';
import { inputRefusal } from '@/lib/job-failure';
import { offeredNow, servingRow, twinEstimate } from '@/lib/model-twins';
import { BRAND_FEATURES, withBrand } from '@/lib/brand';
import { ADVANCED_MAX_SCRIPT, END_TEXT_POSITIONS, isParamFormat, MAX_END_TEXT, MAX_ENDING, MAX_HIGHLIGHT, MAX_HIGHLIGHTS, MAX_HOOK, PARAM_FORMATS, UNBOXING_ROLES } from '@/lib/marketing';
import { falBalance, falCreditUsd, overCredit } from '@/lib/provider-credit';
import { guard } from '@/lib/session';
import { getObject } from '@/lib/storage';

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
/** The shortest reference audio clip, as on Fash. */
const MIN_AUDIO_MS = 2000;
/** The apps that need more than one input image; the model's own max_images is the upper limit. Try On has its own message below. */
/** The apps whose fixed instruction a member's own prompt is added to, not replaced by. */
const APPEND_TO_INSTRUCTION = ['character_swap', 'model_swap', 'lingerie_try_on'];
const MIN_INPUTS: Record<string, number> = { character_swap: 2, model_swap: 2, face_swap: 2, jewelry_try_on: 2, lingerie_try_on: 2 };
/** `presetId` is null for a free prompt, and `prompt` is null when a preset supplies it (or, in a retry, when the original's is copied). An image job has `durationSec` 0, and no preset but Image Generation's style. */
type Spec = {
  assetIds: string[]; modelId: string; presetId: string | null; prompt: string | null; ratio: string; durationSec: number; storeId: string | null;
  feature: string; params: Record<string, string>;
  /** Enhance: the worker has an LLM rewrite the member's own prompt first (Create video and Image Generation only). */
  enhance: boolean;
  /** Add the chosen store's brand kit to the prompt (Marketing Studio and Image Generation only, lib/brand.ts). */
  useBrand: boolean;
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
 * `failureReason` is `real_person` or `sensitive_input` when the provider refused the job's input image (read from `error`), else null.
 * `twin` is `{ label, estimateUsd }` of the enabled twin model (migration 0075) a job refused for a real person can be retried on (POST `onTwin`), else null.
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
  // Only a job that BytePlus refused for a real person and has not been retried has a twin to offer; its price is what the new job's estimate would be.
  const refused = jobs.rows.filter((r) => !r.retried && !r.retry_of && ['failed', 'failed_unknown', 'timed_out'].includes(r.status) && inputRefusal(r.error)?.reason === 'real_person');
  const twins = new Map<string, { label: string; estimateUsd: string | null }>();
  if (refused.length > 0) {
    const { rows } = await pool.query(
      `select j.id as job, h.label, h.endpoint, h.usd_per_second, h.image_prices, h.thinking_levels, h.thinking_prices
         from jobs j join model_configs h on h.twin_of = j.model and h.enabled and j.feature = any(h.features) where j.id = any($1::text[]) order by h.id desc`,
      [refused.map((r) => r.id)],
    );
    // `order by h.id desc` with a later row replacing an earlier one leaves the first id, the twin a retry takes.
    for (const t of rows) {
      const j = refused.find((r) => r.id === t.job)!;
      twins.set(t.job, { label: t.label, estimateUsd: twinEstimate(t, { params: j.params, duration_s: j.duration_s, inputs: j.input_asset_ids.length }) });
    }
  }
  return Response.json({
    workerOffline: worker.rows[0].offline,
    clips,
    jobs: jobs.rows.map((r) => ({
      id: r.id, status: r.status, error: r.error, failureReason: inputRefusal(r.error)?.reason ?? null, isMock: r.is_mock, feature: r.feature, ratio: r.aspect, durationSec: r.duration_s, resolution: r.params.resolution ?? null, modelId: r.model, retryOf: r.retry_of,
      retried: r.retried, twin: twins.get(r.id) ?? null, outputAssetId: r.output_asset_id, posterAssetId: r.poster_asset_id, createdAt: r.created_at, finishedAt: r.finished_at,
      // For the History card: the member's own words (a free prompt on Create video and Image Generation; elsewhere the prompt is composed, so the kept brief),
      // the inputs, the format and the caller's favourite.
      text: r.params.brief ?? ((r.feature === 'video' && !r.preset_id) || r.feature === 'image' ? r.prompt : null), inputAssetIds: r.input_asset_ids,
      garments: r.params.garments ? Number(r.params.garments) : null, format: r.params.format ?? null, roles: r.params.roles ?? null, favorite: r.favorite, estimateUsd: r.estimate_usd,
    })),
  });
}

/**
 * Create a video job: 1-9 input images the caller may use (none on a model with a text-to-video twin, videoInputs `textOnly`: then a free prompt, no preset or end frame) (their own, or the inputs of a succeeded Library clip for Reuse), an enabled
 * model, a preset or a free prompt (exactly one; a free prompt is trimmed, 1 character up to the model's prompt limit (promptLimit), and stored with a null preset), the ratio and duration the model allows, and an optional visible store. The caps are checked and the job and its
 * `estimate` ledger row are written in one transaction (429 when a cap refuses, or when a fal Run's estimate is over what fal can still spend, lib/provider-credit.ts; nothing sent); the pg-boss job is sent afterwards.
 * `feature` (default `video`) picks the kind of job. `video` and `marketing` take a video model and the durations above, an optional `params.audio` (below), and
 * an optional `params.endAssetId`, the end frame: one of the caller's own live images, on a model whose fal request builder takes one (videoInputs); `video` also takes an optional
 * `params.audioAssetIds`, reference audio: the caller's own MP3/WAV clips (comma-separated ids), each at least 2 s, within the model's count and total length, and with a free
 * prompt its sections kept for reuse (`params.hookText` up to 200 characters and `params.ending` up to 200, already in the prompt); and no other `params`. `marketing` needs exactly 2 inputs (the model photo, then the product photo) and a prompt, no preset;
 * with `params.format` 'advanced' (Marketing Studio Advanced) it takes 1 to 7 reference images instead, up to the model's `max_images`, and an optional `params.videoAssetId`, one of the caller's own
 * MP4/MOV clips as the reference video, on a model that takes one (videoInputs `videoRefs`) within its length, size and image limits; the estimate then includes the clip's billed seconds (usdPerSecondWithVideo). Marketing also keeps `params.hookText` (the member's
 * own hook) and `params.ending` (the last shot), both already in its prompt, up to 200 characters, and `params.endText` (one line, up to 60 characters) with its optional `params.endTextPos` (bottom, middle or top), which the worker burns
 * over the clip's last 2 s. A video job's optional `params.audio` 'on' prices
 * it at the endpoint's audio price (AUDIO_USD_PER_SECOND; refused on a model without one), and 'off' or none keeps it silent; an ALWAYS_AUDIO model has sound either way, at its stored price. Any other feature is an
 * image job: an enabled image model that lists the feature, no preset (Image Generation may name one of its enabled styles, whose prompt follows the member's, who keeps theirs as `params.brief`), a prompt (the apps in FEATURE_PROMPTS may omit it and get that one), 1 to the model's `max_images`
 * inputs (Try On, the two swaps and Face Swap need at least 2; Background Changer takes a prompt or a second image as the reference), one of the model's ratios (or `auto`), `params.resolution` (a key of the model's `image_prices`, which also sets the
 * estimate), an optional `params.quality` and an optional `params.thinking` (one of the model's `thinking_levels`; its `thinking_prices` set the estimate, the first level's when none is named). `durationSec` is not read and the job stores 0.
 * `motion_control` takes a video model that lists it, exactly 2 inputs (the character image, then an MP4/MOV reference video), ratio `auto`, no preset and
 * an optional prompt; its duration is the reference video's length rounded up (the body's `durationSec` is not read), which the model must allow.
 * Every other feature takes images only. `useBrand` (Marketing Studio and Image Generation) adds the chosen store's brand kit to the prompt (lib/brand.ts).
 * `retryOf` retries the caller's own failed job once: the inputs, model, preset, prompt, ratio, duration, team and store all come from the
 * original (the body may carry just `retryOf`), the estimate from the model's current price. `onTwin: true` with `retryOf` runs it on the original model's enabled twin instead (migration 0075),
 * only for a job whose input photo BytePlus refused as a real person (`failureReason` real_person), which the dearer fal twin accepts.
 * A new Run may not name the dearer row of a pair of duplicate models while its twin can serve, nor the twin that cannot while the dearer one can (lib/model-twins.ts).
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const { retryOf = null, onTwin = false } = body ?? {};
  if (retryOf !== null && typeof retryOf !== 'string') return bad('retryOf must be a job id');
  if (typeof onTwin !== 'boolean' || (onTwin && retryOf === null)) return bad('onTwin must be true or false, and only retries a job');
  const userId = g.session.user.id;

  // A retry takes everything from the original job, so only a new Run is validated against the body.
  let spec: Spec | null = null;
  if (retryOf === null) {
    const { assetIds, modelId, presetId = null, prompt: rawPrompt = null, ratio, durationSec, storeId = null, feature = 'video', params: rawParams, enhance = false, useBrand = false } = body ?? {};
    const params = rawParams ?? {}; // null as well as absent: video clients may send it
    if (typeof feature !== 'string' || !(FEATURES as readonly string[]).includes(feature)) return bad(`feature must be one of ${FEATURES.join(', ')}`);
    const isImage = !VIDEO_FEATURES.includes(feature);
    const motion = feature === 'motion_control';
    // An app's empty prompt box means "no prompt", so its default applies (Motion Control has none: it sends no prompt).
    const freePrompt = (isImage || motion) && typeof rawPrompt === 'string' && rawPrompt.trim() === '' ? null : rawPrompt;
    const given = (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams) ? rawParams : {}) as Record<string, string>;
    const advanced = feature === 'marketing' && given.format === 'advanced';
    const review = feature === 'marketing' && given.format === 'review';
    const unboxing = feature === 'marketing' && given.format === 'unboxing';
    const maxInputs = isImage ? MAX_IMAGE_INPUTS : advanced ? MAX_ADVANCED_IMAGES : MAX_IMAGES;
    // Image Generation and Create video may have no image (text to image or video, on a model that offers it: checked with the model below).
    const fewest = feature === 'image' || feature === 'video' ? 0 : 1;
    if (!Array.isArray(assetIds) || assetIds.length < fewest || assetIds.length > maxInputs || !assetIds.every((a) => typeof a === 'string') || new Set(assetIds).size !== assetIds.length) {
      return bad(`assetIds must list ${fewest} to ${maxInputs} different asset ids`);
    }
    if (feature === 'try_on' && assetIds.length < 2) return bad('Try On needs the person image and at least one garment image');
    if (feature === 'marketing' && !advanced && !unboxing && assetIds.length !== 2) return bad('Marketing Studio needs exactly 2 images: the model photo first, then the product photo');
    if (feature === 'marketing' && (presetId !== null || typeof freePrompt !== 'string' || freePrompt.trim() === '')) return bad('Marketing Studio takes a prompt and no preset');
    if (assetIds.length < (MIN_INPUTS[feature] ?? fewest)) return bad(`${feature} needs ${MIN_INPUTS[feature]} images`);
    if (motion && (assetIds.length !== 2 || presetId !== null)) return bad('Motion Control needs exactly 2 inputs (the character image, then the reference video) and no preset');
    if (typeof modelId !== 'string' || (presetId !== null && typeof presetId !== 'string') || (freePrompt !== null && typeof freePrompt !== 'string') || typeof ratio !== 'string' || (!isImage && !motion && !Number.isInteger(durationSec)) || (storeId !== null && typeof storeId !== 'string')) {
      return bad('modelId, ratio, durationSec (a whole number, video only), a presetId or a prompt, and an optional storeId are required');
    }
    const entries = params && typeof params === 'object' && !Array.isArray(params) ? Object.entries(params) : null;
    // Images take resolution, quality and thinking, plus the member's own text (and Try On its garment count) kept for reuse; Marketing Studio takes format ('advanced', 'unboxing' or 'review'),
    // audio ('on' or 'off'), an end frame, the end text the worker burns in (endText, endTextPos) and the form's own inputs. The kept inputs are never read by the
    // worker. Create video takes audio, an end frame, reference audio and its prompt's sections (hookText, ending); the others none.
    const keys = isImage ? ['resolution', 'quality', 'thinking', 'brief', ...(feature === 'try_on' ? ['garments'] : [])] : feature === 'marketing' ? ['format', 'audio', 'endAssetId', 'videoAssetId', 'hook', 'hookText', 'location', 'brief', 'script', 'ending', 'endText', 'endTextPos', 'roles', 'highlights'] : feature === 'video' ? ['audio', 'endAssetId', 'audioAssetIds', 'hookText', 'ending'] : [];
    if (!entries || entries.some(([k, v]) => !keys.includes(k) || typeof v !== 'string')) {
      return bad(keys.length > 0 ? `params may hold only ${keys.length > 1 ? `${keys.slice(0, -1).join(', ')} and ${keys.at(-1)}` : keys[0]}, as text` : 'params are for image features, Create video and Marketing Studio only');
    }
    if (isImage && given.resolution === undefined) return bad('params.resolution is required');
    if (given.format !== undefined && !isParamFormat(given.format)) return bad(`params.format must be one of ${PARAM_FORMATS.join(', ')}`);
    // Unboxing names its photos in the order sent (the model when there is one, the product, the packaging when there is one); Review lists 1 to 3 highlight lines, one per line.
    if (given.roles !== undefined || unboxing) {
      const roles = given.roles?.split(',');
      if (!unboxing || !(UNBOXING_ROLES as readonly string[]).includes(given.roles ?? '') || roles!.length !== assetIds.length) {
        return bad(`params.roles goes with the unboxing format and must be one of ${UNBOXING_ROLES.join(' | ')}, naming each of its photos`);
      }
    }
    if (given.highlights !== undefined || review) {
      const lines = given.highlights?.split('\n') ?? [];
      if (!review || lines.length < 1 || lines.length > MAX_HIGHLIGHTS || lines.some((l) => l.trim() === '' || l.length > MAX_HIGHLIGHT || /\p{Cc}/u.test(l))) {
        return bad(`params.highlights goes with the review format: 1 to ${MAX_HIGHLIGHTS} lines of text, one per line, each at most ${MAX_HIGHLIGHT} characters`);
      }
    }
    if (given.audio !== undefined && given.audio !== 'on' && given.audio !== 'off') return bad('params.audio must be on or off');
    if (given.quality !== undefined && !QUALITIES.includes(given.quality)) return bad(`params.quality must be one of ${QUALITIES.join(', ')}`);
    // A built-in hook or location, or the member's own or a company one (lib/choices.ts).
    for (const key of ['hook', 'location'] as const) {
      if (given[key] !== undefined && !(await findChoice(userId, key, given[key]))) return bad(`params.${key} must be one of the built-in ${key}s, your own or the company's`);
    }
    // The member's text kept for reuse: the brief, the own hook and the last shot are part of the prompt, which the model's limit holds below; the script is held
    // to what a clip can say, and the end text to what fits on the last frame.
    for (const [key, max] of [['brief', PROMPT_CEILING], ['script', ADVANCED_MAX_SCRIPT], ['hookText', MAX_HOOK], ['ending', MAX_ENDING], ['endText', MAX_END_TEXT]] as const) {
      if (given[key] !== undefined && given[key].length > max) return bad(`params.${key} may be at most ${max} characters`);
    }
    // A prompt section is one sentence the page put in the prompt (lib/marketing.ts sectionPrompt), so it is one line too.
    for (const key of ['hookText', 'ending'] as const) {
      if (given[key] !== undefined && (given[key].trim() === '' || /\p{Cc}/u.test(given[key]))) return bad(`params.${key} must be one line of text`);
    }
    if (feature === 'video' && presetId !== null && (given.hookText !== undefined || given.ending !== undefined)) return bad('params.hookText and params.ending go with a free prompt, not a preset');
    // One line of the member's own words, which the worker draws as they are.
    if (given.endText !== undefined && (given.endText.trim() === '' || /\p{Cc}/u.test(given.endText))) return bad('params.endText must be one line of text');
    if (given.endTextPos !== undefined && (given.endText === undefined || !(END_TEXT_POSITIONS as readonly string[]).includes(given.endTextPos))) {
      return bad(`params.endTextPos goes with params.endText and must be one of ${END_TEXT_POSITIONS.join(', ')}`);
    }
    if (given.script !== undefined && !advanced && !review) return bad('params.script is for Advanced and Review only');
    if (given.garments !== undefined && !(/^[1-9]$/.test(given.garments) && Number(given.garments) <= assetIds.length - 1)) {
      return bad(`params.garments must count the garment images (1 to ${assetIds.length - 1})`);
    }
    // The PRD gives "an optional prompt, or one of the presets" for video: exactly one of the two. An image job has no presets, but Image Generation adds a style to its prompt.
    if (!motion && (isImage ? (presetId !== null && feature !== 'image') || (freePrompt === null && !Object.hasOwn(FEATURE_PROMPTS, feature)) : (presetId === null) === (freePrompt === null))) {
      return bad(isImage ? 'an image job takes a prompt and no preset (only the apps may omit the prompt, and only Image Generation takes a style)' : 'give either a presetId or a prompt, not both and not neither');
    }
    // The presets move the product in the image, the end frame is where the first image goes, and the reference endpoints that take audio need an image too.
    if (feature === 'video' && assetIds.length === 0 && (presetId !== null || given.endAssetId !== undefined || given.audioAssetIds !== undefined)) {
      return bad('a Run with no image takes a prompt, and no preset, end frame or audio');
    }
    // Background Changer takes a prompt (one image) or a reference image (two images), the schema says not both.
    if (feature === 'background_changer' && (assetIds.length > 1) === (freePrompt !== null)) return bad('Background Changer takes a prompt or a reference image (the second image), not both and not neither');
    if (typeof enhance !== 'boolean') return bad('enhance must be true or false');
    if (enhance && (!ENHANCE_FEATURES.includes(feature) || (presetId !== null && !isImage))) return bad('Enhance rewrites your own prompt in Create video and Image Generation only');
    if (typeof useBrand !== 'boolean') return bad('useBrand must be true or false');
    if (useBrand && !BRAND_FEATURES.includes(feature)) return bad('the brand kit is for Marketing Studio and Image Generation only');
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
    if (usable.rows.some((r: { mime: string }) => r.mime.startsWith('audio/'))) return bad('an audio clip goes in params.audioAssetIds, not assetIds');
    // Reference audio: the caller's own MP3 or WAV clips, comma-separated, each at least 2 s as on Fash (fal's floor is 1.8 or 2 s); the model's count and
    // total length are checked with the model below.
    if (given.audioAssetIds !== undefined) {
      const clips = given.audioAssetIds.split(',');
      const own = await pool.query(`select mime, duration_ms from assets where id = any($1::text[]) and owner_id = $2 and kind = 'input' and deleted_at is null`, [clips, userId]);
      if (new Set(clips).size !== clips.length || own.rowCount !== clips.length || own.rows.some((r) => !r.mime.startsWith('audio/'))) return bad('params.audioAssetIds must list your own audio clips, separated by commas');
      if (own.rows.some((r) => r.duration_ms < MIN_AUDIO_MS)) return bad('each audio clip must last at least 2 seconds');
    }
    // The reference video is the caller's own MP4 or MOV clip, on Advanced only (whether the model takes one, and its length and size, are checked with the model below).
    if (given.videoAssetId !== undefined) {
      if (!advanced) return bad('params.videoAssetId is for Advanced only');
      const clip = await pool.query(`select mime, s3_key from assets where id = $1 and owner_id = $2 and kind = 'input' and deleted_at is null`, [given.videoAssetId, userId]);
      if (!clip.rows[0]?.mime.startsWith('video/')) return bad('params.videoAssetId must be one of your own videos');
      // Its picture size and frame rate against the model's limits (videoRefProblem), read from the file's header here, outside the lock. A file or a header that cannot
      // be read passes (as does a frame rate the header does not give): fal then decides.
      const endpoint = (await pool.query('select endpoint from model_configs where id = $1', [modelId])).rows[0]?.endpoint as string | undefined;
      if (endpoint && videoInputs(endpoint).videoRefs) {
        const info = await (async () => {
          try {
            return mp4VideoInfo(new Uint8Array(await new Response(await getObject(clip.rows[0].s3_key)).arrayBuffer()));
          } catch {
            return undefined;
          }
        })();
        const problem = info && videoRefProblem(endpoint, info);
        if (problem) return bad(problem);
      }
    }
    // The end frame is the caller's own image (whether the model takes one is checked with the model below).
    if (given.endAssetId !== undefined) {
      const end = await pool.query(`select mime from assets where id = $1 and owner_id = $2 and kind = 'input' and deleted_at is null`, [given.endAssetId, userId]);
      if (!end.rows[0]?.mime.startsWith('image/')) return bad('params.endAssetId must be one of your own images');
    }
    const length = motion ? Math.ceil(byId.get(assetIds[1] as string)!.duration_ms! / 1000) : (durationSec as number);
    // A style's prompt joins the member's under the lock below; their own words stay the brief, as History and Reuse read them.
    const kept = isImage && presetId !== null ? { ...(params as Record<string, string>), brief: written! } : (params as Record<string, string>);
    spec = { assetIds, modelId, presetId, prompt, ratio, durationSec: isImage ? 0 : length, storeId: storeId as string | null, feature, params: kept, enhance, useBrand };
  }

  const id = crypto.randomUUID();
  const fal = await falBalance();
  const refused = await withTransaction(pool, async (tx): Promise<Response | null> => {
    // One writer at a time, so two Runs cannot both take the last daily slot or the last dollars of the month.
    await tx.query(`select pg_advisory_xact_lock(hashtext('caps'))`);
    // The model, preset, store and assets are read under the lock, so one disabled or hidden meanwhile is refused.
    let s = spec;
    let original: { team_id: string; provider: string; prompt: string; enhanced_prompt: string | null } | undefined;
    if (retryOf !== null) {
      const o = (await tx.query('select user_id, team_id, store_id, status, error, retry_of, input_asset_ids, model, provider, preset_id, prompt, enhance, enhanced_prompt, aspect, duration_s, feature, params from jobs where id = $1', [retryOf])).rows[0];
      if (!o) return Response.json({ error: 'the job to retry does not exist' }, { status: 404 });
      if (o.user_id !== userId) return Response.json({ error: 'only the owner of a job may retry it' }, { status: 403 });
      if (!['failed', 'timed_out', 'failed_unknown'].includes(o.status)) return Response.json({ error: 'only a failed job can be retried' }, { status: 409 });
      if (o.retry_of !== null || (await tx.query('select 1 from jobs where retry_of = $1', [retryOf])).rowCount) {
        return Response.json({ error: 'a job can be retried only once, and a retry cannot be retried' }, { status: 409 });
      }
      let modelId: string = o.model;
      if (onTwin) {
        if (inputRefusal(o.error)?.reason !== 'real_person') return Response.json({ error: 'only a job refused for a real person can be retried on its twin' }, { status: 409 });
        const twin = (await tx.query('select id from model_configs where twin_of = $1 and enabled and $2 = any(features) order by id limit 1', [o.model, o.feature])).rows[0];
        if (!twin) return Response.json({ error: 'the job has no enabled twin model' }, { status: 409 });
        modelId = twin.id;
      }
      s = { assetIds: o.input_asset_ids, modelId, presetId: o.preset_id, prompt: o.prompt, ratio: o.aspect, durationSec: o.duration_s, storeId: o.store_id, feature: o.feature, params: o.params, enhance: o.enhance, useBrand: false };
      original = o;
    }
    const { assetIds, modelId: named, presetId, prompt: freePrompt, ratio, durationSec, storeId, feature, enhance, useBrand } = s!;
    // A retry's prompt already carries the brand block it was sent with, so the brand is added to a new Run only.
    let params = s!.params;
    const isImage = !VIDEO_FEATURES.includes(feature);
    // A new video Run on one model of a duplicate pair runs on the row of the pair that can make it (migration 0078); a retry keeps the row it names.
    const modelId =
      original || isImage
        ? named
        : await servingRow(tx, named, feature, {
            durationSec,
            ratio,
            images: assetIds.length,
            video: params.videoAssetId !== undefined,
            audioClips: params.audioAssetIds?.split(',').length ?? 0,
            endFrame: params.endAssetId !== undefined,
            audio: params.audio === 'on',
          });
    // A new Run was checked before the lock and a retry never was, so both look again: an image deleted meanwhile is refused.
    const clips = params.audioAssetIds?.split(',') ?? [];
    // A Set: the end frame may be the first image again, for a clip that loops.
    const inputs = [...new Set([...assetIds, ...(params.endAssetId ? [params.endAssetId] : []), ...(params.videoAssetId ? [params.videoAssetId] : []), ...clips])];
    const live = await tx.query('select 1 from assets where id = any($1::text[]) and deleted_at is null', [inputs]);
    if (live.rowCount !== inputs.length) return bad('one or more assets were deleted');
    const model = (await tx.query('select enabled, provider, endpoint, kind, features, ratios, thinking_levels, durations_sec, max_images, max_prompt_chars, usd_per_second, image_prices, thinking_prices from model_configs where id = $1', [modelId])).rows[0];
    if (!model?.enabled) return bad('the model does not exist or is not enabled');
    if (model.kind !== (isImage ? 'image' : 'video') || !model.features.includes(feature)) return bad('the model does not offer this feature');
    if (feature === 'image' && assetIds.length === 0 && !textToImage(model)) return bad('the model needs at least one input image');
    // A retry copies a Run this check already passed.
    if (!original && feature === 'video' && assetIds.length === 0 && !videoInputs(model.endpoint).textOnly) return bad('the model needs at least one input image');
    // What the model takes is read for the request the worker will make: with a reference video that is the video-to-video sibling where the row has one (Kling O3 Pro).
    const takesNow = videoInputs(model.endpoint, params.videoAssetId !== undefined);
    if (params.endAssetId !== undefined && !takesNow.endFrame) return bad(takesNow.endFrame !== videoInputs(model.endpoint).endFrame ? 'the model takes no end frame together with a reference video' : 'the model does not take an end frame');
    const endMax = takesNow.endMaxSec;
    if (params.endAssetId !== undefined && endMax !== null && durationSec > endMax) return bad(`the model takes an end frame on clips of at most ${endMax} seconds`);
    if (clips.length > 0) {
      const takes = takesNow.audioClips;
      const ms = (await tx.query('select coalesce(sum(duration_ms), 0)::int as ms from assets where id = any($1::text[])', [clips])).rows[0].ms as number;
      if (!takes || clips.length > takes.max || ms > takes.seconds * 1000) return bad(takes ? `the model takes at most ${takes.max} audio clips, ${takes.seconds} seconds in all` : 'the model does not take reference audio');
    }
    // The reference video: the model must take one, the clip must fit its length and size, and the images fit with it (Kling O3 allows 4 in all); its seconds, rounded up, price the Run.
    let refSec = 0;
    if (params.videoAssetId !== undefined) {
      const takes = videoInputs(model.endpoint).videoRefs;
      if (!takes) return bad('the model does not take a reference video');
      if (takes.silent && params.audio === 'on') return bad('the model makes no sound with a reference video; send params.audio off');
      const clip = (await tx.query('select duration_ms, bytes from assets where id = $1', [params.videoAssetId])).rows[0] as { duration_ms: number | null; bytes: number };
      if (clip.duration_ms === null || clip.duration_ms < takes.minSec * 1000 || clip.duration_ms > takes.maxSec * 1000) return bad(`the reference video must last ${takes.minSec} to ${takes.maxSec} seconds on this model`);
      if (takes.maxMb !== null && clip.bytes > takes.maxMb * 1024 * 1024) return bad(`the reference video may be at most ${takes.maxMb} MB on this model`);
      if (takes.maxImages !== null && assetIds.length > takes.maxImages) return bad(`the model takes at most ${takes.maxImages} images with a reference video`);
      refSec = Math.ceil(clip.duration_ms / 1000);
    }
    // Own keys only, with a plain decimal price: `in` would also accept "constructor" and friends.
    const prices = isImage ? imagePricesFor(model, params.thinking) : {};
    const imagePrice = isImage && Object.hasOwn(prices, params.resolution!) ? String(prices[params.resolution!]) : null;
    if (!model.ratios.includes(ratio) || !(isImage ? imagePrice !== null && /^\d+(\.\d+)?$/.test(imagePrice) : model.durations_sec.includes(durationSec)) || assetIds.length > model.max_images) {
      return bad(isImage ? 'the model does not allow this ratio, resolution or number of images' : 'the model does not allow this ratio, duration or number of images');
    }
    if (params.thinking !== undefined && !model.thinking_levels.includes(params.thinking)) {
      return bad(model.thinking_levels.length > 0 ? `params.thinking must be one of ${model.thinking_levels.join(', ')} on this model` : 'the model has no thinking level');
    }
    let prompt = original?.prompt ?? freePrompt;
    if (!original) {
      if (presetId !== null) {
        // A Create preset on Create video, an Image Generation style on an image job: never the other page's.
        const preset: string | undefined = (await tx.query('select prompt from presets where id = $1 and enabled and feature = $2', [presetId, isImage ? 'image' : 'video'])).rows[0]?.prompt;
        if (preset === undefined) return bad('the preset does not exist or is not enabled');
        prompt = isImage ? `${freePrompt}\n\n${preset}` : preset;
      }
      const store = storeId === null ? null : (await tx.query(`select brand_voice as "brandVoice", brand_colors as "brandColors", brand_tagline as "brandTagline" from stores where id = $1 and not hidden`, [storeId])).rows[0];
      if (storeId !== null && !store) return bad('the store does not exist or is hidden');
      // The brand kit goes after the member's words and the style, into the stored prompt, so History, Retry and the worker all see what the provider got;
      // `params.brand` marks it for the switch's memory, and on Image Generation the member's own words stay the one brief (a style already set it).
      const branded = useBrand && store && prompt ? withBrand(prompt, store, feature) : prompt;
      if (branded !== prompt) {
        params = { ...params, brand: 'on', ...(feature === 'image' && params.brief === undefined && { brief: freePrompt! }) };
        prompt = branded;
      }
      // Checked here, before anything is reserved, rather than refused by the provider after the money is held. A retry sends the prompt it was checked with.
      const limit = promptLimit(model.max_prompt_chars);
      if (prompt && prompt.length > limit) return bad(`the prompt may be at most ${limit} characters on this model`);
    }
    // A retry on the twin goes to the twin's provider, not the failed job's.
    const provider = onTwin ? model.provider : (original?.provider ?? model.provider);
    const perSecond = isImage ? null : usdPerSecondFor({ endpoint: model.endpoint, usdPerSecond: model.usd_per_second }, params.audio);
    if (!isImage && perSecond === undefined) return bad('the model cannot generate audio');
    const estimate = isImage ? (Number(imagePrice) + extraInputUsd(model.endpoint, assetIds.length)).toFixed(4) : estimateUsd(refSec > 0 ? usdPerSecondWithVideo(model.endpoint, perSecond!, durationSec, refSec) : perSecond!, durationSec);
    // Under the same lock, so two Runs cannot both spend fal's last dollars.
    const credit = await falCreditUsd(tx, fal);
    // A new Run takes the row the pickers offer of a pair of duplicate models; a retry copies a Run that was offered. The fal lock is read on video only (the one fal row with a twin is Veo).
    if (!original && !(await offeredNow(tx, named, (v) => v.kind === 'video' && v.usd_per_second !== null && overCredit(v.provider, estimateUsd(v.usd_per_second, durationSec), credit)))) {
      return bad('the model is not offered now: its duplicate twin serves in its place');
    }
    // A mock job books 0 USD (see the ledger), so it adds nothing to the monthly cap.
    const cap = await checkCaps(tx, userId, provider === 'mock' ? '0' : estimate, undefined, feature);
    if (cap) return Response.json({ error: CAP_MESSAGES[cap] }, { status: 429 });
    if (overCredit(provider, estimate, credit)) {
      return Response.json({ error: `fal.ai chỉ còn $${Math.max(0, Number(credit)).toFixed(2)}, không đủ cho lần chạy này (khoảng $${Number(estimate).toFixed(2)}). Hãy chọn model rẻ hơn hoặc báo Admin nạp thêm credits.` }, { status: 429 });
    }
    await tx.query(
      // A retry keeps the original's brief, so it is not rewritten (and paid for) again.
      `insert into jobs (id, user_id, team_id, store_id, retry_of, feature, model, provider, preset_id, prompt, aspect, duration_s, params, input_asset_ids, is_mock, enhance, enhanced_prompt)
       values ($1, $2, coalesce($3, (select team_id from users where id = $2)), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17)`,
      [id, userId, original?.team_id ?? null, storeId, retryOf, feature, modelId, provider, presetId, prompt, ratio, durationSec, JSON.stringify(params), assetIds, provider === 'mock', enhance, original?.enhanced_prompt ?? null],
    );
    await reserve(tx, id, estimate);
    await fillInputSlots(tx, id); // the uploaded-photos picker files each photo under the slot it was first run from
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
