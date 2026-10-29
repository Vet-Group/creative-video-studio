// Vertex AI image models, called with a service account. Docs read 2026-10-29:
//   Gemini image models (Nano Banana): https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/image-generation (model ids,
//   location global, generateContent with responseModalities IMAGE, inlineData in the answer); imageConfig.aspectRatio and imageSize:
//   https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-edit-images; ratios and 1K/2K/4K:
//   https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-pro-image
//   Virtual Try-On: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/generate-virtual-try-on-images (virtual-try-on-001:predict,
//   personImage, productImages, predictions[].bytesBase64Encoded)
//   Product Recontext: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-product-recontext-api (prompt, up to three
//   productImages of one product; access is granted through a request form)
//   service-account token (JWT bearer grant): https://developers.google.com/identity/protocols/oauth2/service-account#httprest
//   billing: "You're charged only for requests that return a 200 response code" (https://cloud.google.com/vertex-ai/generative-ai/pricing)
import { createSign, randomUUID } from 'node:crypto';
import { ImageReadError, imageEstimate, ProviderHttpError, resolveImages, sendJson, type Fetch, type ReadImage } from './http';
import type { ImageProvider, ImageSubmitRequest, ProviderStatus } from './types';

/** The fields of a service account JSON key that the token grant needs. */
export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
/** Image calls answer in seconds; this bounds a stuck one well inside the worker's 10-minute job limit. */
const CALL_MS = 300_000;

const b64url = (s: string | Buffer): string => Buffer.from(s).toString('base64url');

/** An access token for the service account, from a signed JWT, reused until a minute before it expires. */
export function serviceAccountToken(key: ServiceAccountKey, f: Fetch = fetch, now: () => number = Date.now): () => Promise<string> {
  let cached: { token: string; until: number } | undefined;
  return async () => {
    if (cached && now() < cached.until) return cached.token;
    const iat = Math.floor(now() / 1000);
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }))}`;
    const assertion = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')}`;
    const res = (await sendJson(f, 'vertex token', TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    })) as { access_token?: string; expires_in?: number };
    if (!res.access_token) throw new Error('vertex token: no access_token in the response');
    cached = { token: res.access_token, until: now() + ((res.expires_in ?? 3600) - 60) * 1000 };
    return cached.token;
  };
}

type Inline = { mimeType: string; data: string };

/** The worker inlines every input as a data URL; Vertex takes base64 bytes (or Cloud Storage URIs, which the app does not use). */
function inline(url: string): Inline {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (!m) throw new ImageReadError('vertex needs inline images (a data URL), not a link');
  return { mimeType: m[1]!, data: m[2]! };
}

/** The URL path and body of one call, and where the image sits in its answer. */
interface Call {
  path: string;
  body: unknown;
  pick: (answer: unknown) => Inline | undefined;
}

/** Gemini image models answer with inline parts; the first image part is the output. */
const geminiImage = (answer: unknown): Inline | undefined => {
  const parts = (answer as { candidates?: { content?: { parts?: { inlineData?: Inline }[] } }[] }).candidates?.[0]?.content?.parts ?? [];
  return parts.find((p) => p.inlineData?.data)?.inlineData;
};

/** Imagen models (Try-On, Recontext) answer with predictions of base64 bytes. */
const imagenImage = (answer: unknown): Inline | undefined => {
  const p = (answer as { predictions?: { bytesBase64Encoded?: string; mimeType?: string }[] }).predictions?.[0];
  return p?.bytesBase64Encoded ? { mimeType: p.mimeType ?? 'image/png', data: p.bytesBase64Encoded } : undefined;
};

const image = (i: Inline) => ({ image: { bytesBase64Encoded: i.data } });

/**
 * The call for each model, built before any network call so a request the model cannot take submits nothing. The Gemini image models are served
 * only from the global location; the Imagen ones from a region. shortcut: the Recontext body follows the reference page only (the model is gated
 * behind a request form); the first canary confirms it.
 */
function callFor(req: ImageSubmitRequest, images: Inline[], project: string, region: string): Call {
  const model = req.model.endpoint;
  if (model.startsWith('gemini-')) {
    // 'auto' sends no ratio, so the output follows the input image. Gemini 2.5 Flash Image (Nano Banana) makes 1K only and takes no size.
    const imageConfig = { ...(req.ratio !== 'auto' && { aspectRatio: req.ratio }), ...(!model.startsWith('gemini-2.5') && { imageSize: req.resolution }) };
    return {
      path: `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`,
      body: {
        contents: [{ role: 'user', parts: [...images.map((inlineData) => ({ inlineData })), { text: req.prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], candidateCount: 1, imageConfig },
      },
      pick: geminiImage,
    };
  }
  const predict = `https://${region}-aiplatform.googleapis.com/v1/projects/${project}/locations/${region}/publishers/google/models/${model}:predict`;
  if (model === 'virtual-try-on-001') {
    // The person image first, then the garment (the Try On form's order); the prompt is not read.
    if (images.length !== 2) throw new ImageReadError('virtual try-on needs the person image and one garment image');
    return { path: predict, body: { instances: [{ personImage: image(images[0]!), productImages: [image(images[1]!)] }], parameters: { sampleCount: 1 } }, pick: imagenImage };
  }
  if (model.startsWith('imagen-product-recontext')) {
    if (images.length < 1 || images.length > 3) throw new ImageReadError('product recontext takes one to three images of the same product');
    if (!req.prompt.trim()) throw new ImageReadError('product recontext needs a prompt that describes the new scene');
    return { path: predict, body: { instances: [{ prompt: req.prompt, productImages: images.map(image) }], parameters: { sampleCount: 1 } }, pick: imagenImage };
  }
  throw new ImageReadError(`vertex image: no request builder for ${model}`);
}

/**
 * The Vertex calls are synchronous: submit makes the call and keeps the outcome until status reads it, as a data URL the worker downloads like any
 * other output. With `store` the outcome is also written there (MinIO in the worker), so a worker restart between submit and status, up to one
 * reconcile tick, no longer loses an image Google billed. shortcut: a restart during the call itself still loses it (status reports a failure at
 * the estimate); a Cloud Storage output (storageUri) would cover that too.
 */
export function createVertexImageProvider(opts: {
  key: ServiceAccountKey;
  project: string;
  /** The region of the Imagen models; the Gemini image models always use the global location. */
  region?: string;
  fetch?: Fetch;
  readImage?: ReadImage;
  /** Tests pass a fixed token; otherwise one is minted from the key. */
  token?: () => Promise<string>;
  /** Where outcomes outlive the process: the worker passes its object storage. */
  store?: { put(key: string, body: Uint8Array, contentType: string): Promise<void>; get(key: string): Promise<Uint8Array>; delete(key: string): Promise<void> };
}): ImageProvider {
  const f = opts.fetch ?? fetch;
  const token = opts.token ?? serviceAccountToken(opts.key, f);
  const region = opts.region ?? 'us-central1';
  const outcomes = new Map<string, ProviderStatus>();
  const keyOf = (id: string) => `vertex-outcomes/${id}.json`;
  return {
    async submit(req) {
      const call = callFor(req, (await resolveImages(req.imageUrls, opts.readImage)).map(inline), opts.project, region);
      const id = randomUUID();
      const billed = imageEstimate(req);
      try {
        const headers = { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' };
        const answer = await sendJson(f, 'vertex', call.path, { method: 'POST', headers, body: JSON.stringify(call.body), signal: AbortSignal.timeout(CALL_MS) });
        const out = call.pick(answer);
        // A 200 without an image (a safety block, for example) is still billed for its tokens; the estimate stands for that small amount.
        outcomes.set(id, out ? { state: 'succeeded', outputUrl: `data:${out.mimeType};base64,${out.data}`, ...billed } : { state: 'failed', error: `vertex returned no image: ${JSON.stringify(answer).slice(0, 300)}`, ...billed });
      } catch (e) {
        // Only a 200 is billed, so an HTTP error costs nothing and the worker releases the estimate; a timeout or a lost connection may have been billed.
        const cost = e instanceof ProviderHttpError ? { costUsd: 0, costSource: 'reported' as const } : billed;
        outcomes.set(id, { state: 'failed', error: e instanceof Error ? e.message : String(e), ...cost });
      }
      // A store that fails leaves the in-memory copy, as before the store existed.
      await opts.store?.put(keyOf(id), new TextEncoder().encode(JSON.stringify(outcomes.get(id))), 'application/json').catch(() => undefined);
      return { providerJobId: id };
    },
    async status(job) {
      const id = job.providerJobId;
      const kept = outcomes.get(id) ?? (await opts.store?.get(keyOf(id)).then((b) => JSON.parse(new TextDecoder().decode(b)) as ProviderStatus, () => undefined));
      if (!kept) return { state: 'failed', error: 'the vertex result was lost when the worker restarted', ...imageEstimate(job) };
      outcomes.delete(id);
      await opts.store?.delete(keyOf(id)).catch(() => undefined);
      return kept;
    },
    async cancel() {
      return { supported: false };
    },
  };
}
