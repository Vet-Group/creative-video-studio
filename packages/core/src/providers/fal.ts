// fal queue API. Docs read 2026-10-23:
//   queue (submit/status/result/cancel, auth, statuses): https://fal.ai/docs/model-apis/model-endpoints/queue
//   X-Fal-Store-IO and X-Fal-Object-Lifecycle-Preference: https://fal.ai/docs/model-apis/media-expiration
//   file inputs: https://fal.ai/docs/documentation/model-apis/fal-cdn.md says "Some models also accept data URIs" and does not document a plain-HTTP
//   upload (only the SDKs); non-https images are therefore sent as data URIs, and the B.5a canary shows whether Kling accepts them
//   Kling O3 Pro input and output schema: https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/pro/reference-to-video
//   image endpoints (read 2026-10-24): https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<endpoint>, one per entry of IMAGE_BODIES
import { estimate, imageEstimate, packJobId, ProviderHttpError, resolveImages, sendJson, timeout, unpackJobId, type Fetch, type ReadImage } from './http';
import type { ImageProvider, ImageSubmitRequest, ProviderStatus, VideoProvider } from './types';

const QUEUE = 'https://queue.fal.run';
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

export function createFalProvider(opts: { apiKey: string; fetch?: Fetch; readImage?: ReadImage }): VideoProvider {
  const f = opts.fetch ?? fetch;
  const headers = falHeaders(opts.apiKey);
  return {
    async submit(req) {
      const body = {
        prompt: req.prompt,
        image_urls: await resolveImages(req.imageUrls, opts.readImage),
        aspect_ratio: req.ratio,
        duration: String(req.durationSec),
        // The model's price assumes audio off (the schema default is false); send it so a default change cannot raise the price.
        generate_audio: false,
      };
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

/**
 * Seedream takes 'auto_1K' or 'auto_2K', or a size whose total pixels are between 1024x1024 and 2048x2048 (its schema description). The targets sit
 * inside that range with room for the rounding to a multiple of 16. shortcut: unconfirmed by a live call; the first canary run shows whether fal accepts it.
 */
function seedreamSize(ratio: string, resolution: string): string | { width: number; height: number } {
  if (ratio === 'auto') return `auto_${resolution}`;
  const [w, h] = ratio.split(':').map(Number) as [number, number];
  const pixels = resolution === '2K' ? 4_000_000 : 1_100_000;
  const round = (n: number) => Math.round(n / 16) * 16;
  return { width: round(Math.sqrt((pixels * w) / h)), height: round(Math.sqrt((pixels * h) / w)) };
}

/** The request body of each image endpoint, built from its input schema (read 2026-10-24). Output is always png (seedream and fashn offer png too). */
const IMAGE_BODIES: Record<string, ImageBody> = {
  'fal-ai/nano-banana-pro/edit': nano(true),
  'google/nano-banana-2.1/edit': nano(true),
  'fal-ai/nano-banana-2/edit': nano(true),
  // This schema has no resolution input.
  'fal-ai/nano-banana/edit': nano(false),
  'openai/gpt-image-2/edit': (req, image_urls) => {
    const image_size = GPT_SIZES[req.ratio];
    if (!image_size) throw new Error(`gpt-image-2 does not offer ratio ${req.ratio}`);
    // The model's price assumes the high quality tier (the schema default); send it so a default change cannot raise the price.
    return { prompt: req.prompt, image_urls, image_size, quality: req.quality ?? 'high', num_images: 1, output_format: 'png' };
  },
  'bytedance/seedream/v5/pro/edit': (req, image_urls) => ({ prompt: req.prompt, image_urls, image_size: seedreamSize(req.ratio, req.resolution), num_images: 1, output_format: 'png' }),
  // The person image first, then the garment; the output follows the person image, so the schema has no ratio, and the prompt is not read.
  'fal-ai/fashn/tryon/v1.6': (_req, urls) => {
    if (urls.length !== 2) throw new Error('fashn needs the model image and the garment image');
    return { model_image: urls[0], garment_image: urls[1], num_samples: 1, output_format: 'png' };
  },
};

export function createFalImageProvider(opts: { apiKey: string; fetch?: Fetch; readImage?: ReadImage }): ImageProvider {
  const f = opts.fetch ?? fetch;
  const headers = falHeaders(opts.apiKey);
  return {
    async submit(req) {
      const build = IMAGE_BODIES[req.model.endpoint];
      if (!build) throw new Error(`fal image: no request builder for ${req.model.endpoint}`);
      // Built before any network call, so a request the model cannot take submits nothing.
      const body = build(req, await resolveImages(req.imageUrls, opts.readImage));
      const res = (await sendJson(f, 'fal submit', `${QUEUE}/${req.model.endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) })) as { request_id?: string };
      if (!res.request_id) throw new Error('fal submit: no request_id in the response');
      return { providerJobId: res.request_id };
    },
    async status(job) {
      return pollFal(f, headers, job.model.endpoint, job.providerJobId, imageEstimate(job), (out) => (out.images as { url?: string }[] | undefined)?.[0]?.url, 'images[0].url');
    },
    async cancel() {
      return { supported: false };
    },
  };
}
