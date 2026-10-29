// The Vertex image adapter against fixtures shaped like the request and answer bodies in Google's docs (read 2026-10-29). No network, no key.
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import type { ImageModelConfig } from '../models';
import { ImageReadError } from './http';
import type { ImageSubmitRequest } from './types';
import { createVertexImageProvider, serviceAccountToken } from './vertex';

const model = (id: string, endpoint: string, imagePrices: Record<string, string>): ImageModelConfig => ({
  id, provider: 'vertex', endpoint, label: id, ratios: ['auto', '1:1', '9:16'], maxImages: 14, imagePrices, features: ['image'],
});
const PRO = model('nano-banana-pro-vertex', 'gemini-3-pro-image', { '1K': '0.134', '4K': '0.24' });
const VTO = model('virtual-try-on-vertex', 'virtual-try-on-001', { '1K': '0.06' });
const RECONTEXT = model('product-recontext-vertex', 'imagen-product-recontext-preview-06-30', { '1K': '0.12' });
// Worker assets, read as 'AAA' (png) and 'BBB' (jpeg): base64 QUFB and QkJC.
const A = 'asset://a';
const B = 'asset://b';
const readImage = async (url: string) => ({ bytes: new TextEncoder().encode(url === A ? 'AAA' : 'BBB'), contentType: url === A ? 'image/png' : 'image/jpeg' });
const req = (m: ImageModelConfig, extra: Partial<ImageSubmitRequest> = {}): ImageSubmitRequest => ({
  model: m, prompt: 'a bottle on a marble table', imageUrls: [A, B], ratio: '9:16', resolution: '1K', ...extra,
});

type Call = { url: string; headers: Record<string, string>; body: string };
function fakeFetch(...answers: ([number, unknown] | Error)[]) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: init.body as string });
    const a = answers.shift() ?? [500, {}];
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a[1]), { status: a[0] });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const KEY = { client_email: 'sa@p.iam.gserviceaccount.com', private_key: 'unused' };
const provider = (f: typeof fetch) => createVertexImageProvider({ key: KEY, project: 'proj', fetch: f, readImage, token: async () => 'tok' });
const geminiAnswer = { candidates: [{ content: { parts: [{ text: 'here it is' }, { inlineData: { mimeType: 'image/png', data: 'T1VU' } }] } }] };

describe('vertex Gemini image models', () => {
  test('Nano Banana Pro posts the images then the prompt to the global generateContent with ratio and size, and status hands back the image', async () => {
    const { fn, calls } = fakeFetch([200, geminiAnswer]);
    const p = provider(fn);
    const { providerJobId } = await p.submit(req(PRO, { resolution: '4K' }));
    expect(calls[0]!.url).toBe('https://aiplatform.googleapis.com/v1/projects/proj/locations/global/publishers/google/models/gemini-3-pro-image:generateContent');
    expect(calls[0]!.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(calls[0]!.body)).toEqual({
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'QUFB' } }, { inlineData: { mimeType: 'image/jpeg', data: 'QkJC' } }, { text: 'a bottle on a marble table' }] }],
      generationConfig: { responseModalities: ['IMAGE'], candidateCount: 1, imageConfig: { aspectRatio: '9:16', imageSize: '4K' } },
    });
    const job = { providerJobId, model: PRO, resolution: '4K' };
    expect(await p.status(job)).toEqual({ state: 'succeeded', outputUrl: 'data:image/png;base64,T1VU', costUsd: 0.24, costSource: 'estimate' });
    // The outcome is handed over once; a second read (after a worker restart, say) cannot find it and reports the estimate as possibly billed.
    expect(await p.status(job)).toEqual({ state: 'failed', error: 'the vertex result was lost when the worker restarted', costUsd: 0.24, costSource: 'estimate' });
  });

  test("'auto' sends no ratio, and Nano Banana (Gemini 2.5 Flash Image) gets no size", async () => {
    const { fn, calls } = fakeFetch([200, geminiAnswer], [200, geminiAnswer]);
    await provider(fn).submit(req(PRO, { ratio: 'auto' }));
    await provider(fn).submit(req(model('nano-banana-vertex', 'gemini-2.5-flash-image', { '1K': '0.039' })));
    expect(JSON.parse(calls[0]!.body).generationConfig.imageConfig).toEqual({ imageSize: '1K' });
    expect(JSON.parse(calls[1]!.body).generationConfig.imageConfig).toEqual({ aspectRatio: '9:16' });
  });

  test('a 200 without an image fails at the estimate, since its tokens are billed', async () => {
    const { fn } = fakeFetch([200, { candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }]);
    const p = provider(fn);
    const { providerJobId } = await p.submit(req(PRO));
    expect(await p.status({ providerJobId, model: PRO, resolution: '1K' })).toMatchObject({ state: 'failed', error: expect.stringMatching(/^vertex returned no image: .*SAFETY/), costUsd: 0.134, costSource: 'estimate' });
  });
});

describe('vertex Imagen models', () => {
  test('Virtual Try-On posts the person and the garment to the regional predict endpoint and reads the base64 prediction', async () => {
    const { fn, calls } = fakeFetch([200, { predictions: [{ mimeType: 'image/png', bytesBase64Encoded: 'VlRP' }] }]);
    const p = createVertexImageProvider({ key: KEY, project: 'proj', region: 'europe-west4', fetch: fn, readImage, token: async () => 'tok' });
    const { providerJobId } = await p.submit(req(VTO, { ratio: 'auto', prompt: '' }));
    expect(calls[0]!.url).toBe('https://europe-west4-aiplatform.googleapis.com/v1/projects/proj/locations/europe-west4/publishers/google/models/virtual-try-on-001:predict');
    expect(JSON.parse(calls[0]!.body)).toEqual({
      instances: [{ personImage: { image: { bytesBase64Encoded: 'QUFB' } }, productImages: [{ image: { bytesBase64Encoded: 'QkJC' } }] }],
      parameters: { sampleCount: 1 },
    });
    expect(await p.status({ providerJobId, model: VTO, resolution: '1K' })).toEqual({ state: 'succeeded', outputUrl: 'data:image/png;base64,VlRP', costUsd: 0.06, costSource: 'estimate' });
  });

  test('Product Recontext sends the prompt and up to three product images, in us-central1 by default', async () => {
    const { fn, calls } = fakeFetch([200, { predictions: [{ bytesBase64Encoded: 'UkVD' }] }]);
    const p = provider(fn);
    const { providerJobId } = await p.submit(req(RECONTEXT, { imageUrls: [A, B, A] }));
    expect(calls[0]!.url).toBe('https://us-central1-aiplatform.googleapis.com/v1/projects/proj/locations/us-central1/publishers/google/models/imagen-product-recontext-preview-06-30:predict');
    expect(JSON.parse(calls[0]!.body)).toEqual({
      instances: [{ prompt: 'a bottle on a marble table', productImages: [{ image: { bytesBase64Encoded: 'QUFB' } }, { image: { bytesBase64Encoded: 'QkJC' } }, { image: { bytesBase64Encoded: 'QUFB' } }] }],
      parameters: { sampleCount: 1 },
    });
    // No mimeType in the prediction: png, the Imagen default.
    expect(await p.status({ providerJobId, model: RECONTEXT, resolution: '1K' })).toMatchObject({ state: 'succeeded', outputUrl: 'data:image/png;base64,UkVD' });
  });

  test.each([
    ['Try-On with one image', req(VTO, { imageUrls: [A] }), /person image and one garment/],
    ['Try-On with three images', req(VTO, { imageUrls: [A, B, A] }), /person image and one garment/],
    ['Recontext with four images', req(RECONTEXT, { imageUrls: [A, B, A, B] }), /one to three images/],
    ['Recontext without a prompt', req(RECONTEXT, { prompt: '  ' }), /needs a prompt/],
    ['an https image', req(PRO, { imageUrls: ['https://img/1.jpg'] }), /inline images/],
    ['an unknown model', req(model('x', 'imagen-4.0-generate-001', { '1K': '0.04' })), /no request builder/],
  ])('%s is refused before any call, so the estimate is released', async (_what, r, message) => {
    const { fn, calls } = fakeFetch();
    const err = await provider(fn).submit(r).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImageReadError);
    expect((err as Error).message).toMatch(message);
    expect(calls).toHaveLength(0);
  });
});

describe('vertex failures and inputs', () => {
  test('an HTTP error is not billed (only a 200 is), so the failure reports 0; a lost connection may have been billed and keeps the estimate', async () => {
    const { fn } = fakeFetch([403, { error: { status: 'PERMISSION_DENIED', message: 'Billing account is disabled' } }], new TypeError('fetch failed'));
    const p = provider(fn);
    const http = await p.submit(req(PRO));
    const lost = await p.submit(req(PRO));
    expect(await p.status({ providerJobId: http.providerJobId, model: PRO, resolution: '1K' })).toMatchObject({ state: 'failed', error: expect.stringMatching(/^vertex: HTTP 403 .*Billing/), costUsd: 0, costSource: 'reported' });
    expect(await p.status({ providerJobId: lost.providerJobId, model: PRO, resolution: '1K' })).toEqual({ state: 'failed', error: 'fetch failed', costUsd: 0.134, costSource: 'estimate' });
  });

  test('a worker asset is read and inlined before the call', async () => {
    const { fn, calls } = fakeFetch([200, geminiAnswer]);
    const p = createVertexImageProvider({ key: KEY, project: 'proj', fetch: fn, token: async () => 'tok', readImage: async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/webp' }) });
    await p.submit(req(PRO, { imageUrls: ['asset://a1'] }));
    expect(JSON.parse(calls[0]!.body).contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'image/webp', data: 'AQID' } });
  });

  test('cancel is not supported: the call has already run by the time a job has an id', async () => {
    expect(await provider(fakeFetch().fn).cancel({ providerJobId: 'x', model: PRO, resolution: '1K' })).toEqual({ supported: false });
  });
});

describe('serviceAccountToken', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const key = { client_email: 'sa@p.iam.gserviceaccount.com', private_key: privateKey };

  test('posts a JWT signed with the key for the cloud-platform scope, and reuses the token until a minute before it expires', async () => {
    const { fn, calls } = fakeFetch([200, { access_token: 'a1', expires_in: 3600 }], [200, { access_token: 'a2', expires_in: 3600 }]);
    let now = 1_800_000_000_000;
    const token = serviceAccountToken(key, fn, () => now);
    expect(await token()).toBe('a1');
    expect(calls[0]!.url).toBe('https://oauth2.googleapis.com/token');
    expect(calls[0]!.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const form = new URLSearchParams(calls[0]!.body);
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [head, claims, sig] = form.get('assertion')!.split('.');
    expect(JSON.parse(Buffer.from(head!, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString())).toEqual({
      iss: 'sa@p.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: 1_800_000_000, exp: 1_800_003_600,
    });
    expect(createVerify('RSA-SHA256').update(`${head}.${claims}`).verify(publicKey, sig!, 'base64url')).toBe(true);

    now += 3_539_000;
    expect(await token()).toBe('a1');
    expect(calls).toHaveLength(1);
    now += 2_000;
    expect(await token()).toBe('a2');
    expect(calls).toHaveLength(2);
  });

  test('a refused grant throws with the status, so the submit fails without calling the model', async () => {
    const { fn } = fakeFetch([400, { error: 'invalid_grant' }]);
    await expect(serviceAccountToken(key, fn)()).rejects.toThrow(/vertex token: HTTP 400 .*invalid_grant/);
  });
});
