// fal queue API. Docs read 2026-10-23:
//   queue (submit/status/result/cancel, auth, statuses): https://fal.ai/docs/model-apis/model-endpoints/queue
//   X-Fal-Store-IO and X-Fal-Object-Lifecycle-Preference: https://fal.ai/docs/model-apis/media-expiration
//   Kling O3 Pro input and output schema: https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/o3/pro/reference-to-video
import { estimate, packJobId, sendJson, unpackJobId, type Fetch } from './http';
import type { ProviderStatus, VideoProvider } from './types';

const QUEUE = 'https://queue.fal.run';
/** One hour, the example value in the media-expiration docs; the worker copies the output at once. */
const LIFECYCLE = JSON.stringify({ expiration_duration_seconds: 3600 });

/** The docs say status, result and cancel URLs use only owner and app ("fal-ai/kling-video"), not the full endpoint path (405 otherwise). */
const appPath = (endpoint: string): string => endpoint.split('/').slice(0, 2).join('/');

export function createFalProvider(opts: { apiKey: string; fetch?: Fetch }): VideoProvider {
  const f = opts.fetch ?? fetch;
  const headers = {
    Authorization: `Key ${opts.apiKey}`,
    'Content-Type': 'application/json',
    'X-Fal-Store-IO': '0',
    'X-Fal-Object-Lifecycle-Preference': LIFECYCLE,
  };
  return {
    async submit(req) {
      const body = {
        prompt: req.prompt,
        image_urls: req.imageUrls,
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
      const base = `${QUEUE}/${appPath(job.model.endpoint)}/requests/${id}`;
      const st = (await sendJson(f, 'fal status', `${base}/status`, { headers })) as { status?: string; error?: string; error_type?: string };
      if (st.status === 'IN_QUEUE') return { state: 'queued' };
      if (st.status === 'IN_PROGRESS') return { state: 'running' };
      if (st.status !== 'COMPLETED') throw new Error(`fal status: unknown status ${String(st.status)}`);
      const cost = estimate(job, durationSec);
      // A failed request completes with `error` (human-readable) and `error_type` (machine-readable).
      if (st.error || st.error_type) return { state: 'failed', error: st.error ?? st.error_type ?? 'failed', ...cost };
      const out = (await sendJson(f, 'fal result', base, { headers })) as { video?: { url?: string } };
      const outputUrl = out.video?.url;
      if (!outputUrl) return { state: 'failed', error: 'fal result has no video.url', ...cost };
      return { state: 'succeeded', outputUrl, ...cost };
    },
    // fal cannot reliably cancel a running job (its cancel only removes queued requests), so the app does not try.
    async cancel() {
      return { supported: false };
    },
  };
}
