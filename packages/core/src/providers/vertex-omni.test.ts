import { describe, expect, test, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import type { ModelConfig } from '../models';
import type { SubmitRequest } from './types';
import { ImageReadError, ProviderHttpError } from './http';
import { createVertexOmniProvider, MAX_RESPONSE_BYTES, MAX_VIDEO_BYTES, SUBMIT_TIMEOUT_MS } from './vertex-omni';

const model: ModelConfig = { id: 'omni', provider: 'vertex', endpoint: 'gemini-omni-1.2-flash', label: 'Omni', ratios: ['16:9', '9:16'], durationsSec: [3, 4, 5, 10, 15], maxImages: 9, outputResolution: '720p', usdPerSecond: 0.0695, billedAmountField: null, sources: {} };
const request = (extra: Partial<SubmitRequest> = {}): SubmitRequest => ({ model, prompt: 'a cat', imageUrls: [], ratio: '9:16', durationSec: 5, ...extra });
const URL_BASE = 'https://aiplatform.googleapis.com/v1beta1/projects/test/locations/global/interactions';
function setup(...answers: (unknown | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return answer instanceof Response ? answer : Response.json(answer);
  }) as typeof fetch;
  const opts = { key: { client_email: '', private_key: '' }, project: 'test', fetch: f, token: async () => 'token', readImage: async (url: string) => ({ bytes: new Uint8Array([url === 'asset://end' ? 2 : 1]), contentType: 'image/png' }) };
  return { calls, opts, provider: createVertexOmniProvider(opts) };
}
const body = (calls: { init: RequestInit }[], i = 0) => JSON.parse(calls[i]!.init.body as string);
const video = (extra: Record<string, unknown> = {}) => ({ type: 'video', data: 'YQ==', mime_type: 'video/mp4', ...extra });
const done = (content: unknown[] = [video()]) => ({ id: 'abc', status: 'completed', steps: [{ type: 'user_input', content: [] }, { type: 'thought', summary: [] }, { type: 'model_output', content }] });

describe('Vertex Omni', () => {
  test('text-to-video: an asynchronous inline interaction with explicit settings and bearer auth', async () => {
    const { provider, calls } = setup({ id: 'abc', status: 'in_progress', object: 'interaction' });
    await provider.submit(request({ durationSec: 15 }));
    expect(calls[0]!.url).toBe(URL_BASE);
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: 'Bearer token', 'Content-Type': 'application/json' });
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
    expect(body(calls)).toEqual({
      model: 'gemini-omni-1.2-flash', background: true, input: [{ type: 'text', text: 'a cat' }],
      response_format: [{ type: 'video', delivery: 'inline', aspect_ratio: '9:16', resolution: '720p', duration: '15s' }],
      generation_config: { video_config: { task: 'text_to_video' } },
    });
  });
  test('a create waits SUBMIT_TIMEOUT_MS, longer than the 30 s of a poll, since a slow create still runs and bills', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const { provider } = setup({ id: 'abc', status: 'in_progress' }, { id: 'abc', status: 'in_progress' });
      const job = await provider.submit(request());
      expect(spy).toHaveBeenLastCalledWith(SUBMIT_TIMEOUT_MS);
      await provider.status({ ...job, model });
      expect(spy).toHaveBeenLastCalledWith(30_000);
      expect(SUBMIT_TIMEOUT_MS).toBeGreaterThan(30_000);
    } finally { spy.mockRestore(); }
  });
  test('image-to-video: one first frame, image tokens as plain words, WebP and the like passed as they are', async () => {
    const { provider, calls } = setup({ id: 'abc', status: 'in_progress' });
    await provider.submit(request({ imageUrls: ['asset://a'], prompt: 'show [Image1] spinning' }));
    expect(body(calls).input).toEqual([{ type: 'text', text: 'show image 1 spinning Use the image as the first frame.' }, { type: 'image', data: 'AQ==', mime_type: 'image/png' }]);
    expect(body(calls).generation_config).toEqual({ video_config: { task: 'image_to_video' } });
  });
  test('first and last frames: two images in order, image_to_video, 10 s at most', async () => {
    const { provider, calls } = setup({ id: 'abc', status: 'in_progress' });
    await provider.submit(request({ imageUrls: ['asset://a'], endImageUrl: 'asset://end', durationSec: 10 }));
    expect(body(calls).input).toEqual([
      { type: 'text', text: 'a cat Use the first image as the first frame and the second image as the last frame.' },
      { type: 'image', data: 'AQ==', mime_type: 'image/png' }, { type: 'image', data: 'Ag==', mime_type: 'image/png' },
    ]);
    expect(body(calls).generation_config).toEqual({ video_config: { task: 'image_to_video' } });
    expect(body(calls).response_format[0].duration).toBe('10s');
  });
  test('reference-to-video: several images, in order', async () => {
    const { provider, calls } = setup({ id: 'abc', status: 'in_progress' });
    await provider.submit(request({ imageUrls: ['asset://a', 'asset://b', 'asset://c'], ratio: '16:9' }));
    expect(body(calls).input.map((c: { type: string }) => c.type)).toEqual(['text', 'image', 'image', 'image']);
    expect(body(calls).input[0].text).toBe('a cat Use the image(s) as references to generate the video.');
    expect(body(calls).generation_config).toEqual({ video_config: { task: 'reference_to_video' } });
    expect(body(calls).response_format[0].aspect_ratio).toBe('16:9');
  });
  test('sends no audio field: sound is always on', async () => {
    const { provider, calls } = setup({ id: 'abc', status: 'in_progress' }, { id: 'abc', status: 'in_progress' });
    await provider.submit(request({ audio: true }));
    await provider.submit(request({ audio: false }));
    expect(JSON.stringify(body(calls, 0))).toBe(JSON.stringify(body(calls, 1)));
    expect(JSON.stringify(body(calls))).not.toMatch(/audio"/);
  });
  test('polls pending then done, decodes the inline video, and survives a restart and a price change at the submit-time estimate', async () => {
    const { provider, opts, calls } = setup({ id: 'abc', status: 'in_progress' }, { id: 'abc', status: 'in_progress' }, done());
    const job = await provider.submit(request());
    expect(await provider.status({ ...job, model })).toEqual({ state: 'running' });
    expect(calls[1]).toMatchObject({ url: `${URL_BASE}/abc` });
    expect(calls[1]!.init.method).toBe('GET');
    expect(calls[1]!.init.body).toBeUndefined();
    expect(await createVertexOmniProvider(opts).status({ ...job, model: { ...model, usdPerSecond: 99 } })).toEqual({ state: 'succeeded', outputUrl: 'data:video/mp4;base64,YQ==', costUsd: 0.3475, costSource: 'estimate' });
    expect(calls).toHaveLength(3);
    expect(await provider.cancel({ ...job, model })).toEqual({ supported: false });
  });
  test('the estimate is seconds times usd per second', async () => {
    const { provider } = setup({ id: 'abc', status: 'in_progress' }, done());
    const job = await provider.submit(request({ durationSec: 15 }));
    expect(await provider.status({ ...job, model })).toMatchObject({ state: 'succeeded', costUsd: 1.0425 });
  });
  test.each([
    { ratio: 'auto' }, { ratio: '1:1' }, { durationSec: 2 }, { durationSec: 16 }, { durationSec: 4.5 },
    { imageUrls: ['asset://a'], endImageUrl: 'asset://end', durationSec: 11 }, { endImageUrl: 'asset://end' }, { imageUrls: ['a', 'b'], endImageUrl: 'asset://end' },
    { imageUrls: Array(11).fill('asset://a') }, { audioUrls: ['asset://audio'] }, { model: { ...model, endpoint: 'other' } }, { model: { ...model, outputResolution: '1080p' } },
  ] as Partial<SubmitRequest>[])('rejects unsupported input before HTTP %j', async (extra) => {
    const { provider, calls } = setup();
    await expect(provider.submit(request(extra))).rejects.toBeInstanceOf(ImageReadError);
    expect(calls).toHaveLength(0);
  });
  test('refuses an unreadable, empty, oversized or unsupported image before HTTP, and a missing reader', async () => {
    const { opts, calls } = setup();
    const read = (bytes: Uint8Array, contentType: string) => createVertexOmniProvider({ ...opts, readImage: async () => ({ bytes, contentType }) }).submit(request({ imageUrls: ['a'] }));
    await expect(read(new Uint8Array(0), 'image/png')).rejects.toBeInstanceOf(ImageReadError);
    await expect(read(new Uint8Array(20 * 1024 * 1024 + 1), 'image/png')).rejects.toBeInstanceOf(ImageReadError);
    await expect(read(new Uint8Array([1]), 'image/gif')).rejects.toBeInstanceOf(ImageReadError);
    await expect(createVertexOmniProvider({ ...opts, readImage: async () => { throw new Error('missing asset'); } }).submit(request({ imageUrls: ['a'] }))).rejects.toThrow('missing asset');
    await expect(createVertexOmniProvider({ ...opts, readImage: undefined }).submit(request({ imageUrls: ['a'] }))).rejects.toBeInstanceOf(ImageReadError);
    expect(calls).toHaveLength(0);
  });
  test('marks only provably pre-submit failures as releasable; an HTTP error keeps its status and body for the funding check', async () => {
    const { provider, calls } = setup(new Error('network'), new Response('{"error":{"message":"billing disabled"}}', { status: 403 }));
    await expect(provider.submit(request({ model: { ...model, usdPerSecond: NaN } }))).rejects.toBeInstanceOf(ImageReadError);
    expect(calls).toHaveLength(0);
    await expect(provider.submit(request())).rejects.not.toBeInstanceOf(ImageReadError);
    const err = await provider.submit(request()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderHttpError);
    expect(err).toMatchObject({ status: 403, message: 'Vertex Omni: HTTP 403' });
    expect((err as ProviderHttpError).body).toContain('billing disabled');
  });
  test.each([
    { id: 'abc', status: 'failed', errors: [{ code: 'x', message: 'blocked by safety' }] },
    { id: 'abc', status: 'cancelled' },
    { id: 'abc', status: 'incomplete' },
    { id: 'abc', status: 'requires_action' },
    { id: 'abc' },
    done([]),
    done([video(), video()]),
    done([video({ data: undefined, uri: 'gs://bucket/x.mp4' })]),
    done([video({ mime_type: 'video/webm' })]),
    done([video({ data: '!!!!' })]),
    done([video({ data: 'YR==' })]),
    { id: 'abc', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'no video' }] }] },
  ])('safely fails an invalid or unfinished outcome %j', async (answer) => {
    const { provider } = setup({ id: 'abc', status: 'in_progress' }, answer);
    const job = await provider.submit(request());
    expect(await provider.status({ ...job, model })).toMatchObject({ state: 'failed', costUsd: 0.3475, costSource: 'estimate' });
  });
  test('carries the first error message into the failure, cut short', async () => {
    const { provider } = setup({ id: 'abc', status: 'in_progress' }, { id: 'abc', status: 'failed', errors: [{ message: 'z'.repeat(500) }] });
    const job = await provider.submit(request());
    const out = await provider.status({ ...job, model });
    expect(out).toMatchObject({ state: 'failed', error: `Vertex Omni interaction failed: ${'z'.repeat(200)}` });
  });
  test('rejects a wrong or foreign interaction identity', async () => {
    const { provider, calls } = setup({ id: '../evil', status: 'in_progress' }, { id: 'abc', status: 'in_progress' }, { id: 'other', status: 'completed' });
    await expect(provider.submit(request())).rejects.toThrow('interaction');
    const job = await provider.submit(request());
    await expect(provider.status({ model, providerJobId: 'https://attacker/' })).rejects.toThrow('job');
    await expect(provider.status({ model, providerJobId: `vertex-omni-v1:${Buffer.from(JSON.stringify({ id: '../x', costUsd: 1 })).toString('base64url')}` })).rejects.toThrow('job');
    await expect(provider.status({ model: { ...model, endpoint: 'veo' }, providerJobId: job.providerJobId })).rejects.toThrow('job');
    await expect(provider.status({ ...job, model })).rejects.toThrow('interaction');
    expect(calls).toHaveLength(3);
  });
  test('caps a streamed response before parsing JSON', async () => {
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES + 1)); controller.close(); } }));
    const { provider } = setup(response);
    await expect(provider.submit(request())).rejects.toThrow('exceeds');
  });
  test('rejects an oversized video before decoding', async () => {
    const encoded = 'A'.repeat(4 * Math.ceil(MAX_VIDEO_BYTES / 3));
    const { provider } = setup({ id: 'abc', status: 'in_progress' }, done([video({ data: encoded })]));
    const job = await provider.submit(request());
    expect(await provider.status({ ...job, model })).toMatchObject({ state: 'failed', error: 'Vertex Omni video exceeds inline limit' });
  });
  test('propagates transient polling errors without retry and rejects malformed JSON', async () => {
    const { provider, calls } = setup({ id: 'abc', status: 'in_progress' }, new Response('busy', { status: 503 }), done(), new Response('{'));
    const job = await provider.submit(request());
    await expect(provider.status({ ...job, model })).rejects.toThrow('503');
    expect(await provider.status({ ...job, model })).toMatchObject({ state: 'succeeded' });
    await expect(provider.submit(request())).rejects.toThrow();
    expect(calls).toHaveLength(4);
  });
  test.each(['fetch', 'body', 'oversized'])('bounds real service-account token %s before the interaction', async (kind) => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const key = { client_email: 'sa@test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
    let calls = 0;
    let aborted = false;
    const f = (async (_url: string, init: RequestInit) => {
      calls++;
      if (kind === 'oversized') return new Response('x'.repeat(64 * 1024 + 1));
      const signal = init.signal!;
      if (kind === 'fetch') return new Promise<Response>((_resolve, reject) => { signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true }); });
      return new Response(new ReadableStream({ start(controller) { signal.addEventListener('abort', () => { aborted = true; controller.error(signal.reason); }, { once: true }); } }));
    }) as typeof fetch;
    const { opts } = setup();
    const provider = createVertexOmniProvider({ ...opts, key, fetch: f, token: undefined });
    const realTimeout = AbortSignal.timeout;
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(10));
    try {
      await expect(provider.submit(request())).rejects.toThrow(kind === 'oversized' ? 'exceeds' : /abort|timeout/i);
      expect(calls).toBe(1);
      if (kind !== 'oversized') expect(aborted).toBe(true);
    } finally { timeoutSpy.mockRestore(); }
  });
  test('rejects an invalid project', () => {
    expect(() => createVertexOmniProvider({ key: { client_email: '', private_key: '' }, project: '../x' })).toThrow('project');
  });
});
