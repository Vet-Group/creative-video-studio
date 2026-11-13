// fal queue API. Docs read 2026-10-23:
//   queue (submit/status/result/cancel, auth, statuses): https://fal.ai/docs/model-apis/model-endpoints/queue
//   X-Fal-Store-IO and X-Fal-Object-Lifecycle-Preference: https://fal.ai/docs/model-apis/media-expiration
//   file inputs: https://fal.ai/docs/documentation/model-apis/fal-cdn.md says "Some models also accept data URIs" and does not document a plain-HTTP
//   upload (only the SDKs); non-https images are therefore sent as data URIs, and the B.5a canary shows whether Kling accepts them. A video is too large
//   for that, so Motion Control uploads its inputs with the SDK's storage flow instead (uploadInputs)
//   Kling O3 Pro input and output schema: https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/pro/reference-to-video
//   image endpoints (read 2026-10-24) and the other video endpoints (read 2026-10-25): https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<endpoint>,
//   one per entry of IMAGE_BODIES and VIDEO_BODIES
import { imageSize } from './image-size';
import { estimate, ImageReadError, imageEstimate, imageTokens, packJobId, plainImage, ProviderHttpError, resolveImages, sendJson, sizeFor, timeout, unpackJobId, videoTokens, type Fetch, type ReadImage } from './http';
import { isByteplusVideo } from './byteplus';
import { VERTEX_OMNI_MODEL } from './vertex-omni';
import { FAL_TEXT_ENDPOINTS } from '../models';
import type { ImageProvider, ImageSubmitRequest, ProviderStatus, SubmitRequest, VideoProvider } from './types';

const QUEUE = 'https://queue.fal.run';
const REST = 'https://rest.fal.ai';
/** One hour, the example value in the media-expiration docs; the worker copies the output at once. */
const LIFECYCLE = JSON.stringify({ expiration_duration_seconds: 3600 });

/** The docs say status, result and cancel URLs use only owner and app ("fal-ai/kling-video"), not the full endpoint path (405 otherwise). */
const appPath = (endpoint: string): string => endpoint.split('/').slice(0, 2).join('/');

const falHeaders = (apiKey: string) => ({
  Authorization: `Key ${apiKey}`,
  'Content-Type': 'application/json',
  'X-Fal-Store-IO': '0',
  'X-Fal-Object-Lifecycle-Preference': LIFECYCLE,
});

/**
 * The queue status, then the result, of one request; `cost` is the final cost to report and `pick` finds the output URL in the result. A request fal
 * dropped because its X-Fal-Request-Start-Timeout passed before any runner started it ends as 504 with X-Fal-Request-Timeout-Type: user (docs read
 * 2026-11-14: common-parameters and queue; they do not say which of the two calls answers it, so both are checked). It was never processed, so it costs 0.
 */
async function pollFal(...p: Parameters<typeof pollRequest>): Promise<ProviderStatus> {
  try {
    return await pollRequest(...p);
  } catch (e) {
    if (e instanceof ProviderHttpError && e.status === 504 && e.headers?.get('X-Fal-Request-Timeout-Type') === 'user') {
      return { state: 'failed', error: 'fal dropped the request: no runner started it before the start timeout', costUsd: 0, costSource: 'estimate' };
    }
    throw e;
  }
}

async function pollRequest(
  f: Fetch,
  headers: Record<string, string>,
  endpoint: string,
  id: string,
  cost: { costUsd: number; costSource: 'estimate' },
  pick: (out: Record<string, unknown>) => string | undefined,
  field: string,
): Promise<ProviderStatus> {
  const base = `${QUEUE}/${appPath(endpoint)}/requests/${id}`;
  const st = (await sendJson(f, 'fal status', `${base}/status`, { headers, signal: timeout() })) as { status?: string; error?: string; error_type?: string };
  if (st.status === 'IN_QUEUE') return { state: 'queued' };
  if (st.status === 'IN_PROGRESS') return { state: 'running' };
  if (st.status !== 'COMPLETED') throw new Error(`fal status: unknown status ${String(st.status)}`);
  // A failed request completes with `error` (human-readable) and `error_type` (machine-readable).
  if (st.error || st.error_type) return { state: 'failed', error: st.error ?? st.error_type ?? 'failed', ...cost };
  // The docs do not say what a failed result answers; a 4xx here is a failed job, not a poll error. Rate limits and auth errors say
  // nothing about the job, so they throw and the key is polled again.
  const out = (await sendJson(f, 'fal result', base, { headers, signal: timeout() }).catch((e) => {
    if (e instanceof ProviderHttpError && e.status >= 400 && e.status < 500 && ![401, 403, 429].includes(e.status)) return { error: e.message, rejected: true };
    throw e;
  })) as Record<string, unknown> & { error?: string; rejected?: boolean };
  // A 4xx result is fal refusing the input (e.g. 422 input_value_error), which it does not bill as a rule, so the job costs 0 and the
  // ledger releases its estimate. shortcut: fal may still bill a 422 that used GPU time; the monthly fal invoice line (invoice_diff) books that.
  if (out.rejected) return { state: 'failed', error: out.error!, costUsd: 0, costSource: 'estimate' };
  if (out.error) return { state: 'failed', error: out.error, ...cost };
  const outputUrl = pick(out);
  if (!outputUrl) return { state: 'failed', error: `fal result has no ${field}`, ...cost };
  return { state: 'succeeded', outputUrl, ...cost };
}

const atImage = (n: string) => `@Image${n}`;
const atVideo = (n: string) => `@Video${n}`;
/**
 * The smoke run of 2026-10-25 saw Seedance 2.5 and FLUX 3 Reference show the input as the first frame, then cut to the plain studio a preset asks for.
 * These endpoints start from the input image, so they are told to stay in its scene in one shot.
 */
const oneShot = (prompt: string) => `${prompt} One continuous shot that starts on the input image: keep its scene and background, with no cuts.`;

/**
 * How each fal video endpoint takes a Run, built from its input schema (read 2026-10-25, sources in migration 0015; Kling O3 Pro 2026-10-23). `crop`: the
 * endpoint has no ratio field and follows the input image, so the worker centre-crops the inputs to the chosen ratio first.
 * Audio follows the job wherever the schema has the switch (the stored prices are for audio off); the ALWAYS_AUDIO endpoints have none and always make
 * sound at the stored price (models.ts). The resolution is the one the stored price is for.
 */
interface VideoBody {
  crop?: boolean;
  /** The inputs include a video, too large to inline, so they go to fal's storage and the body carries their URLs (uploadInputs). */
  upload?: boolean;
  /**
   * The body field of an end frame, the image the clip ends on (schemas read 2026-10-30); Create Video offers the End frame slot only on these. The
   * model pages (https://fal.ai/models/<endpoint>, read 2026-10-30) price by output seconds or output tokens, so it costs nothing more, except on
   * Minimax H3 Max Reference: there it counts toward the 4,096 free reference tokens (576 to about 1,008 at 768P), past which the estimate is short.
   */
  end?: string;
  /** The longest clip, in seconds, that takes an end frame (Gemini Omni Flash 1.2: "At most 10 seconds when an end image is provided", schema read 2026-11-06). */
  endMaxSec?: number;
  /**
   * The text-to-video endpoint of the same app, where a Run with no image goes (as on Fash, the model runs from the prompt). Set only where its model
   * page (https://fal.ai/models/<endpoint>, read 2026-10-30) gives the same price as the row's, audio on and off, at the resolution the builders ask
   * for, and its schema takes every ratio and duration of the rows. Left out: Seedance 2.0 Image ($0.3034/s, its text endpoint $0.37), Grok Imagine
   * Reference ($0.07, text $0.14), Hailuo 2.3 (its text schema has no ratio) and Kling O1 and Motion Control (no twin checked).
   */
  text?: string;
  /**
   * Reference audio (MP3 or WAV, read 2026-10-30): the body field, how many clips and how many seconds in all the schema takes. The clips go to fal's
   * storage (uploadInputs). Seedance prices output tokens only, so they cost nothing more; on Minimax they share the 4,096 free reference tokens with the
   * images (its page gives no count per clip), past which the estimate is short.
   */
  audio?: { field: string; max: number; seconds: number };
  /**
   * A reference video (MP4 or MOV, schemas read 2026-11-06): the body `field` (a list, or one URL when `single`), the clip's shortest and longest length in
   * seconds, its size cap in MB and the most images that fit with it where the schema states them, and how the prompt names it (`name`, for the app's [Video1]). The app sends one clip. It goes
   * to fal's storage (uploadInputs). Pricing: VIDEO_REF_USD in models.ts.
   */
  video?: {
    field: string; single?: boolean; minSec: number; maxSec: number; maxMb?: number; maxImages?: number; name: (n: string) => string;
    /** The picture the schema accepts: each side, the pixel count and the width over height, where it states them (videoRefProblem). */
    dims?: { minSide?: number; maxSide?: number; minPixels?: number; maxPixels?: number; minAspect?: number; maxAspect?: number };
    /** The frame rate range the schema accepts, where it states one. */
    fps?: [number, number];
    /** The endpoint has no audio switch and the clip comes out silent (Kling O3's video-to-video). */
    silent?: boolean;
  };
  /** The endpoint of the same app that takes a reference video, where a Run with one goes (as `text` does for a Run with no image); it carries the `video` limits. */
  videoTwin?: string;
  build: (req: SubmitRequest, images: string[]) => Record<string, unknown>;
}
const seconds = (req: SubmitRequest) => String(req.durationSec);
const ref = (images: string[]) => ({ image_urls: images });
const first = (images: string[]) => ({ image_url: images[0] });
/** A text-to-video body: the prompt as written, the ratio and the duration in the schema's own type, and the endpoint's other fields. */
const words = (req: SubmitRequest, duration: string | number, rest: Record<string, unknown> = {}) => ({ prompt: req.prompt, aspect_ratio: req.ratio, duration, ...rest });
export const VIDEO_BODIES: Record<string, VideoBody> = {
  // Audio is on only for a job that asks for it (params.audio 'on'), priced by AUDIO_USD_PER_SECOND.
  'fal-ai/kling-video/o3/pro/reference-to-video': { end: 'end_image_url', text: 'fal-ai/kling-video/o3/pro/text-to-video', videoTwin: 'fal-ai/kling-video/o3/pro/video-to-video/reference', build: (req, images) => ({ prompt: imageTokens(req.prompt, atImage), ...ref(images), aspect_ratio: req.ratio, duration: seconds(req), generate_audio: req.audio === true }) },
  // Reference video (schema read 2026-11-06): one .mp4/.mov of 3 to 15 s and at most 200 MB, at most 4 images and elements in all, ratios auto, 16:9, 9:16 and 1:1.
  // The schema has no audio switch, only keep_audio for the reference's own sound, which the app drops as it does everywhere (audio is the job's own switch).
  'fal-ai/kling-video/o3/pro/video-to-video/reference': { video: { field: 'video_url', single: true, minSec: 3, maxSec: 15, maxMb: 200, maxImages: 4, dims: { minSide: 720, maxSide: 3840 }, silent: true, name: atVideo }, build: (req, images) => ({ prompt: imageTokens(req.prompt, atImage), ...(images.length > 0 && ref(images)), aspect_ratio: req.ratio, duration: seconds(req), keep_audio: false }) },
  'fal-ai/kling-video/o1/reference-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, atImage), ...ref(images), aspect_ratio: req.ratio, duration: seconds(req) }) },
  'fal-ai/kling-video/v3/pro/image-to-video': { crop: true, end: 'end_image_url', text: 'fal-ai/kling-video/v3/pro/text-to-video', build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), start_image_url: images[0], duration: seconds(req), generate_audio: req.audio === true }) },
  'fal-ai/kling-video/v2.6/pro/image-to-video': { crop: true, end: 'end_image_url', text: 'fal-ai/kling-video/v2.6/pro/text-to-video', build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), start_image_url: images[0], duration: seconds(req), generate_audio: req.audio === true }) },
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': { crop: true, end: 'tail_image_url', text: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video', build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), duration: seconds(req) }) },
  // "Up to 10 files", each 1.8 to 30.2 s and 30.2 s in all (the schema's description; it states no maxItems).
  'bytedance/seedance-2.5/us/reference-to-video': { text: 'bytedance/seedance-2.5/us/text-to-video', audio: { field: 'audio_urls', max: 10, seconds: 30 }, video: { field: 'video_urls', minSec: 1.8, maxSec: 30.2, maxMb: 200, dims: { minSide: 300, maxSide: 6000, minAspect: 0.4, maxAspect: 2.5 }, fps: [24, 60], name: atVideo }, build: (req, images) => ({ prompt: imageTokens(req.prompt, atImage), ...ref(images), aspect_ratio: req.ratio, duration: seconds(req), resolution: '720p', generate_audio: req.audio === true }) },
  'bytedance/seedance-2.5/us/image-to-video': { crop: true, end: 'end_image_url', text: 'bytedance/seedance-2.5/us/text-to-video', build: (req, images) => ({ prompt: oneShot(imageTokens(req.prompt, plainImage)), ...first(images), duration: seconds(req), resolution: '720p', generate_audio: req.audio === true }) },
  'bytedance/seedance-2.0/us/reference-to-video': { text: 'bytedance/seedance-2.0/us/text-to-video', audio: { field: 'audio_urls', max: 3, seconds: 15 }, video: { field: 'video_urls', minSec: 2, maxSec: 15, maxMb: 50, dims: { minPixels: 640 * 640, maxPixels: 834 * 1112 }, name: atVideo }, build: (req, images) => ({ prompt: imageTokens(req.prompt, atImage), ...ref(images), aspect_ratio: req.ratio, duration: seconds(req), resolution: '720p', generate_audio: req.audio === true }) },
  'bytedance/seedance-2.0/us/image-to-video': { end: 'end_image_url', build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), aspect_ratio: req.ratio, duration: seconds(req), resolution: '720p', generate_audio: req.audio === true }) },
  'fal-ai/bytedance/seedance/v1.5/pro/image-to-video': { end: 'end_image_url', text: 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video', build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), aspect_ratio: req.ratio, duration: seconds(req), resolution: '720p', generate_audio: req.audio === true }) },
  // Seedance 1.0 Pro and FLUX 3 render "720p" 9:16 as 704 px wide, under the worker's 720p floor (smoke run 2026-10-25), so they ask for 1080p.
  'fal-ai/bytedance/seedance/v1/pro/image-to-video': { end: 'end_image_url', text: 'fal-ai/bytedance/seedance/v1/pro/text-to-video', build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), aspect_ratio: req.ratio, duration: seconds(req), resolution: '1080p' }) },
  // Smart Remake's one call, never a model row (apps/worker/src/remake.ts): the product image (1st input) put into the shot's clip (2nd input). The clip
  // is too large to inline, so both go to fal storage, as for Motion Control.
  'fal-ai/wan/v2.7/edit-video': { upload: true, build: remakeEdit },
  // fal has no FLUX 3 reference endpoint; keyframes pins the product image as the first frame, the closest match to Fash's "FLUX 3 Reference".
  'blackforestlabs/flux-3/keyframes-to-video': { text: 'blackforestlabs/flux-3/text-to-video', build: (req, images) => ({ prompt: oneShot(imageTokens(req.prompt, plainImage)), keyframes: [{ image_url: images[0], frame_index: 0 }], aspect_ratio: req.ratio, duration: req.durationSec, resolution: '1080p', generate_audio: req.audio === true }) },
  'blackforestlabs/flux-3/image-to-video': { text: 'blackforestlabs/flux-3/text-to-video', build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), aspect_ratio: req.ratio, duration: req.durationSec, resolution: '1080p', generate_audio: req.audio === true }) },
  'google/gemini-omni-flash/v1.2/reference-to-video': { text: 'google/gemini-omni-flash/v1.2/text-to-video', video: { field: 'reference_video_urls', minSec: 0, maxSec: 15, name: () => 'the reference video' }, build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...ref(images), aspect_ratio: req.ratio, duration: req.durationSec, resolution: '720p' }) },
  'google/gemini-omni-flash/v1.2/image-to-video': { end: 'end_image_url', endMaxSec: 10, text: 'google/gemini-omni-flash/v1.2/text-to-video', build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), aspect_ratio: req.ratio, duration: req.durationSec, resolution: '720p' }) },
  'fal-ai/veo3.1/image-to-video': { text: 'fal-ai/veo3.1', build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), aspect_ratio: req.ratio, duration: `${req.durationSec}s`, resolution: '720p', generate_audio: req.audio === true }) },
  'xai/grok-imagine-video/reference-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), reference_image_urls: images, aspect_ratio: req.ratio, duration: req.durationSec, resolution: '720p' }) },
  'xai/grok-imagine-video/v1.5/image-to-video': { crop: true, text: 'xai/grok-imagine-video/v1.5/text-to-video', build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), duration: req.durationSec, resolution: '720p' }) },
  'fal-ai/wan/v2.7/reference-to-video': { text: 'fal-ai/wan/v2.7/text-to-video', build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), reference_image_urls: images, aspect_ratio: req.ratio, duration: req.durationSec, resolution: '720p' }) },
  'fal-ai/wan/v2.7/image-to-video': { crop: true, end: 'end_image_url', text: 'fal-ai/wan/v2.7/text-to-video', build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), duration: req.durationSec, resolution: '720p' }) },
  // Minimax names references "Image 1" and requires prompt_expansion_mode (the schema default, 'balanced'); its resolutions (480P, 768P, 1080P) end
  // in a capital P, and each row's output resolution picks one, at that row's price.
  'minimax/h3-max/reference-to-video': { end: 'end_image_url', text: 'minimax/h3-max/text-to-video', audio: { field: 'reference_audio_urls', max: 3, seconds: 15 }, build: (req, images) => ({ prompt: imageTokens(req.prompt, (n) => `Image ${n}`), reference_image_urls: images, aspect_ratio: req.ratio, duration: req.durationSec, resolution: (req.model.outputResolution ?? '768p').toUpperCase(), prompt_expansion_mode: 'balanced' }) },
  'minimax/h3-max/image-to-video': { crop: true, end: 'end_image_url', text: 'minimax/h3-max/text-to-video', build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), duration: req.durationSec, resolution: (req.model.outputResolution ?? '768p').toUpperCase(), prompt_expansion_mode: 'balanced' }) },
  // A fixed-length clip: the schema has no duration, and the row offers 6 s only, as Fash does.
  'fal-ai/minimax/hailuo-2.3/pro/image-to-video': { crop: true, build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images) }) },
  'fal-ai/kling-video/v3/pro/motion-control': { upload: true, build: (req, inputs) => motion(req, inputs) },
  'fal-ai/kling-video/v3/standard/motion-control': { upload: true, build: (req, inputs) => motion(req, inputs) },
  // The text twins (`text` above), each from its own schema (read 2026-10-30): the same resolution and audio switch as the image endpoint it stands in for.
  'fal-ai/kling-video/o3/pro/text-to-video': { build: (req) => words(req, seconds(req), { generate_audio: req.audio === true }) },
  'fal-ai/kling-video/v3/pro/text-to-video': { build: (req) => words(req, seconds(req), { generate_audio: req.audio === true }) },
  'fal-ai/kling-video/v2.6/pro/text-to-video': { build: (req) => words(req, seconds(req), { generate_audio: req.audio === true }) },
  'fal-ai/kling-video/v2.5-turbo/pro/text-to-video': { build: (req) => words(req, seconds(req)) },
  'bytedance/seedance-2.5/us/text-to-video': { build: (req) => words(req, seconds(req), { resolution: '720p', generate_audio: req.audio === true }) },
  'bytedance/seedance-2.0/us/text-to-video': { build: (req) => words(req, seconds(req), { resolution: '720p', generate_audio: req.audio === true }) },
  'fal-ai/bytedance/seedance/v1.5/pro/text-to-video': { build: (req) => words(req, seconds(req), { resolution: '720p', generate_audio: req.audio === true }) },
  'fal-ai/bytedance/seedance/v1/pro/text-to-video': { build: (req) => words(req, seconds(req), { resolution: '1080p' }) },
  'blackforestlabs/flux-3/text-to-video': { build: (req) => words(req, req.durationSec, { resolution: '1080p', generate_audio: req.audio === true }) },
  'google/gemini-omni-flash/v1.2/text-to-video': { build: (req) => words(req, req.durationSec, { resolution: '720p' }) },
  'fal-ai/veo3.1': { build: (req) => words(req, `${req.durationSec}s`, { resolution: '720p', generate_audio: req.audio === true }) },
  'xai/grok-imagine-video/v1.5/text-to-video': { build: (req) => words(req, req.durationSec, { resolution: '720p' }) },
  'fal-ai/wan/v2.7/text-to-video': { build: (req) => words(req, req.durationSec, { resolution: '720p' }) },
  'minimax/h3-max/text-to-video': { build: (req) => words(req, req.durationSec, { resolution: (req.model.outputResolution ?? '768p').toUpperCase(), prompt_expansion_mode: 'balanced' }) },
};

/**
 * What a video model takes besides its images, by endpoint, for the models and jobs APIs: `endFrame`, an end frame; `textOnly`, a Run with no image;
 * `audioClips`, reference audio up to `max` clips and `seconds` in all (null when none); `videoRefs`, the reference video it takes (one clip, `minSec` to `maxSec` long,
 * `maxMb` where the schema caps the size; null when none): a model with a `videoTwin` takes the twin's, and `videoRefs.endFrame` says whether that request takes an end frame
 * with a video and `silent` that it makes no sound. With `withVideo` the other flags are those of the request a Run with a video makes, the twin's where there is one.
 */
export function videoInputs(endpoint: string, withVideo = false) {
  const plain: VideoBody | undefined = Object.hasOwn(VIDEO_BODIES, endpoint) ? VIDEO_BODIES[endpoint] : undefined;
  const twin = plain?.videoTwin ? VIDEO_BODIES[plain.videoTwin] : undefined;
  const spec = withVideo && twin ? twin : plain;
  // BytePlus Seedance runs from the prompt alone and takes neither an end frame nor reference audio (byteplus.ts).
  if (isByteplusVideo(endpoint)) return { endFrame: false, endMaxSec: null, textOnly: true, audioClips: null, videoRefs: null };
  // Vertex Omni runs from the prompt alone, takes a last frame with one first frame up to 10 s, and no reference audio (vertex-omni.ts).
  if (endpoint === VERTEX_OMNI_MODEL) return { endFrame: true, endMaxSec: 10, textOnly: true, audioClips: null, videoRefs: null };
  const video = (twin ?? plain)?.video;
  return {
    endFrame: spec?.end !== undefined, endMaxSec: spec?.endMaxSec ?? null, textOnly: spec?.text !== undefined, audioClips: spec?.audio ? { max: spec.audio.max, seconds: spec.audio.seconds } : null,
    videoRefs: video ? { max: 1, minSec: video.minSec, maxSec: video.maxSec, maxMb: video.maxMb ?? null, maxImages: video.maxImages ?? null, endFrame: (twin ?? plain)?.end !== undefined, silent: video.silent ?? false } : null,
  };
}

/**
 * Why the endpoint's reference video limits refuse a clip of this picture size and frame rate, or null: from the schemas' own words (read 2026-11-06), Seedance 2.0
 * "between ~480p (640x640) and ~720p (834x1112)", Seedance 2.5 "300 to 6,000 pixels per side, aspect ratio 0.4 to 2.5, frame rate 24 to 60 FPS", Kling O3 "720-3840px
 * resolution". An endpoint states no limit it does not name, and a `fps` of null (not readable from the file) passes: the provider decides.
 */
export function videoRefProblem(endpoint: string, info: { width: number; height: number; fps: number | null }): string | null {
  const plain: VideoBody | undefined = Object.hasOwn(VIDEO_BODIES, endpoint) ? VIDEO_BODIES[endpoint] : undefined;
  const video = (plain?.videoTwin ? VIDEO_BODIES[plain.videoTwin] : plain)?.video;
  const { width, height, fps } = info;
  const d = video?.dims;
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  if (d && ((d.minSide !== undefined && short < d.minSide) || (d.maxSide !== undefined && long > d.maxSide) || (d.minPixels !== undefined && width * height < d.minPixels) || (d.maxPixels !== undefined && width * height > d.maxPixels) || (d.minAspect !== undefined && width / height < d.minAspect) || (d.maxAspect !== undefined && width / height > d.maxAspect))) {
    return `the reference video is ${width}x${height}, a size this model does not take`;
  }
  if (video?.fps && fps !== null && (fps < video.fps[0] - 0.5 || fps > video.fps[1] + 0.5)) return `the reference video runs at ${Math.round(fps)} fps, outside the ${video.fps[0]} to ${video.fps[1]} this model takes`;
  return null;
}

/**
 * Smart Remake's edit (schema read 2026-11-13): the output is cut to the job's whole seconds (`duration` 2-10, kept from the start), which is what
 * it is billed for, while the clip sent is a little longer (fal measures a clip without its last frame and refuses one under 2 s). It keeps the
 * clip's own sound ('origin'; the worker sends it silent, so no sound is made or billed); 720p is the resolution its price is for.
 */
function remakeEdit(req: SubmitRequest, [reference_image_url, video_url, ...rest]: string[]): Record<string, unknown> {
  if (!reference_image_url || !video_url || rest.length > 0) throw new ImageReadError('the remake edit needs the product image and the shot clip');
  return { prompt: req.prompt, video_url, reference_image_url, duration: req.durationSec, resolution: '720p', audio_setting: 'origin' };
}

/**
 * Motion Control: the character image (1st input) moves like the reference video (2nd input). Orientation 'video' lets the reference run up to 30 s
 * ('image' allows 10 s); the reference's sound is dropped, as audio is everywhere. The prompt is optional and sent only when the member wrote one.
 */
function motion(req: SubmitRequest, [image_url, video_url, ...rest]: string[]): Record<string, unknown> {
  if (!image_url || !video_url || rest.length > 0) throw new ImageReadError('motion control needs the character image and the reference video');
  return { image_url, video_url, character_orientation: 'video', keep_original_sound: false, ...(req.prompt.trim() && { prompt: req.prompt }) };
}

/**
 * Puts each non-https input in fal's storage and returns the file URLs: initiate on rest.fal.ai, then PUT the bytes (the flow of @fal-ai/client 1.10.1,
 * src/storage.js, checked with a live upload 2026-10-26). The objects expire after an hour, like the outputs. A failed read or upload has sent nothing
 * billable, so it is an ImageReadError and the worker releases the estimate.
 */
async function uploadInputs(f: Fetch, apiKey: string, urls: string[], readImage?: ReadImage): Promise<string[]> {
  return Promise.all(
    urls.map(async (url) => {
      if (url.startsWith('https:')) return url;
      if (!readImage) throw new ImageReadError(`input ${url.split(':')[0]}: URL needs a readImage resolver`);
      try {
        const { bytes, contentType } = await readImage(url);
        const init = (await sendJson(f, 'fal upload', `${REST}/storage/upload/initiate?storage_type=fal-cdn-v3`, {
          method: 'POST',
          headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json', 'X-Fal-Object-Lifecycle': LIFECYCLE },
          // audio/mpeg is an .mp3 and video/quicktime a .mov; the endpoints that take audio list MP3 and WAV, those that take a video MP4 and MOV.
          body: JSON.stringify({ content_type: contentType, file_name: `input.${contentType === 'audio/mpeg' ? 'mp3' : contentType === 'video/quicktime' ? 'mov' : (contentType.split('/')[1] ?? 'bin')}` }),
        })) as { upload_url?: string; file_url?: string };
        if (!init.upload_url || !init.file_url) throw new Error('fal upload: no upload_url or file_url');
        const put = await f(init.upload_url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: Buffer.from(bytes) });
        if (!put.ok) throw new Error(`fal upload: HTTP ${put.status}`);
        return init.file_url;
      } catch (e) {
        throw new ImageReadError(`input ${url.split(':')[0]}: ${(e as Error).message}`);
      }
    }),
  );
}

/** The worker shrinks each inlined input to 600 KB so that 4 fit the inline limit; more (up to 9 references) go through fal storage instead. */
const MAX_INLINE_INPUTS = 4;

export function createFalProvider(opts: { apiKey: string; fetch?: Fetch; readImage?: ReadImage; startTimeoutSec?: number }): VideoProvider {
  const f = opts.fetch ?? fetch;
  const headers = falHeaders(opts.apiKey);
  // With `startTimeoutSec`, fal drops a request that has not started by then, so it is neither run nor billed after the caller gave up on it.
  const submitHeaders = opts.startTimeoutSec ? { ...headers, 'X-Fal-Request-Start-Timeout': String(opts.startTimeoutSec) } : headers;
  return {
    async submit(req) {
      const own = VIDEO_BODIES[req.model.endpoint];
      if (!own) throw new ImageReadError(`fal video: no request builder for ${req.model.endpoint}`);
      // No image: the text-to-video twin, same app (so the status URL is the same), with its own builder.
      // A reference video goes to the sibling endpoint that takes one, where the row has one (Kling O3 Pro).
      const endpoint = req.videoUrls?.length && own.videoTwin ? own.videoTwin : req.imageUrls.length === 0 ? own.text : req.model.endpoint;
      const spec = endpoint ? VIDEO_BODIES[endpoint] : undefined;
      if (!endpoint || !spec) throw new ImageReadError(`fal video: ${req.model.endpoint} needs an input image`);
      if (req.endImageUrl && !spec.end) throw new ImageReadError(`fal video: ${req.model.endpoint} takes no end frame`);
      if (req.audioUrls?.length && !spec.audio) throw new ImageReadError(`fal video: ${req.model.endpoint} takes no reference audio`);
      if (req.videoUrls?.length && (!spec.video || req.videoUrls.length > 1)) throw new ImageReadError(`fal video: ${req.model.endpoint} takes ${spec.video ? 'one' : 'no'} reference video`);
      const inputs = spec.upload || req.imageUrls.length > MAX_INLINE_INPUTS ? await uploadInputs(f, opts.apiKey, req.imageUrls, opts.readImage) : await resolveImages(req.imageUrls, opts.readImage, spec.crop ? { ratio: req.ratio } : undefined);
      const body = spec.build(req, inputs);
      // The end frame is read like the inputs, cropped to the ratio where they are, so both frames have one shape.
      if (req.endImageUrl) [body[spec.end!]] = await resolveImages([req.endImageUrl], opts.readImage, spec.crop ? { ratio: req.ratio } : undefined);
      if (req.audioUrls?.length) body[spec.audio!.field] = await uploadInputs(f, opts.apiKey, req.audioUrls, opts.readImage);
      if (req.videoUrls?.length) {
        const [url] = await uploadInputs(f, opts.apiKey, req.videoUrls, opts.readImage);
        body[spec.video!.field] = spec.video!.single ? url : [url];
        body.prompt = videoTokens(body.prompt as string, spec.video!.name);
      }
      const res = (await sendJson(f, 'fal submit', `${QUEUE}/${endpoint}`, { method: 'POST', headers: submitHeaders, body: JSON.stringify(body) })) as { request_id?: string };
      if (!res.request_id) throw new Error('fal submit: no request_id in the response');
      return { providerJobId: packJobId(req.durationSec, res.request_id) };
    },
    async status(job): Promise<ProviderStatus> {
      const { durationSec, id } = unpackJobId(job);
      return pollFal(f, headers, job.model.endpoint, id, estimate(job, durationSec), (out) => (out.video as { url?: string } | undefined)?.url, 'video.url');
    },
    // fal cannot reliably cancel a running job (its cancel only removes queued requests), so the app does not try.
    async cancel() {
      return { supported: false };
    },
  };
}

type ImageBody = (req: ImageSubmitRequest, imageUrls: string[]) => Record<string, unknown>;

/** The Nano Banana family takes the ratio and, except the first model, a resolution label as they are, and a thinking level only on a job that names one (the jobs API allows it on the models that list it). */
const nano =
  (withResolution: boolean): ImageBody =>
  (req, image_urls) => ({
    prompt: req.prompt, image_urls, aspect_ratio: req.ratio, ...(withResolution && { resolution: req.resolution }), ...(req.thinking && { thinking_level: req.thinking }), num_images: 1, output_format: 'png',
  });

/** GPT Image's 1K: the schema's preset sizes. */
const GPT_SIZES: Record<string, string> = { auto: 'auto', '1:1': 'square_hd', '3:4': 'portrait_4_3', '9:16': 'portrait_16_9', '4:3': 'landscape_4_3', '16:9': 'landscape_16_9' };

type Size = { width: number; height: number };
/**
 * GPT Image 2's 2K and 4K (owner decision, 2026-11-03): per ratio, the largest size in exactly that ratio with both edges multiples of 16 and no more
 * pixels than the 2560x1440 and 3840x2160 rows of fal's pricing table (https://fal.ai/models/openai/gpt-image-2/edit, read 2026-11-03), whose prices
 * the row carries. The text-to-image schema of the same model caps a custom size at a 3840 px edge and 8,294,400 pixels.
 */
const GPT_LARGE: Record<string, Record<string, Size>> = {
  '2K': { '1:1': { width: 1920, height: 1920 }, '16:9': { width: 2560, height: 1440 }, '9:16': { width: 1440, height: 2560 }, '4:3': { width: 2176, height: 1632 }, '3:4': { width: 1632, height: 2176 } },
  '4K': { '1:1': { width: 2880, height: 2880 }, '16:9': { width: 3840, height: 2160 }, '9:16': { width: 2160, height: 3840 }, '4:3': { width: 3264, height: 2448 }, '3:4': { width: 2448, height: 3264 } },
};

/** fal's 'auto' size takes no resolution, so 'auto' at 2K or 4K is the size nearest the first image's shape, square when there is no image it can measure. */
function nearestSize(sizes: Record<string, Size>, image: string | undefined): Size {
  const size = image?.startsWith('data:') ? imageSize(Buffer.from(image.slice(image.indexOf(',') + 1), 'base64')) : undefined;
  const shape = size ? Math.log(size.width / size.height) : 0;
  const off = (s: Size) => Math.abs(Math.log(s.width / s.height) - shape);
  return Object.values(sizes).reduce((a, b) => (off(b) < off(a) ? b : a));
}

/** The GPT Image edit endpoints. The model's price assumes the high quality tier (the schema default); it is sent so a default change cannot raise the price. */
const gptImage: ImageBody = (req, image_urls) => {
  const large = GPT_LARGE[req.resolution];
  const image_size = large ? (req.ratio === 'auto' ? nearestSize(large, image_urls[0]) : large[req.ratio]) : GPT_SIZES[req.ratio];
  if (!image_size) throw new ImageReadError(`GPT Image does not offer ratio ${req.ratio}`);
  return { prompt: req.prompt, image_urls, image_size, quality: req.quality ?? 'high', num_images: 1, output_format: 'png' };
};

/**
 * Seedream takes 'auto_1K' or 'auto_2K', or a size whose total pixels are between 1024x1024 and 2048x2048 (its schema description). The targets sit
 * inside that range with room for the rounding to a multiple of 16. shortcut: unconfirmed by a live call; the first canary run shows whether fal accepts it.
 */
function seedreamSize(ratio: string, resolution: string): string | { width: number; height: number } {
  if (ratio === 'auto') return `auto_${resolution}`;
  return sizeFor(ratio, resolution === '2K' ? 4_000_000 : 1_100_000);
}

/** The pixel target of each Upscale resolution (the Fash menu's 2K and 4K). */
const UPSCALE_PIXELS: Record<string, number> = { '2K': 2048 * 2048, '4K': 3840 * 2160 };
/** fal's price is $0.08 per output image up to 24 MP and $0.16 up to 48 MP (model page, read 2026-10-24); the app is priced at the first tier. */
const UPSCALE_MAX_PIXELS = 24_000_000;

/**
 * The factor that brings an image to the target, rounded down, between 1 (an image at or over the target is still enhanced) and 4 (the schema's limit),
 * and low enough that the output stays inside the price tier. An image over the tier even at factor 1 is refused before any call, which releases the estimate.
 */
function upscaleFactor(image: string, target: number): number {
  // The worker always inlines its images, so the bytes are in the data URL; an https URL cannot be sized without a download.
  const size = image.startsWith('data:') ? imageSize(Buffer.from(image.slice(image.indexOf(',') + 1), 'base64')) : undefined;
  if (!size) throw new ImageReadError('upscale needs a jpeg, png or webp image it can measure');
  const pixels = size.width * size.height;
  const tier = Math.sqrt(UPSCALE_MAX_PIXELS / pixels);
  if (tier < 1) throw new ImageReadError(`the image (${size.width}x${size.height}) is larger than the 24 MP the Upscale price covers`);
  return Math.max(1, Math.floor(Math.min(4, tier, Math.sqrt(target / pixels)) * 100) / 100);
}

/** The request body of each image endpoint, built from its input schema (read 2026-10-24). Output is png wherever the schema offers a format; Topaz is left at its jpeg default, and the other endpoints have no choice. */
const IMAGE_BODIES: Record<string, ImageBody> = {
  'fal-ai/nano-banana-pro/edit': nano(true),
  'google/nano-banana-2.1/edit': nano(true),
  'fal-ai/nano-banana-2/edit': nano(true),
  // This schema has no resolution input.
  'fal-ai/nano-banana/edit': nano(false),
  'openai/gpt-image-2/edit': gptImage,
  // GPT Image 2.5 Flare and Sunburst share GPT Image 2's schema and token prices (model pages, read 2026-10-26).
  'openai/gpt-image-2.5/flare/edit': gptImage,
  'openai/gpt-image-2.5/sunburst/edit': gptImage,
  'bytedance/seedream/v5/pro/edit': (req, image_urls) => ({ prompt: req.prompt, image_urls, image_size: seedreamSize(req.ratio, req.resolution), num_images: 1, output_format: 'png' }),
  // The person image first, then the garment; the output follows the person image, so the schema has no ratio, and the prompt is not read.
  'fal-ai/fashn/tryon/v1.6': (_req, urls) => {
    if (urls.length !== 2) throw new ImageReadError('fashn needs the model image and the garment image');
    return { model_image: urls[0], garment_image: urls[1], num_samples: 1, output_format: 'png' };
  },
  // Character Swap, Model Swap and Face Swap use the Nano Banana Pro builder above; their fixed prompt says which image is which.
  // The reference image or the prompt, never both (the schema). The reference is the second input image; without it the prompt describes the new background.
  'fal-ai/bria/background/replace': (req, [image_url, ref_image_url]) => {
    if (ref_image_url) return { image_url, ref_image_url, num_images: 1 };
    if (!req.prompt.trim()) throw new ImageReadError('bria background replace needs a reference image or a prompt');
    return { image_url, prompt: req.prompt, num_images: 1 };
  },
  // The schema's ratio is a size, not a ratio: pixels in the ratio, about one megapixel. shortcut: the size limits are unconfirmed by a live call. Prompt and style fields are not offered.
  'fal-ai/ideogram/v3/reframe': (req, [image_url]) => {
    if (!/^\d+:\d+$/.test(req.ratio)) throw new ImageReadError(`ideogram reframe needs a ratio, not ${req.ratio}`);
    return { image_url, image_size: sizeFor(req.ratio, 1_048_576), rendering_speed: 'TURBO', num_images: 1 };
  },
  // The schema has an upscale factor, not a target size, so the factor is worked out from the image's own size to land on the pixel budget of the resolution.
  'fal-ai/topaz/upscale/image': (req, [image_url]) => {
    const target = UPSCALE_PIXELS[req.resolution];
    if (!target) throw new ImageReadError(`topaz upscale does not offer resolution ${req.resolution}`);
    return { image_url, upscale_factor: upscaleFactor(image_url!, target), model: 'Standard V2' };
  },
  // A prompt would be billed extra and change the cutout, so none is sent.
  'fal-ai/bria/background/remove': (_req, [image_url]) => ({ image_url }),
};

export function createFalImageProvider(opts: { apiKey: string; fetch?: Fetch; readImage?: ReadImage }): ImageProvider {
  const f = opts.fetch ?? fetch;
  const headers = falHeaders(opts.apiKey);
  return {
    async submit(req) {
      const build = IMAGE_BODIES[req.model.endpoint];
      if (!build) throw new ImageReadError(`fal image: no request builder for ${req.model.endpoint}`);
      // No input image: the text-to-image twin, same app (so the status URL is the same) and the same body without images.
      const text = req.imageUrls.length === 0;
      const endpoint = text ? FAL_TEXT_ENDPOINTS[req.model.endpoint] : req.model.endpoint;
      if (!endpoint) throw new ImageReadError(`fal image: ${req.model.endpoint} needs an input image`);
      // Built before any network call, so a request the model cannot take submits nothing.
      const body = build(req, await resolveImages(req.imageUrls, opts.readImage));
      if (text) {
        delete body.image_urls;
        // Nano Banana's text endpoint has no 'auto' ratio; without one each takes its own default.
        if (body.aspect_ratio === 'auto') delete body.aspect_ratio;
      }
      const res = (await sendJson(f, 'fal submit', `${QUEUE}/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) })) as { request_id?: string };
      if (!res.request_id) throw new Error('fal submit: no request_id in the response');
      return { providerJobId: res.request_id };
    },
    async status(job) {
      return pollFal(f, headers, job.model.endpoint, job.providerJobId, imageEstimate(job), (out) => (out.images as { url?: string }[] | undefined)?.[0]?.url ?? (out.image as { url?: string } | undefined)?.url, 'images[0].url or image.url');
    },
    async cancel() {
      return { supported: false };
    },
  };
}
