import { describe, expect, test, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import type { ModelConfig } from '../models';
import type { SubmitRequest } from './types';
import { ImageReadError } from './http';
import { createVertexVideoProvider, MAX_RESPONSE_BYTES, MAX_VIDEO_BYTES } from './vertex-video';

const model: ModelConfig = { id: 'veo', provider: 'vertex', endpoint: 'veo-3.1-generate-001', label: 'Veo', ratios: ['16:9', '9:16'], durationsSec: [4, 6, 8], maxImages: 1, outputResolution: '720p', usdPerSecond: 0.4, billedAmountField: null, sources: {} };
const name = 'projects/test/locations/us-central1/publishers/google/models/veo-3.1-generate-001/operations/abc';
const request = (extra: Partial<SubmitRequest> = {}): SubmitRequest => ({ model, prompt: 'a cat', imageUrls: [], ratio: '16:9', durationSec: 4, ...extra });
function setup(...answers: (unknown | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return answer instanceof Response ? answer : Response.json(answer);
  }) as typeof fetch;
  const opts = { key: { client_email: '', private_key: '' }, project: 'test', region: 'us-central1' as const, fetch: f, token: async () => 'token', readImage: async () => ({ bytes: new Uint8Array([1]), contentType: 'image/png' }) };
  return { calls, opts, provider: createVertexVideoProvider(opts) };
}
const success = { name, done: true, response: { videos: [{ mimeType: 'video/mp4', bytesBase64Encoded: 'YQ==' }] } };

describe('Vertex Veo', () => {
  test.each(['fetch', 'body', 'oversized'])('bounds real service-account token %s before prediction', async (kind) => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const key = { client_email: 'sa@test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
    let calls = 0;
    let aborted = false;
    const f = (async (_url: string, init: RequestInit) => {
      calls++;
      if (kind === 'oversized') return new Response('x'.repeat(64 * 1024 + 1));
      if (!init.signal) throw new Error('missing token abort signal');
      const signal = init.signal;
      if (kind === 'fetch') return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true });
      });
      return new Response(new ReadableStream({ start(controller) {
        signal.addEventListener('abort', () => { aborted = true; controller.error(signal.reason); }, { once: true });
      } }));
    }) as typeof fetch;
    const { opts } = setup();
    const provider = createVertexVideoProvider({ ...opts, key, fetch: f, token: undefined });
    const realTimeout = AbortSignal.timeout;
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(10));
    try {
      await expect(provider.submit(request())).rejects.toThrow(kind === 'oversized' ? 'token response exceeds' : /abort|timeout/i);
      expect(calls).toBe(1);
      if (kind !== 'oversized') expect(aborted).toBe(true);
    } finally { timeoutSpy.mockRestore(); }
  });
  test('submits once with explicit settings and bearer auth; polls once and survives restart/rate changes', async () => {
    const { provider, opts, calls } = setup({ name }, { name, done: false }, success);
    const job = await provider.submit(request());
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ instances: [{ prompt: 'a cat' }], parameters: { aspectRatio: '16:9', durationSeconds: 4, resolution: '720p', sampleCount: 1, generateAudio: false } });
    expect(calls[0]!.url).toBe(`https://us-central1-aiplatform.googleapis.com/v1/${name.split('/operations/')[0]}:predictLongRunning`);
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: 'Bearer token' });
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
    expect(await provider.status({ ...job, model })).toEqual({ state: 'running' });
    expect(await createVertexVideoProvider(opts).status({ ...job, model: { ...model, usdPerSecond: 99 } })).toEqual({ state: 'succeeded', outputUrl: 'data:video/mp4;base64,YQ==', costUsd: 1.6, costSource: 'estimate' });
    expect(JSON.parse(calls[2]!.init.body as string)).toEqual({ operationName: name });
    expect(calls).toHaveLength(3);
    expect(await provider.cancel({ ...job, model })).toEqual({ supported: false });
  });
  test('inlines one PNG start image and explicit audio', async () => {
    const { provider, calls } = setup({ name });
    await provider.submit(request({ imageUrls: ['asset://a'], audio: true }));
    expect(JSON.parse(calls[0]!.init.body as string).instances[0].image).toEqual({ mimeType: 'image/png', bytesBase64Encoded: 'AQ==' });
    expect(JSON.parse(calls[0]!.init.body as string).parameters.generateAudio).toBe(true);
  });
  test.each([
    { ratio: 'auto' }, { durationSec: 5 }, { endImageUrl: 'asset://end' }, { audioUrls: ['asset://audio'] }, { imageUrls: ['a', 'b'] }, { model: { ...model, endpoint: 'other' } }, { model: { ...model, outputResolution: '1080p' } },
  ] as Partial<SubmitRequest>[])('rejects unsupported input before HTTP %j', async (extra) => {
    const { provider, calls } = setup();
    await expect(provider.submit(request(extra))).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
  test('marks only provably pre-submit failures as releasable', async () => {
    const { provider, opts, calls } = setup(new Error('prediction failed'));
    await expect(provider.submit(request({ durationSec: 5 }))).rejects.toBeInstanceOf(ImageReadError);
    await expect(provider.submit(request({ model: { ...model, usdPerSecond: NaN } }))).rejects.toBeInstanceOf(ImageReadError);
    const unreadable = createVertexVideoProvider({ ...opts, readImage: async () => { throw new Error('missing asset'); } });
    await expect(unreadable.submit(request({ imageUrls: ['asset://missing'] }))).rejects.toBeInstanceOf(ImageReadError);
    expect(calls).toHaveLength(0);
    await expect(provider.submit(request())).rejects.not.toBeInstanceOf(ImageReadError);
    expect(calls).toHaveLength(1);
  });
  test('rejects WebP before prediction', async () => {
    const { opts, calls } = setup();
    const provider = createVertexVideoProvider({ ...opts, readImage: async () => ({ bytes: new Uint8Array([1]), contentType: 'image/webp' }) });
    await expect(provider.submit(request({ imageUrls: ['a'] }))).rejects.toThrow('JPEG or PNG');
    expect(calls).toHaveLength(0);
  });
  test.each([
    { done: true, error: { message: 'private detail' } },
    { done: true, response: { raiMediaFilteredCount: 1 } },
    { done: true, response: { videos: [] } },
    { done: true, response: { videos: [{}, {}] } },
    { done: true, response: { videos: [{ mimeType: 'video/mp4', gcsUri: 'gs://bucket/x' }] } },
    { done: true, response: { videos: [{ mimeType: 'video/mp4', bytesBase64Encoded: '!!!!' }] } },
    { done: true, response: { videos: [{ mimeType: 'video/mp4', bytesBase64Encoded: 'YR==' }] } },
  ])('safely fails invalid output %j', async (answer) => {
    const { provider } = setup({ name }, answer);
    const job = await provider.submit(request());
    expect(await provider.status({ ...job, model })).toMatchObject({ state: 'failed', costUsd: 1.6, costSource: 'estimate' });
  });
  test('rejects wrong operation identity without HTTP', async () => {
    const { provider, calls } = setup({ name: name.replace('projects/test', 'projects/other') });
    await expect(provider.submit(request())).rejects.toThrow('operation');
    await expect(provider.status({ model, providerJobId: 'https://attacker/' })).rejects.toThrow('job');
    expect(calls).toHaveLength(1);
  });
  test('propagates transient polling and submission errors without retry', async () => {
    const { provider, calls } = setup(new Error('network'), { name }, new Response('busy', { status: 503 }), success);
    await expect(provider.submit(request())).rejects.toThrow('network');
    expect(calls).toHaveLength(1);
    const job = await provider.submit(request());
    await expect(provider.status({ ...job, model })).rejects.toThrow('503');
    expect(await provider.status({ ...job, model })).toMatchObject({ state: 'succeeded' });
    expect(calls).toHaveLength(4);
  });
  test('caps streamed response before parsing JSON', async () => {
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES + 1)); controller.close(); } }));
    const { provider } = setup(response);
    await expect(provider.submit(request())).rejects.toThrow('response exceeds');
  });
  test('rejects an oversized video before decoding', async () => {
    const encoded = 'A'.repeat(4 * Math.ceil(MAX_VIDEO_BYTES / 3));
    const { provider } = setup({ name }, { done: true, response: { videos: [{ mimeType: 'video/mp4', bytesBase64Encoded: encoded }] } });
    const job = await provider.submit(request());
    expect(await provider.status({ ...job, model })).toMatchObject({ state: 'failed', error: 'Vertex Veo video exceeds inline limit' });
  });
  test('rejects a mismatching poll operation', async () => {
    const { provider } = setup({ name }, { ...success, name: name.replace('/abc', '/other') });
    const job = await provider.submit(request());
    await expect(provider.status({ ...job, model })).rejects.toThrow('operation');
  });
  test('rejects malformed JSON', async () => {
    const { provider } = setup(new Response('{'));
    await expect(provider.submit(request())).rejects.toThrow();
  });
});
