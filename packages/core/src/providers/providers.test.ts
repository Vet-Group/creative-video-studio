// Hand-written fixtures until B.5a replaces them with recorded real responses. No test reads FAL_KEY or REPLICATE_API_TOKEN.
import { describe, expect, test } from 'vitest';
import { BAKEOFF_MODELS } from '../models';
import { createFalProvider } from './fal';
import { ImageReadError, isFundingRefusal, MAX_INLINE_CHARS, ProviderHttpError, unpackJobId } from './http';
import { createMockVideoProvider, MOCK_FAIL } from './mock';
import { createReplicateProvider } from './replicate';
import type { ProviderJob, SubmitRequest } from './types';

const [kling, seedance] = BAKEOFF_MODELS as [(typeof BAKEOFF_MODELS)[0], (typeof BAKEOFF_MODELS)[0]];
const base: Omit<SubmitRequest, 'model'> = { prompt: 'a bottle on a table', imageUrls: ['https://img/1.jpg', 'https://img/2.jpg'], ratio: '9:16', durationSec: 5 };

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown; signal?: AbortSignal | null };

const readImage = async (url: string) => {
  if (url.includes('missing')) throw new Error('asset not found');
  return { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' };
};
const DATA_URL = 'data:image/png;base64,AQID';

/** A fetch that records every call and answers from a queue of [status, json] fixtures. */
function fakeFetch(...answers: [number, unknown][]) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(init.body as string) : undefined, signal: init.signal });
    const [status, json] = answers.shift() ?? [500, {}];
    return new Response(JSON.stringify(json), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('fal', () => {
  const req: SubmitRequest = { ...base, model: kling };

  test('submit rewrites [ImageN] in the prompt to the @ImageN that the Kling schema reads', async () => {
    const { fn, calls } = fakeFetch([200, { request_id: 'req-1', status_url: 'x' }]);
    await createFalProvider({ apiKey: 'k', fetch: fn }).submit({ ...req, prompt: 'The person in [Image1] wears the product in [Image2]. Keep [Image 3], @Image4 and [Image1]2.' });
    expect((calls[0]!.body as { prompt: string }).prompt).toBe('The person in @Image1 wears the product in @Image2. Keep [Image 3], @Image4 and @Image1 2.');
  });

  test('submit sends auth, Store-IO 0, an hour lifecycle and the Kling body with audio off', async () => {
    const { fn, calls } = fakeFetch([200, { request_id: 'req-1', status_url: 'x' }]);
    const out = await createFalProvider({ apiKey: 'k', fetch: fn }).submit(req);
    expect(out.providerJobId).toBe('5:req-1');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://queue.fal.run/fal-ai/kling-video/o3/pro/reference-to-video');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.headers.Authorization).toBe('Key k');
    expect(calls[0]!.headers['X-Fal-Store-IO']).toBe('0');
    const lifecycle = JSON.parse(calls[0]!.headers['X-Fal-Object-Lifecycle-Preference']!);
    expect(lifecycle.expiration_duration_seconds).toBeGreaterThanOrEqual(3600);
    expect(calls[0]!.body).toEqual({
      prompt: 'a bottle on a table',
      image_urls: ['https://img/1.jpg', 'https://img/2.jpg'],
      aspect_ratio: '9:16',
      duration: '5',
      generate_audio: false,
    });
  });

  test('a refusal surfaces the HTTP status', async () => {
    const { fn } = fakeFetch([402, { detail: 'Exhausted balance' }]);
    const err = await createFalProvider({ apiKey: 'k', fetch: fn }).submit(req).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderHttpError);
    expect(err.status).toBe(402);
  });

  const job: ProviderJob = { providerJobId: '5:req-1', model: kling };

  test.each([
    ['IN_QUEUE', 'queued'],
    ['IN_PROGRESS', 'running'],
  ])('maps %s to %s', async (falStatus, state) => {
    const { fn, calls } = fakeFetch([200, { status: falStatus, request_id: 'req-1' }]);
    expect(await createFalProvider({ apiKey: 'k', fetch: fn }).status(job)).toEqual({ state });
    // Owner and app only, not the full endpoint path.
    expect(calls[0]!.url).toBe('https://queue.fal.run/fal-ai/kling-video/requests/req-1/status');
    expect(calls[0]!.headers.Authorization).toBe('Key k');
  });

  test('COMPLETED reads the result and estimates the cost', async () => {
    const { fn, calls } = fakeFetch([200, { status: 'COMPLETED' }], [200, { video: { url: 'https://v3.fal.media/a.mp4' } }]);
    const s = await createFalProvider({ apiKey: 'k', fetch: fn }).status(job);
    expect(s).toEqual({ state: 'succeeded', outputUrl: 'https://v3.fal.media/a.mp4', costUsd: 0.56, costSource: 'estimate' });
    expect(calls[1]!.url).toBe('https://queue.fal.run/fal-ai/kling-video/requests/req-1');
  });

  test('COMPLETED with an error is failed and still carries the estimate', async () => {
    const { fn, calls } = fakeFetch([200, { status: 'COMPLETED', error: 'content policy', error_type: 'content_policy_violation' }]);
    const s = await createFalProvider({ apiKey: 'k', fetch: fn }).status(job);
    expect(s).toEqual({ state: 'failed', error: 'content policy', costUsd: 0.56, costSource: 'estimate' });
    expect(calls).toHaveLength(1);
  });

  test('the cost follows the requested duration', async () => {
    const { fn } = fakeFetch([200, { status: 'COMPLETED' }], [200, { video: { url: 'u' } }]);
    const s = await createFalProvider({ apiKey: 'k', fetch: fn }).status({ providerJobId: '8:req-1', model: kling });
    expect(s).toMatchObject({ costUsd: 0.896, costSource: 'estimate' });
  });

  test('COMPLETED but a 4xx on the result is a failed job, not a thrown poll error', async () => {
    const { fn } = fakeFetch([200, { status: 'COMPLETED' }], [422, { detail: 'bad output' }]);
    const s = await createFalProvider({ apiKey: 'k', fetch: fn }).status(job);
    expect(s).toMatchObject({ state: 'failed', costUsd: 0.56, costSource: 'estimate' });
    expect((s as { error: string }).error).toContain('422');
  });

  test('a 5xx on the result still throws so the poll is retried', async () => {
    const { fn } = fakeFetch([200, { status: 'COMPLETED' }], [503, {}]);
    await expect(createFalProvider({ apiKey: 'k', fetch: fn }).status(job)).rejects.toBeInstanceOf(ProviderHttpError);
  });

  test.each([401, 403, 429])('a %i on the result says nothing about the job, so it throws and the key is polled again', async (code) => {
    const { fn } = fakeFetch([200, { status: 'COMPLETED' }], [code, { detail: 'nope' }]);
    const err = await createFalProvider({ apiKey: 'k', fetch: fn }).status(job).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderHttpError);
    expect(err.status).toBe(code);
  });

  test('status and result requests carry a timeout signal', async () => {
    const { fn, calls } = fakeFetch([200, { status: 'COMPLETED' }], [200, { video: { url: 'u' } }]);
    await createFalProvider({ apiKey: 'k', fetch: fn }).status(job);
    expect(calls.map((c) => c.signal instanceof AbortSignal)).toEqual([true, true]);
  });

  test('uploads non-https images before submit and sends the uploaded form', async () => {
    const { fn, calls } = fakeFetch([200, { request_id: 'req-1' }]);
    await createFalProvider({ apiKey: 'k', fetch: fn, readImage }).submit({ ...req, imageUrls: ['asset://a1', 'https://img/2.jpg'] });
    expect(calls).toHaveLength(1);
    expect((calls[0]!.body as { image_urls: string[] }).image_urls).toEqual([DATA_URL, 'https://img/2.jpg']);
  });

  test('a failed image read submits nothing, and a non-https URL without a resolver throws before any call', async () => {
    const { fn, calls } = fakeFetch([200, { request_id: 'req-1' }]);
    await expect(createFalProvider({ apiKey: 'k', fetch: fn, readImage }).submit({ ...req, imageUrls: ['asset://missing'] })).rejects.toThrow('asset not found');
    await expect(createFalProvider({ apiKey: 'k', fetch: fn }).submit({ ...req, imageUrls: ['asset://a1'] })).rejects.toThrow('readImage');
    expect(calls).toHaveLength(0);
  });

  test.each([
    ['402', 402, { detail: 'Payment required' }],
    ['403 exhausted balance', 403, { detail: 'User is locked. Reason: Exhausted balance.' }],
  ])('a %s refusal is a funding refusal', async (_n, status, body) => {
    const { fn } = fakeFetch([status, body]);
    const err = await createFalProvider({ apiKey: 'k', fetch: fn }).submit(req).catch((e) => e);
    expect(isFundingRefusal(err)).toBe(true);
    expect(err.body).toContain(JSON.stringify(body));
  });

  test('cancel is unsupported and makes no network call', async () => {
    const { fn, calls } = fakeFetch();
    expect(await createFalProvider({ apiKey: 'k', fetch: fn }).cancel(job)).toEqual({ supported: false });
    expect(calls).toHaveLength(0);
  });
});

describe('replicate', () => {
  const req: SubmitRequest = { ...base, model: seedance };
  const job: ProviderJob = { providerJobId: '5:pred-1', model: seedance };

  test('submit sends auth, User-Agent and the Seedance body at 720p with audio off', async () => {
    const { fn, calls } = fakeFetch([201, { id: 'pred-1', status: 'starting' }]);
    const out = await createReplicateProvider({ apiToken: 't', fetch: fn }).submit(req);
    expect(out.providerJobId).toBe('5:pred-1');
    expect(calls[0]!.url).toBe('https://api.replicate.com/v1/models/bytedance/seedance-2.5/predictions');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.headers.Authorization).toBe('Bearer t');
    expect(calls[0]!.headers['User-Agent']).toBeTruthy();
    expect(calls[0]!.body).toEqual({
      input: {
        prompt: 'a bottle on a table',
        reference_images: ['https://img/1.jpg', 'https://img/2.jpg'],
        aspect_ratio: '9:16',
        duration: 5,
        generate_audio: false,
        resolution: '720p',
      },
    });
  });

  test.each([
    ['starting', 'queued'],
    ['processing', 'running'],
  ])('maps %s to %s', async (repStatus, state) => {
    const { fn, calls } = fakeFetch([200, { id: 'pred-1', status: repStatus }]);
    expect(await createReplicateProvider({ apiToken: 't', fetch: fn }).status(job)).toEqual({ state });
    expect(calls[0]!.url).toBe('https://api.replicate.com/v1/predictions/pred-1');
    expect(calls[0]!.headers['User-Agent']).toBeTruthy();
  });

  test('succeeded returns the output URL (string or list) and the estimate', async () => {
    const want = { state: 'succeeded', outputUrl: 'https://replicate.delivery/a.mp4', costUsd: 1.156, costSource: 'estimate' };
    for (const output of ['https://replicate.delivery/a.mp4', ['https://replicate.delivery/a.mp4']]) {
      const { fn } = fakeFetch([200, { status: 'succeeded', output }]);
      expect(await createReplicateProvider({ apiToken: 't', fetch: fn }).status(job)).toEqual(want);
    }
  });

  test('succeeded without output (deleted after an hour) is failed', async () => {
    const { fn } = fakeFetch([200, { status: 'succeeded', output: null }]);
    expect(await createReplicateProvider({ apiToken: 't', fetch: fn }).status(job)).toMatchObject({ state: 'failed', costSource: 'estimate' });
  });

  test('failed and canceled carry the error and the estimate', async () => {
    const f1 = fakeFetch([200, { status: 'failed', error: 'NSFW' }]);
    expect(await createReplicateProvider({ apiToken: 't', fetch: f1.fn }).status(job)).toEqual({ state: 'failed', error: 'NSFW', costUsd: 1.156, costSource: 'estimate' });
    const f2 = fakeFetch([200, { status: 'canceled', error: null }]);
    expect(await createReplicateProvider({ apiToken: 't', fetch: f2.fn }).status(job)).toEqual({ state: 'canceled', error: 'canceled', costUsd: 1.156, costSource: 'estimate' });
  });

  test('status and cancel requests carry a timeout signal', async () => {
    const { fn, calls } = fakeFetch([200, { status: 'processing' }], [200, {}]);
    const p = createReplicateProvider({ apiToken: 't', fetch: fn });
    await p.status(job);
    await p.cancel(job);
    expect(calls.map((c) => c.signal instanceof AbortSignal)).toEqual([true, true]);
  });

  test('uploads non-https images before submit and sends the uploaded form', async () => {
    const { fn, calls } = fakeFetch([201, { id: 'pred-1' }]);
    await createReplicateProvider({ apiToken: 't', fetch: fn, readImage }).submit({ ...req, imageUrls: ['asset://a1', 'https://img/2.jpg'] });
    expect(calls).toHaveLength(1);
    expect((calls[0]!.body as { input: { reference_images: string[] } }).input.reference_images).toEqual([DATA_URL, 'https://img/2.jpg']);
  });

  test('a failed image read submits nothing, and a non-https URL without a resolver throws before any call', async () => {
    const { fn, calls } = fakeFetch([201, { id: 'pred-1' }]);
    await expect(createReplicateProvider({ apiToken: 't', fetch: fn, readImage }).submit({ ...req, imageUrls: ['asset://missing'] })).rejects.toThrow('asset not found');
    await expect(createReplicateProvider({ apiToken: 't', fetch: fn }).submit({ ...req, imageUrls: ['asset://a1'] })).rejects.toThrow('readImage');
    expect(calls).toHaveLength(0);
  });

  test('inlined images over MAX_INLINE_CHARS in total are refused before any call (Replicate reset a 3.8 MB body)', async () => {
    const { fn, calls } = fakeFetch([201, { id: 'pred-1' }]);
    const big = async () => ({ bytes: new Uint8Array(Math.ceil((MAX_INLINE_CHARS * 3) / 8)), contentType: 'image/png' });
    await expect(createReplicateProvider({ apiToken: 't', fetch: fn, readImage: big }).submit({ ...req, imageUrls: ['asset://a1', 'asset://a2'] })).rejects.toThrow(ImageReadError);
    expect(calls).toHaveLength(0);
    const { fn: ok } = fakeFetch([201, { id: 'pred-1' }]);
    await expect(createReplicateProvider({ apiToken: 't', fetch: ok, readImage: big }).submit({ ...req, imageUrls: ['asset://a1'] })).resolves.toEqual({ providerJobId: '5:pred-1' });
  });

  test.each([
    ['402', 402, { detail: 'Payment required' }],
    ['403 exhausted balance', 403, { detail: 'Your account has insufficient credit; set up billing' }],
  ])('a %s refusal is a funding refusal', async (_n, status, body) => {
    const { fn } = fakeFetch([status, body]);
    const err = await createReplicateProvider({ apiToken: 't', fetch: fn }).submit(req).catch((e) => e);
    expect(isFundingRefusal(err)).toBe(true);
    expect(err.body).toContain(JSON.stringify(body));
  });

  test('cancel posts to the cancel endpoint', async () => {
    const { fn, calls } = fakeFetch([200, { status: 'canceled' }]);
    expect(await createReplicateProvider({ apiToken: 't', fetch: fn }).cancel(job)).toEqual({ supported: true });
    expect(calls[0]!.url).toBe('https://api.replicate.com/v1/predictions/pred-1/cancel');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.headers['User-Agent']).toBeTruthy();
  });
});

describe('shared helpers', () => {
  test('other refusals are not funding refusals', () => {
    expect(isFundingRefusal(new ProviderHttpError(403, 'forbidden', 'x'))).toBe(false);
    // A rate limit is never a credit refusal, even when its body mentions payment or credit.
    expect(isFundingRefusal(new ProviderHttpError(429, 'add a payment method', 'x'))).toBe(false);
    expect(isFundingRefusal(new ProviderHttpError(429, 'out of credit for this minute', 'x'))).toBe(false);
    expect(isFundingRefusal(new ProviderHttpError(422, 'invalid duration', 'x'))).toBe(false);
    expect(isFundingRefusal(new ProviderHttpError(500, 'credit service down', 'x'))).toBe(false);
    expect(isFundingRefusal(new Error('balance'))).toBe(false);
  });

  test.each(['abc', ':abc', '0:abc', '-5:abc', '5.5:abc', '5:', 'abc:5'])('unpackJobId rejects "%s" instead of costing $0', (providerJobId) => {
    expect(() => unpackJobId({ providerJobId, model: kling })).toThrow('duration');
  });

  test('unpackJobId keeps colons inside the provider id', () => {
    expect(unpackJobId({ providerJobId: '8:a:b', model: kling })).toEqual({ durationSec: 8, id: 'a:b' });
  });
});

describe('mock', () => {
  const mockModel = { ...seedance, provider: 'mock' as const };

  test('walks queued, running, succeeded and estimates the cost', async () => {
    const p = createMockVideoProvider();
    const { providerJobId } = await p.submit({ ...base, model: mockModel });
    const job = { providerJobId, model: mockModel };
    expect((await p.status(job)).state).toBe('queued');
    expect((await p.status(job)).state).toBe('running');
    expect(await p.status(job)).toMatchObject({ state: 'succeeded', costUsd: 1.156, costSource: 'estimate' });
  });

  test('MOCK_FAIL fails and cancel ends as canceled', async () => {
    const p = createMockVideoProvider({ runningPolls: 0 });
    const bad = await p.submit({ ...base, prompt: MOCK_FAIL, model: mockModel });
    const job = { providerJobId: bad.providerJobId, model: mockModel };
    await p.status(job);
    expect((await p.status(job)).state).toBe('failed');
    const other = { providerJobId: (await p.submit({ ...base, model: mockModel })).providerJobId, model: mockModel };
    expect(await p.cancel(other)).toEqual({ supported: true });
    expect((await p.status(other)).state).toBe('canceled');
  });
});
