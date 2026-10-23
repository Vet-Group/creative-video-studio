// Replicate HTTP API. Docs read 2026-10-23:
//   create on an official model, get, cancel, statuses, auth: https://replicate.com/docs/reference/http
//   file inputs: "Files should be passed as HTTP URLs or data URLs" (same page; the Files API is not documented on any readable page, so
//   non-https images are sent as data URLs, recommended there for files of 256kb or less)
//   input field names (aspect_ratio, resolution, duration, reference_images, generate_audio): the model schema, read by the coordinating
//   session (plan B.1); the public model pages do not show it, so these names are unverified by this adapter's author.
import { estimate, packJobId, resolveImages, sendJson, timeout, unpackJobId, type Fetch, type ReadImage } from './http';
import type { ProviderStatus, VideoProvider } from './types';

const API = 'https://api.replicate.com/v1';
// Without a User-Agent the API answers 403 (plan B.1).
const USER_AGENT = 'creative-video-studio/1.0';

export function createReplicateProvider(opts: { apiToken: string; fetch?: Fetch; readImage?: ReadImage }): VideoProvider {
  const f = opts.fetch ?? fetch;
  const headers = { Authorization: `Bearer ${opts.apiToken}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT };
  return {
    async submit(req) {
      const input: Record<string, unknown> = {
        prompt: req.prompt,
        // Product photos are references, not a first frame; the prompt addresses them as [Image1], [Image2].
        reference_images: await resolveImages(req.imageUrls, opts.readImage),
        aspect_ratio: req.ratio,
        duration: req.durationSec,
        // The price is the image-only variant; keep the output silent.
        generate_audio: false,
      };
      if (req.model.outputResolution) input.resolution = req.model.outputResolution;
      const res = (await sendJson(f, 'replicate submit', `${API}/models/${req.model.endpoint}/predictions`, { method: 'POST', headers, body: JSON.stringify({ input }) })) as { id?: string };
      if (!res.id) throw new Error('replicate submit: no id in the response');
      return { providerJobId: packJobId(req.durationSec, res.id) };
    },
    async status(job): Promise<ProviderStatus> {
      const { durationSec, id } = unpackJobId(job);
      const p = (await sendJson(f, 'replicate status', `${API}/predictions/${id}`, { headers, signal: timeout() })) as { status?: string; output?: unknown; error?: unknown };
      if (p.status === 'starting') return { state: 'queued' };
      if (p.status === 'processing') return { state: 'running' };
      const cost = estimate(job, durationSec);
      if (p.status === 'failed' || p.status === 'canceled') return { state: p.status, error: p.error ? String(p.error) : p.status, ...cost };
      if (p.status !== 'succeeded') throw new Error(`replicate status: unknown status ${String(p.status)}`);
      // The output is one file URL, or a list of them.
      const outputUrl = Array.isArray(p.output) ? p.output[0] : p.output;
      if (typeof outputUrl !== 'string') return { state: 'failed', error: 'replicate prediction has no output', ...cost };
      return { state: 'succeeded', outputUrl, ...cost };
    },
    async cancel(job) {
      await sendJson(f, 'replicate cancel', `${API}/predictions/${unpackJobId(job).id}/cancel`, { method: 'POST', headers, signal: timeout() });
      return { supported: true };
    },
  };
}
