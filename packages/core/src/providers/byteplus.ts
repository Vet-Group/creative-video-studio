// BytePlus ModelArk (ByteDance's own API) for Seedance video and Seedream images. Docs read 2026-11-04 (append .md for the Markdown page):
//   create, get and cancel/delete a video task, auth (Authorization: Bearer <ARK_API_KEY>), statuses, usage.completion_tokens:
//   https://ai.byteplus.com/ark/region:ap-southeast-1/docs/create-video-generation-task-api.md, .../get-video-generation-task-api.md,
//   .../cancel-or-delete-video-generation-tasks-api.md (only a queued task can be cancelled; a running one cannot)
//   Seedance 2.5 task types and limits: .../seedance-2-5.md (reference images carry role reference_image; with omni_reference_task_type 'reference' the
//   API refuses a request that is not a reference-to-video one at submit time, instead of failing the task later)
//   images: .../image-generation-api.md (POST /images/generations answers at once with data[0].url, valid 24 hours; size is a resolution level
//   or a width and height of 921,600 to 4,624,220 pixels; watermark is on by default)
//   Seedance 2.0 and 2.5 refuse reference images that show a real human face (the create page's warning); the app sends product photos and cannot tell.
//   price per million tokens: https://docs.byteplus.com/en/docs/modelark/model-pricing; tokens = seconds x width x height x 24 / 1024
import { extraInputUsd } from '../models';
import { estimate, ImageReadError, imageEstimate, imageTokens, packJobId, ProviderHttpError, resolveImages, sendJson, sizeFor, timeout, unpackJobId, type Fetch, type ReadImage } from './http';
import type { ImageProvider, ProviderStatus, VideoProvider } from './types';

const API = 'https://ark.ap-southeast.bytepluses.com/api/v3';
/** The request body is limited to 64 MB (create page); the worker shrinks each input to 600 KB, so up to nine fit with room to spare. */
const MAX_BODY_CHARS = 48_000_000;
/** Image calls answer in seconds; this bounds a stuck one well inside the worker's 10-minute job limit. */
const IMAGE_CALL_MS = 300_000;
const IMAGE_PREFIX = 'byteplus-image-v1:';

/** Seedance 2.0 and 2.5 take 1 to 9 reference images; Seedance 1.0 takes one first-frame image and has no audio switch. */
const isReference = (endpoint: string) => endpoint.startsWith('dreamina-seedance-2-');
/** The Seedance rows (migration 0056); every one of them can also run from the prompt alone (text-to-video, same price). */
export const isByteplusVideo = (endpoint: string): boolean => isReference(endpoint) || endpoint.startsWith('seedance-1-0-');

/** Pixels of the frame at each resolution, for the tokens of one second: Seedance 1.0 renders 1248x704 and 1920x1088 where 2.x renders 1280x720 and 1920x1080. */
const PIXELS: Record<string, number> = { '720p': 1280 * 720, '1080p': 1920 * 1080 };
const PIXELS_1_0: Record<string, number> = { '720p': 1248 * 704, '1080p': 1920 * 1088 };

/** The USD of `tokens` at the row's price, which is the price of one second times the tokens of one second (migration 0056); undefined for a resolution without pixels here. */
export function tokenCost(model: { endpoint: string; outputResolution: string | null; usdPerSecond: number }, tokens: number): number | undefined {
  const pixels = (isReference(model.endpoint) ? PIXELS : PIXELS_1_0)[model.outputResolution ?? ''];
  return pixels === undefined ? undefined : Number(((tokens * model.usdPerSecond * 1024) / (pixels * 24)).toFixed(4));
}

/** The pixel target of each image resolution: Pro prices up to 2.61 MP at the lower tier, so 1K is about 1.1 MP and 2K about 4 MP (inside the API's 4.62 MP). */
const IMAGE_PIXELS: Record<string, number> = { '1K': 1_100_000, '2K': 4_000_000 };

/**
 * A create call BytePlus answers with a 400 refused the request before making anything (an image outside the aspect ratio 0.4 to 2.5 or under 300 px,
 * a model that is not activated), and only a successful generation is billed: the refusal is an ImageReadError, which the worker releases at once,
 * instead of a failed_unknown job that would keep its estimate for a day. 401, 403, 429 and 5xx say nothing about the request, so they stay as they are.
 */
async function create(f: Fetch, what: string, url: string, init: RequestInit): Promise<unknown> {
  try {
    return await sendJson(f, what, url, init);
  } catch (e) {
    if (e instanceof ProviderHttpError && e.status === 400) throw new ImageReadError(e.message);
    throw e;
  }
}

export function createByteplusProvider(opts: { apiKey: string; fetch?: Fetch; readImage?: ReadImage }): VideoProvider {
  const f = opts.fetch ?? fetch;
  const headers = { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' };
  const task = (id: string) => `${API}/contents/generations/tasks/${id}`;
  return {
    async submit(req) {
      const { endpoint, outputResolution } = req.model;
      if (!isByteplusVideo(endpoint)) throw new ImageReadError(`byteplus: no request builder for ${endpoint}`);
      if (req.endImageUrl) throw new ImageReadError(`byteplus: ${endpoint} takes no end frame`);
      const images = await resolveImages(req.imageUrls, opts.readImage, { maxChars: MAX_BODY_CHARS });
      const reference = isReference(endpoint);
      const body = {
        model: endpoint,
        content: [
          { type: 'text', text: imageTokens(req.prompt, reference ? (n) => `@Image${n}` : (n) => `image ${n}`) },
          // Product photos are references, not a first frame, on Seedance 2.x; Seedance 1.0 has no reference mode, so its one image is the first frame.
          ...images.map((url) => ({ type: 'image_url', image_url: { url }, role: reference ? 'reference_image' : 'first_frame' })),
        ],
        ratio: req.ratio,
        duration: req.durationSec,
        ...(outputResolution && { resolution: outputResolution }),
        // The API's own default is a watermark on the corner of the clip.
        watermark: false,
        // The API's default is audio on; the rows are priced for the silent clip, so audio is sent on only when the job asks.
        ...(reference && { generate_audio: req.audio === true }),
        ...(endpoint.startsWith('dreamina-seedance-2-5') && images.length > 0 && { omni_reference_task_type: 'reference' }),
      };
      const res = (await create(f, 'byteplus submit', `${API}/contents/generations/tasks`, { method: 'POST', headers, body: JSON.stringify(body) })) as { id?: string };
      if (!res.id) throw new Error('byteplus submit: no id in the response');
      return { providerJobId: packJobId(req.durationSec, res.id) };
    },
    async status(job): Promise<ProviderStatus> {
      const { durationSec, id } = unpackJobId(job);
      const t = (await sendJson(f, 'byteplus status', task(id), { headers, signal: timeout() }).catch((e) => {
        // A deleted or expired task answers 404 for good (records last 7 days, a cancelled one 24 hours); polling it again would never end, so it is final.
        // The cost stays at the estimate: what became of the task is unknown, and the estimate is what an unknown outcome is held at.
        if (e instanceof ProviderHttpError && e.status === 404) return { status: 'not_found' };
        throw e;
      })) as {
        status?: string;
        content?: { video_url?: string };
        error?: { code?: string; message?: string } | null;
        usage?: { completion_tokens?: number };
      };
      if (t.status === 'not_found') return { state: 'failed', error: 'task not found', ...estimate(job, durationSec) };
      if (t.status === 'queued') return { state: 'queued' };
      if (t.status === 'running') return { state: 'running' };
      // Only a succeeded task is billed (model pricing page), so every other final state costs nothing.
      const free = { costUsd: 0, costSource: 'reported' as const };
      if (t.status === 'cancelled') return { state: 'canceled', error: 'cancelled', ...free };
      if (t.status === 'failed' || t.status === 'expired') return { state: 'failed', error: t.error ? `${t.error.code ?? t.status}: ${t.error.message ?? ''}`.trim() : String(t.status), ...free };
      if (t.status !== 'succeeded') throw new Error(`byteplus status: unknown status ${String(t.status)}`);
      // The billed tokens are in the answer (Seedance 2.x bills a minimum, which it reports as the usage); the estimate covers an answer without them.
      const tokens = t.usage?.completion_tokens;
      const reported = typeof tokens === 'number' && Number.isFinite(tokens) && tokens > 0 ? tokenCost(job.model, tokens) : undefined;
      const cost = reported === undefined ? estimate(job, durationSec) : { costUsd: reported, costSource: 'reported' as const };
      const outputUrl = t.content?.video_url;
      if (!outputUrl) return { state: 'failed', error: 'byteplus task has no video_url', ...cost };
      return { state: 'succeeded', outputUrl, ...cost };
    },
    async cancel(job) {
      const url = task(unpackJobId(job).id);
      try {
        // DELETE cancels a queued task but deletes the record of a finished one, which would make every later poll a 404: only a queued task is sent it.
        const t = (await sendJson(f, 'byteplus cancel', url, { headers, signal: timeout() })) as { status?: string };
        if (t.status !== 'queued') return { supported: false };
        await sendJson(f, 'byteplus cancel', url, { method: 'DELETE', headers, signal: timeout() });
        return { supported: true };
      } catch (e) {
        // A running task cannot be cancelled and the API refuses with a 4xx; a rate limit or a bad key says nothing about the task, so they throw.
        if (e instanceof ProviderHttpError && e.status >= 400 && e.status < 500 && ![401, 403, 429].includes(e.status)) return { supported: false };
        throw e;
      }
    },
  };
}

/**
 * Seedream answers the call itself, so submit makes it and keeps the outcome in the provider job id, which the worker saves; status only reads it back,
 * and a worker restart loses nothing (a lost connection during the call itself still does, and status then reports the estimate).
 */
export function createByteplusImageProvider(opts: { apiKey: string; fetch?: Fetch; readImage?: ReadImage }): ImageProvider {
  const f = opts.fetch ?? fetch;
  const headers = { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' };
  return {
    async submit(req) {
      const pixels = IMAGE_PIXELS[req.resolution];
      if (pixels === undefined) throw new ImageReadError(`byteplus image: no size for resolution ${req.resolution}`);
      // Seedream 5.0 Pro bills every input image after the first; the estimate the web app reserves adds the same (extraInputUsd).
      const priced = imageEstimate(req);
      const billed = { ...priced, costUsd: Number((priced.costUsd + extraInputUsd(req.model.endpoint, req.imageUrls.length)).toFixed(4)) };
      const images = await resolveImages(req.imageUrls, opts.readImage, { maxChars: MAX_BODY_CHARS });
      // 'auto' names the resolution level and lets the model choose the shape (it follows the input image); a ratio asks for a size in that ratio.
      const dims = req.ratio === 'auto' ? undefined : sizeFor(req.ratio, pixels);
      const body = {
        model: req.model.endpoint,
        prompt: req.prompt,
        ...(images.length > 0 && { image: images.length === 1 ? images[0] : images }),
        size: dims ? `${dims.width}x${dims.height}` : req.resolution,
        response_format: 'url',
        output_format: 'png',
        watermark: false,
      };
      let outcome: ProviderStatus;
      try {
        const res = (await create(f, 'byteplus image', `${API}/images/generations`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(IMAGE_CALL_MS) })) as {
          data?: { url?: string }[];
          usage?: { generated_images?: number };
        };
        const url = res.data?.[0]?.url;
        // Billing is only for images that were generated, so an answer without one costs nothing.
        outcome = url ? { state: 'succeeded', outputUrl: url, ...billed } : { state: 'failed', error: `byteplus returned no image: ${JSON.stringify(res).slice(0, 300)}`, ...(res.usage?.generated_images === 0 ? { costUsd: 0, costSource: 'reported' as const } : billed) };
      } catch (e) {
        if (e instanceof ImageReadError) throw e;
        // An HTTP error is not billed (only a generated image is); a timeout or a lost connection may have been.
        const cost = e instanceof ProviderHttpError ? { costUsd: 0, costSource: 'reported' as const } : billed;
        outcome = { state: 'failed', error: (e instanceof Error ? e.message : String(e)).slice(0, 500), ...cost };
      }
      return { providerJobId: IMAGE_PREFIX + Buffer.from(JSON.stringify(outcome)).toString('base64url') };
    },
    async status(job) {
      if (!job.providerJobId.startsWith(IMAGE_PREFIX)) throw new Error('Invalid byteplus image job');
      return JSON.parse(Buffer.from(job.providerJobId.slice(IMAGE_PREFIX.length), 'base64url').toString('utf8')) as ProviderStatus;
    },
    async cancel() {
      return { supported: false };
    },
  };
}
