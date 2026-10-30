import { estimate, ImageReadError, ProviderHttpError, timeout, type Fetch, type ReadImage } from './http';
import type { ProviderStatus, VideoProvider } from './types';
import { serviceAccountToken, type ServiceAccountKey } from './vertex';

const MODEL = 'veo-3.1-generate-001';
// shortcut: inline output is limited to 64 MiB (90 MiB JSON), revisit before supporting longer or higher-resolution clips.
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
export const MAX_RESPONSE_BYTES = 90 * 1024 * 1024;
const PREFIX = 'vertex-veo-v1:';

/** One prediction and one operation lookup per call; the persisted id survives worker restarts and price changes. */
export function createVertexVideoProvider(opts: {
  key: ServiceAccountKey; project: string; region: 'us-central1';
  fetch?: Fetch; readImage?: ReadImage; token?: () => Promise<string>;
}): VideoProvider {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:.-]*$/.test(opts.project) || opts.region !== 'us-central1') throw new Error('Invalid Vertex video project or region');
  const f = opts.fetch ?? fetch;
  const tokenFetch: Fetch = async (url, init) => {
    const res = await f(url, { ...init, signal: timeout() });
    const reader = res.body?.getReader();
    if (!reader) throw new Error('Vertex Veo token returned an empty response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 64 * 1024) throw new Error('Vertex Veo token response exceeds 64 KiB');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return new Response(Buffer.concat(chunks), { status: res.status });
  };
  const token = opts.token ?? serviceAccountToken(opts.key, tokenFetch);
  const modelPath = `projects/${opts.project}/locations/us-central1/publishers/google/models/${MODEL}`;
  const base = `https://us-central1-aiplatform.googleapis.com/v1/${modelPath}`;
  const validOperation = (name: unknown): name is string => typeof name === 'string' && name.startsWith(`${modelPath}/operations/`) && /^[a-zA-Z0-9_-]+$/.test(name.slice(`${modelPath}/operations/`.length));
  async function post(method: string, body: unknown): Promise<any> {
    const signal = timeout();
    const res = await f(`${base}:${method}`, { method: 'POST', signal, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const reader = res.body?.getReader();
    if (!reader) throw new Error('Vertex Veo returned an empty response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) throw new Error('Vertex Veo response exceeds inline limit');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!res.ok) throw new ProviderHttpError(res.status, text, `Vertex Veo: HTTP ${res.status}`);
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Malformed Vertex Veo response');
    return data;
  }
  return {
    async submit(req) {
      if (req.model.endpoint !== MODEL || req.model.outputResolution !== '720p' || !['16:9', '9:16'].includes(req.ratio) || ![4, 6, 8].includes(req.durationSec) || req.imageUrls.length > 1 || req.endImageUrl !== undefined || (req.audioUrls?.length ?? 0) > 0 || (req.audio !== undefined && typeof req.audio !== 'boolean')) throw new ImageReadError('Unsupported Vertex Veo input');
      const { costUsd } = estimate(req, req.durationSec);
      if (!Number.isFinite(costUsd) || costUsd < 0) throw new ImageReadError('Invalid Vertex Veo estimate');
      const instance: Record<string, unknown> = { prompt: req.prompt };
      if (req.imageUrls.length) {
        if (!opts.readImage) throw new ImageReadError('Vertex Veo requires an image reader');
        let image: Awaited<ReturnType<ReadImage>>;
        try { image = await opts.readImage(req.imageUrls[0]!); }
        catch (e) { throw new ImageReadError(`Vertex Veo image: ${e instanceof Error ? e.message : e}`); }
        if (!['image/jpeg', 'image/png'].includes(image.contentType) || !image.bytes.length || image.bytes.length > 20 * 1024 * 1024) throw new ImageReadError('Vertex Veo needs one JPEG or PNG under 20 MiB');
        instance.image = { bytesBase64Encoded: Buffer.from(image.bytes).toString('base64'), mimeType: image.contentType };
      }
      const data = await post('predictLongRunning', { instances: [instance], parameters: { aspectRatio: req.ratio, durationSeconds: req.durationSec, resolution: '720p', sampleCount: 1, generateAudio: req.audio ?? false } });
      if (!validOperation(data.name)) throw new Error('Invalid Vertex Veo operation');
      return { providerJobId: PREFIX + Buffer.from(JSON.stringify({ name: data.name, costUsd })).toString('base64url') };
    },
    async status(job): Promise<ProviderStatus> {
      if (job.model.endpoint !== MODEL || !job.providerJobId.startsWith(PREFIX) || job.providerJobId.length > 4096) throw new Error('Invalid Vertex Veo job');
      const saved = JSON.parse(Buffer.from(job.providerJobId.slice(PREFIX.length), 'base64url').toString('utf8'));
      if (!saved || !validOperation(saved.name) || !Number.isFinite(saved.costUsd) || saved.costUsd < 0) throw new Error('Invalid Vertex Veo job');
      const data = await post('fetchPredictOperation', { operationName: saved.name });
      if (data.name !== undefined && data.name !== saved.name) throw new Error('Invalid Vertex Veo operation');
      const failed = (error: string): ProviderStatus => ({ state: 'failed', error, costUsd: saved.costUsd, costSource: 'estimate' });
      if (data.error) return failed('Vertex Veo generation failed');
      if (data.done === false || (data.done === undefined && data.name === saved.name)) return { state: 'running' };
      if (data.done !== true) return failed('Malformed Vertex Veo operation');
      const response = data.response;
      if (response?.raiMediaFilteredCount || response?.raiMediaFilteredReasons?.length) return failed('Vertex Veo safety filter rejected the output');
      const videos = response?.videos;
      if (!Array.isArray(videos) || videos.length !== 1) return failed('Vertex Veo returned no single inline video');
      const video = videos[0];
      const encoded = video?.bytesBase64Encoded;
      if (video?.gcsUri !== undefined || video?.mimeType !== 'video/mp4' || typeof encoded !== 'string' || !encoded.length || encoded.length > 4 * Math.ceil(MAX_VIDEO_BYTES / 3) || encoded.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(encoded) || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return failed('Vertex Veo returned invalid inline video');
      const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
      if (encoded.length / 4 * 3 - padding > MAX_VIDEO_BYTES) return failed('Vertex Veo video exceeds inline limit');
      const bytes = Buffer.from(encoded, 'base64');
      if (bytes.toString('base64') !== encoded) return failed('Vertex Veo returned malformed base64');
      return { state: 'succeeded', outputUrl: `data:video/mp4;base64,${encoded}`, costUsd: saved.costUsd, costSource: 'estimate' };
    },
    async cancel() { return { supported: false }; },
  };
}
