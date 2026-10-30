// Hand-written fixtures until B.5a replaces them with recorded real responses. No test reads FAL_KEY or REPLICATE_API_TOKEN.
import { describe, expect, test } from 'vitest';
import { AUDIO_USD_PER_SECOND, BAKEOFF_MODELS } from '../models';
import { createFalProvider, VIDEO_BODIES, videoInputs } from './fal';
import { ImageReadError, isFundingRefusal, MAX_INLINE_CHARS, ProviderHttpError, unpackJobId } from './http';
import { createMockVideoProvider, MOCK_FAIL } from './mock';
import { createReplicateProvider, REPLICATE_BODIES } from './replicate';
import type { ProviderJob, SubmitRequest } from './types';

const [kling, seedance] = BAKEOFF_MODELS as [(typeof BAKEOFF_MODELS)[0], (typeof BAKEOFF_MODELS)[0]];
const base: Omit<SubmitRequest, 'model'> = { prompt: 'a bottle on a table', imageUrls: ['https://img/1.jpg', 'https://img/2.jpg'], ratio: '9:16', durationSec: 5 };

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown; signal?: AbortSignal | null };

const readImage = async (url: string) => {
  if (url.includes('missing')) throw new Error('asset not found');
  return { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' };
};
const DATA_URL = 'data:image/png;base64,AQID';
/** The text-to-video endpoints, which stand in for an image endpoint and are never a row's own. */
const TWINS = new Set(Object.values(VIDEO_BODIES).flatMap((b) => (b.text ? [b.text] : [])));

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

  test('each other video endpoint gets its own body: image field, duration type, resolution and how the prompt names images', async () => {
    const body = async (endpoint: string, prompt = 'put [Image1] on [Image2]', outputResolution = kling.outputResolution) => {
      const { fn, calls } = fakeFetch([200, { request_id: 'r' }]);
      await createFalProvider({ apiKey: 'k', fetch: fn }).submit({ ...req, prompt, model: { ...kling, endpoint, outputResolution } });
      expect(calls[0]!.url).toBe(`https://queue.fal.run/${endpoint}`);
      return calls[0]!.body;
    };
    expect(await body('bytedance/seedance-2.5/us/reference-to-video')).toEqual({ prompt: 'put @Image1 on @Image2', image_urls: ['https://img/1.jpg', 'https://img/2.jpg'], aspect_ratio: '9:16', duration: '5', resolution: '720p', generate_audio: false });
    expect(await body('fal-ai/kling-video/v3/pro/image-to-video')).toEqual({ prompt: 'put image 1 on image 2', start_image_url: 'https://img/1.jpg', duration: '5', generate_audio: false });
    expect(await body('google/gemini-omni-flash/v1.1/image-to-video')).toEqual({ prompt: 'put image 1 on image 2', image_url: 'https://img/1.jpg', aspect_ratio: '9:16', duration: 5, resolution: '720p' });
    expect(await body('fal-ai/veo3.1/image-to-video')).toMatchObject({ duration: '5s', generate_audio: false });
    expect(await body('blackforestlabs/flux-3/keyframes-to-video')).toMatchObject({ keyframes: [{ image_url: 'https://img/1.jpg', frame_index: 0 }], duration: 5, resolution: '1080p' });
    expect(await body('blackforestlabs/flux-3/image-to-video')).toMatchObject({ resolution: '1080p' }); // 720p comes back 704 px wide
    for (const endpoint of ['bytedance/seedance-2.5/us/image-to-video', 'blackforestlabs/flux-3/keyframes-to-video']) {
      expect(await body(endpoint, 'a slow push-in')).toMatchObject({ prompt: 'a slow push-in One continuous shot that starts on the input image: keep its scene and background, with no cuts.' });
    }
    expect(((await body('blackforestlabs/flux-3/image-to-video', 'a slow push-in')) as { prompt: string }).prompt).toBe('a slow push-in'); // only the two that cut
    expect(await body('fal-ai/bytedance/seedance/v1/pro/image-to-video')).toMatchObject({ resolution: '1080p' });
    expect(await body('minimax/h3-max/reference-to-video', undefined, '768p')).toEqual({ prompt: 'put Image 1 on Image 2', reference_image_urls: ['https://img/1.jpg', 'https://img/2.jpg'], aspect_ratio: '9:16', duration: 5, resolution: '768P', prompt_expansion_mode: 'balanced' });
    // Each Minimax row asks for its own resolution: the 480P and 1080P rows share the endpoint at their own price.
    expect(await body('minimax/h3-max/reference-to-video', undefined, '1080p')).toMatchObject({ resolution: '1080P' });
    expect(await body('minimax/h3-max/image-to-video', undefined, '480p')).toMatchObject({ resolution: '480P' });
    expect(await body('fal-ai/minimax/hailuo-2.3/pro/image-to-video')).toEqual({ prompt: 'put image 1 on image 2', image_url: 'https://img/1.jpg' });
  });

  test('an end frame goes in each end-frame endpoint’s own field, read like the inputs (cropped where they are); elsewhere it is refused before any call', async () => {
    const withEnd = Object.keys(VIDEO_BODIES).filter((e) => videoInputs(e).endFrame);
    // The endpoints whose schema has end_image_url or tail_image_url (read 2026-10-30).
    expect(withEnd.sort()).toEqual([
      'bytedance/seedance-2.0/us/image-to-video', 'bytedance/seedance-2.5/us/image-to-video', 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video', 'fal-ai/bytedance/seedance/v1/pro/image-to-video',
      'fal-ai/kling-video/o3/pro/reference-to-video', 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', 'fal-ai/kling-video/v2.6/pro/image-to-video', 'fal-ai/kling-video/v3/pro/image-to-video',
      'fal-ai/wan/v2.7/image-to-video', 'google/gemini-omni-flash/v1.1/image-to-video', 'minimax/h3-max/image-to-video', 'minimax/h3-max/reference-to-video',
    ]);
    const crops: Record<string, (string | undefined)[]> = {};
    const { fn, calls } = fakeFetch(...withEnd.map(() => [200, { request_id: 'r' }] as [number, unknown]));
    for (const endpoint of withEnd) {
      const read = async (url: string, opts?: { ratio?: string }) => ((crops[endpoint] ??= []).push(`${url} ${opts?.ratio ?? 'as is'}`), readImage(url));
      await createFalProvider({ apiKey: 'k', fetch: fn, readImage: read }).submit({ ...req, imageUrls: ['asset://start'], endImageUrl: 'asset://end', model: { ...kling, endpoint } });
    }
    withEnd.forEach((endpoint, i) => expect(calls[i]!.body).toMatchObject({ [endpoint.includes('v2.5-turbo') ? 'tail_image_url' : 'end_image_url']: DATA_URL }));
    expect(crops['fal-ai/kling-video/v3/pro/image-to-video']).toEqual(['asset://start 9:16', 'asset://end 9:16']); // both frames in the chosen ratio
    expect(crops['fal-ai/kling-video/o3/pro/reference-to-video']).toEqual(['asset://start as is', 'asset://end as is']);
    expect(calls).toHaveLength(withEnd.length);
    await expect(createFalProvider({ apiKey: 'k', fetch: fn }).submit({ ...req, endImageUrl: 'https://img/end.jpg', model: { ...kling, endpoint: 'fal-ai/kling-video/o1/reference-to-video' } })).rejects.toThrow(ImageReadError);
    expect(calls).toHaveLength(withEnd.length);
  });

  test('an endpoint without a request builder is refused before any call', async () => {
    const { fn, calls } = fakeFetch();
    await expect(createFalProvider({ apiKey: 'k', fetch: fn }).submit({ ...req, model: { ...kling, endpoint: 'fal-ai/unknown' } })).rejects.toThrow(ImageReadError);
    expect(calls).toHaveLength(0);
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

  test('a job with audio on asks every endpoint with an audio price for native audio; the others have no switch to send', async () => {
    // The uploading endpoints (Motion Control) put their inputs in fal storage first and have no audio switch; a text twin is priced as its image endpoint (next test).
    const endpoints = Object.keys(VIDEO_BODIES).filter((e) => !VIDEO_BODIES[e]!.upload && !TWINS.has(e));
    const { fn, calls } = fakeFetch(...[...endpoints, 'off'].map(() => [200, { request_id: 'r' }] as [number, unknown]));
    const provider = createFalProvider({ apiKey: 'k', fetch: fn });
    for (const endpoint of endpoints) await provider.submit({ ...req, audio: true, model: { ...kling, endpoint } });
    const sent = calls.map((c) => (c.body as { generate_audio?: boolean }).generate_audio);
    expect(endpoints.filter((_e, i) => sent[i] === true).sort()).toEqual(Object.keys(AUDIO_USD_PER_SECOND).filter((e) => e !== 'mock' && !Object.hasOwn(REPLICATE_BODIES, e)).sort());
    expect(sent).not.toContain(false);
    await provider.submit({ ...req, model: { ...kling, endpoint: 'bytedance/seedance-2.5/us/reference-to-video' } });
    expect(calls.at(-1)!.body).toMatchObject({ generate_audio: false }); // audio off unless the job asks
  });

  test('a Run with no image goes to the text twin of its app, with the ratio, the duration and the image endpoint’s resolution and audio switch', async () => {
    const withText = Object.keys(VIDEO_BODIES).filter((e) => videoInputs(e).textOnly);
    // The twins whose page price equals the row's (read 2026-10-30, see VideoBody.text).
    expect(Object.fromEntries(withText.map((e) => [e, VIDEO_BODIES[e]!.text]))).toEqual({
      'fal-ai/kling-video/o3/pro/reference-to-video': 'fal-ai/kling-video/o3/pro/text-to-video',
      'fal-ai/kling-video/v3/pro/image-to-video': 'fal-ai/kling-video/v3/pro/text-to-video',
      'fal-ai/kling-video/v2.6/pro/image-to-video': 'fal-ai/kling-video/v2.6/pro/text-to-video',
      'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
      'bytedance/seedance-2.5/us/reference-to-video': 'bytedance/seedance-2.5/us/text-to-video',
      'bytedance/seedance-2.5/us/image-to-video': 'bytedance/seedance-2.5/us/text-to-video',
      'bytedance/seedance-2.0/us/reference-to-video': 'bytedance/seedance-2.0/us/text-to-video',
      'fal-ai/bytedance/seedance/v1.5/pro/image-to-video': 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video',
      'fal-ai/bytedance/seedance/v1/pro/image-to-video': 'fal-ai/bytedance/seedance/v1/pro/text-to-video',
      'blackforestlabs/flux-3/keyframes-to-video': 'blackforestlabs/flux-3/text-to-video',
      'blackforestlabs/flux-3/image-to-video': 'blackforestlabs/flux-3/text-to-video',
      'google/gemini-omni-flash/v1.1/reference-to-video': 'google/gemini-omni-flash/v1.1/text-to-video',
      'google/gemini-omni-flash/v1.1/image-to-video': 'google/gemini-omni-flash/v1.1/text-to-video',
      'fal-ai/veo3.1/image-to-video': 'fal-ai/veo3.1',
      'xai/grok-imagine-video/v1.5/image-to-video': 'xai/grok-imagine-video/v1.5/text-to-video',
      'fal-ai/wan/v2.7/reference-to-video': 'fal-ai/wan/v2.7/text-to-video',
      'fal-ai/wan/v2.7/image-to-video': 'fal-ai/wan/v2.7/text-to-video',
      'minimax/h3-max/reference-to-video': 'minimax/h3-max/text-to-video',
      'minimax/h3-max/image-to-video': 'minimax/h3-max/text-to-video',
    });
    const app = (e: string) => e.split('/').slice(0, 2).join('/');
    const { fn, calls } = fakeFetch(...withText.flatMap(() => [[200, { request_id: 'r' }], [200, { request_id: 'r' }]] as [number, unknown][]));
    const provider = createFalProvider({ apiKey: 'k', fetch: fn });
    for (const [i, endpoint] of withText.entries()) {
      const text = VIDEO_BODIES[endpoint]!.text!;
      expect(app(text)).toBe(app(endpoint)); // so status() finds the request under the row's own endpoint
      await provider.submit({ ...req, prompt: 'a red bottle on a beach', imageUrls: [], audio: true, model: { ...kling, endpoint, outputResolution: '768p' } });
      await provider.submit({ ...req, audio: true, model: { ...kling, endpoint, outputResolution: '768p' } });
      const [words, image] = [calls[2 * i]!, calls[2 * i + 1]!] as [Call, Call];
      expect(words.url).toBe(`https://queue.fal.run/${text}`);
      const w = words.body as Record<string, unknown>;
      const im = image.body as Record<string, unknown>;
      expect(w).toMatchObject({ prompt: 'a red bottle on a beach', aspect_ratio: '9:16' });
      expect(Object.keys(w).some((k) => /image|keyframes/.test(k))).toBe(false);
      expect([w.duration, w.resolution, w.generate_audio]).toEqual([im.duration, im.resolution, im.generate_audio]);
    }
    expect(calls).toHaveLength(2 * withText.length);
  });

  test('a Run with no image on a model without a text twin is refused before any call', async () => {
    const { fn, calls } = fakeFetch();
    for (const endpoint of ['bytedance/seedance-2.0/us/image-to-video', 'fal-ai/kling-video/o1/reference-to-video']) {
      await expect(createFalProvider({ apiKey: 'k', fetch: fn }).submit({ ...req, imageUrls: [], model: { ...kling, endpoint } })).rejects.toThrow('needs an input image');
    }
    expect(calls).toHaveLength(0);
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

/** fal's storage and queue, answered by URL: each initiate gets its own file URL, each PUT succeeds, the submit returns a request id. */
function falFake(put = 200) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  let n = 0;
  const fn = (async (url: string, init: RequestInit = {}) => {
    const json = typeof init.body === 'string';
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: json ? JSON.parse(init.body as string) : init.body });
    if (url.startsWith('https://rest.fal.ai/storage/upload/initiate')) {
      n += 1;
      return Response.json({ upload_url: `https://upload.test/${n}`, file_url: `https://v3b.fal.media/files/${(JSON.parse(init.body as string) as { content_type: string }).content_type.replace('/', '-')}` });
    }
    if (url.startsWith('https://upload.test/')) return new Response('', { status: put });
    return Response.json({ request_id: 'm1' });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('fal reference audio', () => {
  const read = async (url: string) => (url.includes('clip') ? { bytes: new Uint8Array([0x49, 0x44, 0x33]), contentType: url.endsWith('wav') ? 'audio/wav' : 'audio/mpeg' } : readImage(url));

  test('the endpoints that take it, with the count and total seconds their schemas allow (read 2026-10-30)', () => {
    const takes = Object.keys(VIDEO_BODIES).filter((e) => videoInputs(e).audioClips).map((e) => [e, videoInputs(e).audioClips]);
    expect(takes).toEqual([
      ['bytedance/seedance-2.5/us/reference-to-video', { max: 10, seconds: 30 }],
      ['bytedance/seedance-2.0/us/reference-to-video', { max: 3, seconds: 15 }],
      ['minimax/h3-max/reference-to-video', { max: 3, seconds: 15 }],
    ]);
    expect(videoInputs('mock')).toEqual({ endFrame: false, textOnly: false, audioClips: null });
  });

  test('uploads the clips to fal storage as .mp3 or .wav and sends their URLs in the endpoint’s own field; the images stay inline', async () => {
    for (const [endpoint, field] of [['bytedance/seedance-2.5/us/reference-to-video', 'audio_urls'], ['minimax/h3-max/reference-to-video', 'reference_audio_urls']] as const) {
      const { fn, calls } = falFake();
      await createFalProvider({ apiKey: 'k', fetch: fn, readImage: read }).submit({ ...base, imageUrls: ['asset://img'], audioUrls: ['asset://clip1', 'asset://clip2.wav'], model: { ...kling, endpoint, outputResolution: '768p' } });
      const initiates = calls.filter((c) => c.url.includes('/storage/upload/initiate')).map((c) => c.body);
      expect(initiates).toEqual([{ content_type: 'audio/mpeg', file_name: 'input.mp3' }, { content_type: 'audio/wav', file_name: 'input.wav' }]);
      const submit = calls.at(-1)!;
      expect(submit.url).toBe(`https://queue.fal.run/${endpoint}`);
      expect((submit.body as Record<string, unknown>)[field]).toEqual(['https://v3b.fal.media/files/audio-mpeg', 'https://v3b.fal.media/files/audio-wav']);
      expect(JSON.stringify(submit.body)).toContain(DATA_URL);
    }
  });

  test('a model without reference audio, or a failed upload, submits nothing', async () => {
    const none = falFake();
    await expect(createFalProvider({ apiKey: 'k', fetch: none.fn, readImage: read }).submit({ ...base, audioUrls: ['asset://clip1'], model: kling })).rejects.toThrow(ImageReadError);
    expect(none.calls).toHaveLength(0);
    const broken = falFake(500);
    await expect(createFalProvider({ apiKey: 'k', fetch: broken.fn, readImage: read }).submit({ ...base, audioUrls: ['asset://clip1'], model: { ...kling, endpoint: 'bytedance/seedance-2.0/us/reference-to-video' } })).rejects.toThrow(ImageReadError);
    expect(broken.calls.some((c) => c.url.startsWith('https://queue.fal.run'))).toBe(false);
  });
});

describe('fal Motion Control', () => {
  const motionModel = { ...kling, id: 'kling-v3-motion-pro', endpoint: 'fal-ai/kling-video/v3/pro/motion-control' };
  const inputs = ['asset://img', 'asset://vid'];
  const read = async (url: string) => (url.endsWith('vid') ? { bytes: new Uint8Array([9, 9]), contentType: 'video/mp4' } : { bytes: new Uint8Array([1]), contentType: 'image/png' });

  test('uploads the image and the video to fal storage, then sends their URLs with orientation video and no sound', async () => {
    const { fn, calls } = falFake();
    const out = await createFalProvider({ apiKey: 'k', fetch: fn, readImage: read }).submit({ ...base, model: motionModel, prompt: '', imageUrls: inputs, ratio: 'auto', durationSec: 7 });
    expect(out.providerJobId).toBe('7:m1');
    const initiates = calls.filter((c) => c.url.includes('/storage/upload/initiate'));
    expect(initiates.map((c) => (c.body as { content_type: string }).content_type).sort()).toEqual(['image/png', 'video/mp4']);
    expect(initiates[0]!.headers.Authorization).toBe('Key k');
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(2);
    const submit = calls.at(-1)!;
    expect(submit.url).toBe('https://queue.fal.run/fal-ai/kling-video/v3/pro/motion-control');
    expect(submit.body).toEqual({ image_url: 'https://v3b.fal.media/files/image-png', video_url: 'https://v3b.fal.media/files/video-mp4', character_orientation: 'video', keep_original_sound: false });
  });

  test('more than 4 images go through fal storage on any endpoint, since 9 shrunk inputs inlined would pass the inline limit; 4 stay inlined', async () => {
    const ref = { ...kling, id: 'minimax-h3-max-reference', endpoint: 'minimax/h3-max/reference-to-video', outputResolution: '768p' };
    const nine = Array.from({ length: 9 }, (_, i) => `asset://img${i}`);
    const many = falFake();
    await createFalProvider({ apiKey: 'k', fetch: many.fn, readImage: read }).submit({ ...base, model: ref, imageUrls: nine });
    expect(many.calls.filter((c) => c.url.includes('/storage/upload/initiate'))).toHaveLength(9);
    expect((many.calls.at(-1)!.body as { reference_image_urls: string[] }).reference_image_urls).toEqual(Array(9).fill('https://v3b.fal.media/files/image-png'));
    const four = falFake();
    await createFalProvider({ apiKey: 'k', fetch: four.fn, readImage: read }).submit({ ...base, model: ref, imageUrls: nine.slice(0, 4) });
    expect(four.calls.some((c) => c.url.includes('/storage/upload/initiate'))).toBe(false);
    expect((four.calls.at(-1)!.body as { reference_image_urls: string[] }).reference_image_urls.every((u) => u.startsWith('data:image/png;base64,'))).toBe(true);
  });

  test('a written prompt is sent; a failed upload or a missing video submits nothing and is an ImageReadError', async () => {
    const ok = falFake();
    await createFalProvider({ apiKey: 'k', fetch: ok.fn, readImage: read }).submit({ ...base, model: motionModel, prompt: 'a dancer', imageUrls: inputs, ratio: 'auto', durationSec: 5 });
    expect(ok.calls.at(-1)!.body).toMatchObject({ prompt: 'a dancer' });
    const broken = falFake(500);
    await expect(createFalProvider({ apiKey: 'k', fetch: broken.fn, readImage: read }).submit({ ...base, model: motionModel, imageUrls: inputs, ratio: 'auto' })).rejects.toThrow(ImageReadError);
    expect(broken.calls.some((c) => c.url.startsWith('https://queue.fal.run'))).toBe(false);
    const one = falFake();
    await expect(createFalProvider({ apiKey: 'k', fetch: one.fn, readImage: read }).submit({ ...base, model: motionModel, imageUrls: ['asset://img'], ratio: 'auto' })).rejects.toThrow(ImageReadError);
    expect(one.calls.some((c) => c.url.startsWith('https://queue.fal.run'))).toBe(false);
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

  test('Veo 3.1 sends the start frame as image, the end frame as last_frame, the row resolution and audio as the job asks; with no image, the prompt alone', async () => {
    const veo = { ...seedance, endpoint: 'google/veo-3.1', outputResolution: '720p' };
    const { fn, calls } = fakeFetch([201, { id: 'v1' }], [201, { id: 'v2' }], [201, { id: 'v3' }]);
    const p = createReplicateProvider({ apiToken: 't', fetch: fn });
    await p.submit({ ...req, model: veo, prompt: 'The bottle in [Image1] turns', imageUrls: ['https://img/1.jpg'], durationSec: 8, endImageUrl: 'https://img/end.jpg' });
    await p.submit({ ...req, model: veo, imageUrls: ['https://img/1.jpg'], durationSec: 8, audio: true });
    await p.submit({ ...req, model: veo, imageUrls: [], ratio: '16:9', durationSec: 8 });
    expect(calls.map((c) => c.url)).toEqual(Array(3).fill('https://api.replicate.com/v1/models/google/veo-3.1/predictions'));
    expect(calls.map((c) => (c.body as { input: unknown }).input)).toEqual([
      { prompt: 'The bottle in image 1 turns', image: 'https://img/1.jpg', last_frame: 'https://img/end.jpg', aspect_ratio: '9:16', duration: 8, resolution: '720p', generate_audio: false },
      { prompt: 'a bottle on a table', image: 'https://img/1.jpg', aspect_ratio: '9:16', duration: 8, resolution: '720p', generate_audio: true },
      { prompt: 'a bottle on a table', aspect_ratio: '16:9', duration: 8, resolution: '720p', generate_audio: false },
    ]);
    expect(videoInputs('google/veo-3.1')).toEqual({ endFrame: true, textOnly: true, audioClips: null });
    expect(videoInputs(seedance.endpoint)).toEqual({ endFrame: false, textOnly: false, audioClips: null });
  });

  test('Seedance refuses an end frame before any call', async () => {
    const { fn, calls } = fakeFetch([201, { id: 'pred-1' }]);
    await expect(createReplicateProvider({ apiToken: 't', fetch: fn }).submit({ ...req, endImageUrl: 'https://img/end.jpg' })).rejects.toThrow(ImageReadError);
    expect(calls).toHaveLength(0);
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
