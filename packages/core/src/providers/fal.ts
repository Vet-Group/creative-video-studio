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
import { estimate, ImageReadError, imageEstimate, packJobId, ProviderHttpError, resolveImages, sendJson, timeout, unpackJobId, type Fetch, type ReadImage } from './http';
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

/** The queue status, then the result, of one request; `cost` is the final cost to report and `pick` finds the output URL in the result. */
async function pollFal(
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
    if (e instanceof ProviderHttpError && e.status >= 400 && e.status < 500 && ![401, 403, 429].includes(e.status)) return { error: e.message };
    throw e;
  })) as Record<string, unknown> & { error?: string };
  if (out.error) return { state: 'failed', error: out.error, ...cost };
  const outputUrl = pick(out);
  if (!outputUrl) return { state: 'failed', error: `fal result has no ${field}`, ...cost };
  return { state: 'succeeded', outputUrl, ...cost };
}

/** The app writes [Image1], [Image2]; each schema names them its own way. A digit right after the token gets a space, so "[Image1]2" does not become @Image12. */
const imageTokens = (prompt: string, name: (n: string) => string) => prompt.replace(/\[Image(\d+)\](\d?)/g, (_, n: string, d: string) => `${name(n)}${d ? ` ${d}` : ''}`);
const atImage = (n: string) => `@Image${n}`;
const plainImage = (n: string) => `image ${n}`;
/**
 * The smoke run of 2026-10-25 saw Seedance 2.5 and FLUX 3 Reference show the input as the first frame, then cut to the plain studio a preset asks for.
 * These endpoints start from the input image, so they are told to stay in its scene in one shot.
 */
const oneShot = (prompt: string) => `${prompt} One continuous shot that starts on the input image: keep its scene and background, with no cuts.`;

/**
 * How each fal video endpoint takes a Run, built from its input schema (read 2026-10-25, sources in migration 0015; Kling O3 Pro 2026-10-23). `crop`: the
 * endpoint has no ratio field and follows the input image, so the worker centre-crops the inputs to the chosen ratio first.
 * Audio follows the job wherever the schema has the switch (the stored prices are for audio off), and the resolution is the one the stored price is for.
 */
interface VideoBody {
  crop?: boolean;
  /** The inputs include a video, too large to inline, so they go to fal's storage and the body carries their URLs (uploadInputs). */
  upload?: boolean;
  build: (req: SubmitRequest, images: string[]) => Record<string, unknown>;
}
const seconds = (req: SubmitRequest) => String(req.durationSec);
const ref = (images: string[]) => ({ image_urls: images });
const first = (images: string[]) => ({ image_url: images[0] });
export const VIDEO_BODIES: Record<string, VideoBody> = {
  // Audio is on only for a job that asks for it (params.audio 'on'), priced by AUDIO_USD_PER_SECOND.
  'fal-ai/kling-video/o3/pro/reference-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, atImage), ...ref(images), aspect_ratio: req.ratio, duration: seconds(req), generate_audio: req.audio === true }) },
  'fal-ai/kling-video/o1/reference-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, atImage), ...ref(images), aspect_ratio: req.ratio, duration: seconds(req) }) },
  'fal-ai/kling-video/v3/pro/image-to-video': { crop: true, build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), start_image_url: images[0], duration: seconds(req), generate_audio: req.audio === true }) },
  'fal-ai/kling-video/v2.6/pro/image-to-video': { crop: true, build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), start_image_url: images[0], duration: seconds(req), generate_audio: req.audio === true }) },
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': { crop: true, build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), duration: seconds(req) }) },
  'bytedance/seedance-2.5/us/reference-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, atImage), ...ref(images), aspect_ratio: req.ratio, duration: seconds(req), resolution: '720p', generate_audio: req.audio === true }) },
  'bytedance/seedance-2.5/us/image-to-video': { crop: true, build: (req, images) => ({ prompt: oneShot(imageTokens(req.prompt, plainImage)), ...first(images), duration: seconds(req), resolution: '720p', generate_audio: req.audio === true }) },
  'bytedance/seedance-2.0/us/reference-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, atImage), ...ref(images), aspect_ratio: req.ratio, duration: seconds(req), resolution: '720p', generate_audio: req.audio === true }) },
  'bytedance/seedance-2.0/us/image-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), aspect_ratio: req.ratio, duration: seconds(req), resolution: '720p', generate_audio: req.audio === true }) },
  'fal-ai/bytedance/seedance/v1.5/pro/image-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), aspect_ratio: req.ratio, duration: seconds(req), resolution: '720p', generate_audio: req.audio === true }) },
  // Seedance 1.0 Pro and FLUX 3 render "720p" 9:16 as 704 px wide, under the worker's 720p floor (smoke run 2026-10-25), so they ask for 1080p.
  'fal-ai/bytedance/seedance/v1/pro/image-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), aspect_ratio: req.ratio, duration: seconds(req), resolution: '1080p' }) },
  // fal has no FLUX 3 reference endpoint; keyframes pins the product image as the first frame, the closest match to Fash's "FLUX 3 Reference".
  'blackforestlabs/flux-3/keyframes-to-video': { build: (req, images) => ({ prompt: oneShot(imageTokens(req.prompt, plainImage)), keyframes: [{ image_url: images[0], frame_index: 0 }], aspect_ratio: req.ratio, duration: req.durationSec, resolution: '1080p', generate_audio: req.audio === true }) },
  'blackforestlabs/flux-3/image-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), aspect_ratio: req.ratio, duration: req.durationSec, resolution: '1080p', generate_audio: req.audio === true }) },
  'google/gemini-omni-flash/v1.1/reference-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...ref(images), aspect_ratio: req.ratio, duration: req.durationSec, resolution: '720p' }) },
  'google/gemini-omni-flash/v1.1/image-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), aspect_ratio: req.ratio, duration: req.durationSec, resolution: '720p' }) },
  'fal-ai/veo3.1/image-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), aspect_ratio: req.ratio, duration: `${req.durationSec}s`, resolution: '720p', generate_audio: req.audio === true }) },
  'fal-ai/veo3.1/lite/image-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), aspect_ratio: req.ratio, duration: `${req.durationSec}s`, resolution: '720p', generate_audio: req.audio === true }) },
  'xai/grok-imagine-video/reference-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), reference_image_urls: images, aspect_ratio: req.ratio, duration: req.durationSec, resolution: '720p' }) },
  'xai/grok-imagine-video/v1.5/image-to-video': { crop: true, build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), duration: req.durationSec, resolution: '720p' }) },
  'fal-ai/wan/v2.7/reference-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), reference_image_urls: images, aspect_ratio: req.ratio, duration: req.durationSec, resolution: '720p' }) },
  'fal-ai/wan/v2.7/image-to-video': { crop: true, build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), duration: req.durationSec, resolution: '720p' }) },
  // Minimax names references "Image 1" and requires prompt_expansion_mode (the schema default, 'balanced'); its resolutions end in a capital P.
  'minimax/h3-max/reference-to-video': { build: (req, images) => ({ prompt: imageTokens(req.prompt, (n) => `Image ${n}`), reference_image_urls: images, aspect_ratio: req.ratio, duration: req.durationSec, resolution: '768P', prompt_expansion_mode: 'balanced' }) },
  'minimax/h3-max/image-to-video': { crop: true, build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images), duration: req.durationSec, resolution: '768P', prompt_expansion_mode: 'balanced' }) },
  // A fixed-length clip: the schema has no duration, and the row offers 6 s only, as Fash does.
  'fal-ai/minimax/hailuo-2.3/pro/image-to-video': { crop: true, build: (req, images) => ({ prompt: imageTokens(req.prompt, plainImage), ...first(images) }) },
  'fal-ai/kling-video/v3/pro/motion-control': { upload: true, build: (req, inputs) => motion(req, inputs) },
  'fal-ai/kling-video/v3/standard/motion-control': { upload: true, build: (req, inputs) => motion(req, inputs) },
};

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
          body: JSON.stringify({ content_type: contentType, file_name: `input.${contentType.split('/')[1] ?? 'bin'}` }),
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

export function createFalProvider(opts: { apiKey: string; fetch?: Fetch; readImage?: ReadImage }): VideoProvider {
  const f = opts.fetch ?? fetch;
  const headers = falHeaders(opts.apiKey);
  return {
    async submit(req) {
      const spec = VIDEO_BODIES[req.model.endpoint];
      if (!spec) throw new ImageReadError(`fal video: no request builder for ${req.model.endpoint}`);
      const inputs = spec.upload ? await uploadInputs(f, opts.apiKey, req.imageUrls, opts.readImage) : await resolveImages(req.imageUrls, opts.readImage, spec.crop ? { ratio: req.ratio } : undefined);
      const body = spec.build(req, inputs);
      const res = (await sendJson(f, 'fal submit', `${QUEUE}/${req.model.endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) })) as { request_id?: string };
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

/** The Nano Banana family takes the ratio and, except the first model, a resolution label as they are. */
const nano =
  (withResolution: boolean): ImageBody =>
  (req, image_urls) => ({ prompt: req.prompt, image_urls, aspect_ratio: req.ratio, ...(withResolution && { resolution: req.resolution }), num_images: 1, output_format: 'png' });

/** GPT Image 2 takes only these preset sizes (its schema states no limits for a custom size). */
const GPT_SIZES: Record<string, string> = { auto: 'auto', '1:1': 'square_hd', '3:4': 'portrait_4_3', '9:16': 'portrait_16_9', '4:3': 'landscape_4_3', '16:9': 'landscape_16_9' };

/** The GPT Image edit endpoints. The model's price assumes the high quality tier (the schema default); it is sent so a default change cannot raise the price. */
const gptImage: ImageBody = (req, image_urls) => {
  const image_size = GPT_SIZES[req.ratio];
  if (!image_size) throw new ImageReadError(`GPT Image does not offer ratio ${req.ratio}`);
  return { prompt: req.prompt, image_urls, image_size, quality: req.quality ?? 'high', num_images: 1, output_format: 'png' };
};

/** A width and height in the ratio with about `pixels` pixels in total, each a multiple of 16. */
function sizeFor(ratio: string, pixels: number): { width: number; height: number } {
  const [w, h] = ratio.split(':').map(Number) as [number, number];
  const round = (n: number) => Math.round(n / 16) * 16;
  return { width: round(Math.sqrt((pixels * w) / h)), height: round(Math.sqrt((pixels * h) / w)) };
}

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
      // Built before any network call, so a request the model cannot take submits nothing.
      const body = build(req, await resolveImages(req.imageUrls, opts.readImage));
      const res = (await sendJson(f, 'fal submit', `${QUEUE}/${req.model.endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) })) as { request_id?: string };
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
