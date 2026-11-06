// Gemini Omni 1.2 Flash on Vertex AI, through the Interactions API (GenerateContent is not supported by the model). Docs read 2026-11-06:
//   model page (id gemini-omni-1.2-flash, location global only, 3 to 15 s, 16:9 and 9:16, 360p to 4k, native audio, 10 images, 20 MB inline):
//   https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/omni-1-2-flash
//   asynchronous request: POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions with
//   { model, background: true, input: [{type:'text'}, {type:'image', ...}], response_format: [{type:'video', delivery, aspect_ratio, resolution, duration:'5s'}],
//   generation_config: { video_config: { task } } }; the answer is { id, status: 'in_progress', object: 'interaction' } and
//   GET .../interactions/{id} returns { status, steps: [..., { type: 'model_output', content: [{ type: 'video', data, mime_type }] }] }:
//   https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-text (task text_to_video),
//   .../generate-videos-from-an-image and .../generate-videos-from-first-and-last-frames (task image_to_video, the prompt says "Use the image as the first
//   frame."; first and last frames take 3 to 10 s), .../generate-videos-from-references (task reference_to_video, "Use the image(s) as references to generate the video.")
//   field reference (delivery 'inline' | 'uri', status in_progress | requires_action | completed | failed | cancelled | incomplete, image content with base64 `data`):
//   https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/interactions-api
// The video pages' samples use Cloud Storage URIs for input images and for output; CVS keeps no bucket for Vertex, so this adapter sends base64 `data`
// (the reference's image content) and asks for delivery 'inline', as the Veo adapter does. shortcut: both are documented by the reference only, the first canary confirms them.
import { boundedText, estimate, ImageReadError, imageTokens, plainImage, ProviderHttpError, timeout, type Fetch, type ReadImage } from './http';
import type { ProviderStatus, VideoProvider } from './types';
import { serviceAccountToken, type ServiceAccountKey } from './vertex';

export const VERTEX_OMNI_MODEL = 'gemini-omni-1.2-flash';
// shortcut: inline output is limited to 64 MiB (90 MiB JSON); a 15 s 720p clip is far below it, revisit before offering 1080p or 4k.
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
export const MAX_RESPONSE_BYTES = 90 * 1024 * 1024;
/** How long a create may take before the job is failed; GETs keep the shared 30 s. */
export const SUBMIT_TIMEOUT_MS = 120_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
const PREFIX = 'vertex-omni-v1:';
const ID = /^[a-zA-Z0-9_-]{1,512}$/;

/** One interaction and one lookup per call; the persisted id survives worker restarts and price changes. */
export function createVertexOmniProvider(opts: {
  key: ServiceAccountKey; project: string;
  fetch?: Fetch; readImage?: ReadImage; token?: () => Promise<string>;
}): VideoProvider {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:.-]*$/.test(opts.project)) throw new Error('Invalid Vertex Omni project');
  const f = opts.fetch ?? fetch;
  const tokenFetch: Fetch = async (url, init) => {
    const res = await f(url, { ...init, signal: timeout() });
    return new Response(await boundedText(res, 'Vertex Omni token', 64 * 1024), { status: res.status });
  };
  const token = opts.token ?? serviceAccountToken(opts.key, tokenFetch);
  const base = `https://aiplatform.googleapis.com/v1beta1/projects/${opts.project}/locations/global/interactions`;
  async function call(url: string, body?: unknown): Promise<any> {
    const headers: Record<string, string> = { Authorization: `Bearer ${await token()}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    // The canary's first create (2026-11-06) took over 30 s yet still ran and billed, so a create gets SUBMIT_TIMEOUT_MS before the job is failed.
    const res = await f(url, { method: body === undefined ? 'GET' : 'POST', signal: body === undefined ? timeout() : AbortSignal.timeout(SUBMIT_TIMEOUT_MS), headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await boundedText(res, 'Vertex Omni', MAX_RESPONSE_BYTES);
    if (!res.ok) throw new ProviderHttpError(res.status, text, `Vertex Omni: HTTP ${res.status}`);
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Malformed Vertex Omni response');
    return data;
  }
  async function image(url: string) {
    if (!opts.readImage) throw new ImageReadError('Vertex Omni requires an image reader');
    let read: Awaited<ReturnType<ReadImage>>;
    try { read = await opts.readImage(url); }
    catch (e) { throw new ImageReadError(`Vertex Omni image: ${e instanceof Error ? e.message : e}`); }
    if (!IMAGE_TYPES.includes(read.contentType) || !read.bytes.length || read.bytes.length > MAX_IMAGE_BYTES) throw new ImageReadError('Vertex Omni needs PNG, JPEG, WebP, HEIC or HEIF images under 20 MiB');
    return { type: 'image', data: Buffer.from(read.bytes).toString('base64'), mime_type: read.contentType };
  }
  return {
    async submit(req) {
      const n = req.imageUrls.length;
      const hasEnd = req.endImageUrl !== undefined;
      // The last frame needs exactly one first frame and a clip of at most 10 s; images without it are references from the second one on.
      if (req.model.endpoint !== VERTEX_OMNI_MODEL || req.model.outputResolution !== '720p' || !['16:9', '9:16'].includes(req.ratio) || !Number.isInteger(req.durationSec) || req.durationSec < 3 || req.durationSec > (hasEnd ? 10 : 15) || n > 10 || (hasEnd && n !== 1) || (req.audioUrls?.length ?? 0) > 0) throw new ImageReadError('Unsupported Vertex Omni input');
      const { costUsd } = estimate(req, req.durationSec);
      if (!Number.isFinite(costUsd) || costUsd < 0) throw new ImageReadError('Invalid Vertex Omni estimate');
      const images = await Promise.all([...req.imageUrls, ...(hasEnd ? [req.endImageUrl!] : [])].map(image));
      const task = n === 0 ? 'text_to_video' : n === 1 ? 'image_to_video' : 'reference_to_video';
      const how = hasEnd ? ' Use the first image as the first frame and the second image as the last frame.' : n === 1 ? ' Use the image as the first frame.' : n > 1 ? ' Use the image(s) as references to generate the video.' : '';
      // Omni always makes sound (ALWAYS_AUDIO), so req.audio is not read.
      const data = await call(base, {
        model: VERTEX_OMNI_MODEL,
        background: true,
        input: [{ type: 'text', text: imageTokens(req.prompt, plainImage) + how }, ...images],
        response_format: [{ type: 'video', delivery: 'inline', aspect_ratio: req.ratio, resolution: '720p', duration: `${req.durationSec}s` }],
        generation_config: { video_config: { task } },
      });
      if (typeof data.id !== 'string' || !ID.test(data.id) || ['failed', 'cancelled', 'incomplete'].includes(data.status)) throw new Error('Invalid Vertex Omni interaction');
      return { providerJobId: PREFIX + Buffer.from(JSON.stringify({ id: data.id, costUsd })).toString('base64url') };
    },
    async status(job): Promise<ProviderStatus> {
      if (job.model.endpoint !== VERTEX_OMNI_MODEL || !job.providerJobId.startsWith(PREFIX) || job.providerJobId.length > 4096) throw new Error('Invalid Vertex Omni job');
      const saved = JSON.parse(Buffer.from(job.providerJobId.slice(PREFIX.length), 'base64url').toString('utf8'));
      if (!saved || typeof saved.id !== 'string' || !ID.test(saved.id) || !Number.isFinite(saved.costUsd) || saved.costUsd < 0) throw new Error('Invalid Vertex Omni job');
      const data = await call(`${base}/${saved.id}`);
      if (data.id !== undefined && data.id !== saved.id) throw new Error('Invalid Vertex Omni interaction');
      const failed = (error: string): ProviderStatus => ({ state: 'failed', error, costUsd: saved.costUsd, costSource: 'estimate' });
      if (data.status === 'in_progress') return { state: 'running' };
      if (data.status !== 'completed') {
        const reason = Array.isArray(data.errors) && typeof data.errors[0]?.message === 'string' ? `: ${data.errors[0].message.slice(0, 200)}` : '';
        return failed(`Vertex Omni interaction ${typeof data.status === 'string' ? data.status.slice(0, 40) : 'malformed'}${reason}`);
      }
      const videos = (Array.isArray(data.steps) ? data.steps : [])
        .filter((s: any) => s?.type === 'model_output' && Array.isArray(s.content))
        .flatMap((s: any) => s.content.filter((c: any) => c?.type === 'video'));
      if (videos.length !== 1) return failed('Vertex Omni returned no single video');
      const { data: encoded, mime_type: mime, uri } = videos[0];
      if (uri !== undefined || mime !== 'video/mp4' || typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) return failed('Vertex Omni returned invalid inline video');
      const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
      if (encoded.length / 4 * 3 - padding > MAX_VIDEO_BYTES) return failed('Vertex Omni video exceeds inline limit');
      if (Buffer.from(encoded, 'base64').toString('base64') !== encoded) return failed('Vertex Omni returned malformed base64');
      return { state: 'succeeded', outputUrl: `data:video/mp4;base64,${encoded}`, costUsd: saved.costUsd, costSource: 'estimate' };
    },
    // shortcut: the reference documents POST .../interactions/{id}/cancel for background interactions, but a cancelled one is still billed for what it made; add it with the first canary's measurements.
    async cancel() { return { supported: false }; },
  };
}
