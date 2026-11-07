// Hand-written fixtures until B.5a replaces them with recorded real responses. No test reads FAL_KEY.
import { describe, expect, test } from 'vitest';
import { AUDIO_USD_PER_SECOND, BAKEOFF_MODELS } from '../models';
import { createFalProvider, VIDEO_BODIES, videoInputs, videoRefProblem } from './fal';
import { ImageReadError, isFundingRefusal, MAX_INLINE_CHARS, ProviderHttpError, resolveImages, unpackJobId } from './http';
import { createMockVideoProvider, MOCK_FAIL } from './mock';
import type { ProviderJob, SubmitRequest } from './types';

const [kling] = BAKEOFF_MODELS as [(typeof BAKEOFF_MODELS)[0]];
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
    expect(await body('google/gemini-omni-flash/v1.2/image-to-video')).toEqual({ prompt: 'put image 1 on image 2', image_url: 'https://img/1.jpg', aspect_ratio: '9:16', duration: 5, resolution: '720p' });
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
      'fal-ai/wan/v2.7/image-to-video', 'google/gemini-omni-flash/v1.2/image-to-video', 'minimax/h3-max/image-to-video', 'minimax/h3-max/reference-to-video',
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

  test("a Marketing Studio end frame on the reference endpoints that take one rides beside the model and product photos, not among them", async () => {
    for (const [endpoint, images] of [['fal-ai/kling-video/o3/pro/reference-to-video', 'image_urls'], ['minimax/h3-max/reference-to-video', 'reference_image_urls']] as const) {
      const { fn, calls } = fakeFetch([200, { request_id: 'r' }]);
      const read = async (url: string) => ({ bytes: new Uint8Array(url === 'asset://end' ? [9, 9] : [1, 2, 3]), contentType: 'image/png' });
      await createFalProvider({ apiKey: 'k', fetch: fn, readImage: read }).submit({ ...req, imageUrls: ['asset://model', 'asset://product'], endImageUrl: 'asset://end', model: { ...kling, endpoint } });
      expect(calls[0]!.body).toMatchObject({ [images]: [DATA_URL, DATA_URL], end_image_url: 'data:image/png;base64,CQk=' });
    }
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
    expect(endpoints.filter((_e, i) => sent[i] === true).sort()).toEqual(Object.keys(AUDIO_USD_PER_SECOND).filter((e) => e !== 'mock' && e !== 'veo-3.1-generate-001').sort());
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
      'google/gemini-omni-flash/v1.2/reference-to-video': 'google/gemini-omni-flash/v1.2/text-to-video',
      'google/gemini-omni-flash/v1.2/image-to-video': 'google/gemini-omni-flash/v1.2/text-to-video',
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

  test('COMPLETED but a 4xx on the result is a failed job that fal did not bill (cost 0), not a thrown poll error', async () => {
    const { fn } = fakeFetch([200, { status: 'COMPLETED' }], [422, { detail: [{ msg: 'Tail image without first image is not supported', type: 'input_value_error' }] }]);
    const s = await createFalProvider({ apiKey: 'k', fetch: fn }).status(job);
    expect(s).toMatchObject({ state: 'failed', costUsd: 0, costSource: 'estimate' });
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
    expect(videoInputs('mock')).toEqual({ endFrame: false, endMaxSec: null, textOnly: false, audioClips: null, videoRefs: null });
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

describe('fal reference video', () => {
  const read = async (url: string) => (url.includes('clip') ? { bytes: new Uint8Array([0, 0, 0, 0x18]), contentType: url.endsWith('mov') ? 'video/quicktime' : 'video/mp4' } : readImage(url));
  const seedance = (endpoint: string) => ({ ...kling, endpoint, outputResolution: '720p' });
  const prompt = 'Follow the motion, camera framing and pace of [Video1]; a woman in [Image1].';

  test('the endpoints that take one, with the limits their schemas state (read 2026-11-06)', () => {
    const takes = Object.keys(VIDEO_BODIES).filter((e) => videoInputs(e).videoRefs).map((e) => [e, videoInputs(e).videoRefs]);
    expect(takes).toEqual([
      ['fal-ai/kling-video/o3/pro/reference-to-video', { max: 1, minSec: 3, maxSec: 15, maxMb: 200, maxImages: 4, endFrame: false, silent: true }],
      ['fal-ai/kling-video/o3/pro/video-to-video/reference', { max: 1, minSec: 3, maxSec: 15, maxMb: 200, maxImages: 4, endFrame: false, silent: true }], // the sibling, never a model row itself
      ['bytedance/seedance-2.5/us/reference-to-video', { max: 1, minSec: 1.8, maxSec: 30.2, maxMb: 200, maxImages: null, endFrame: false, silent: false }],
      ['bytedance/seedance-2.0/us/reference-to-video', { max: 1, minSec: 2, maxSec: 15, maxMb: 50, maxImages: null, endFrame: false, silent: false }],
      ['google/gemini-omni-flash/v1.2/reference-to-video', { max: 1, minSec: 0, maxSec: 15, maxMb: null, maxImages: null, endFrame: false, silent: false }],
    ]);
    // Left out: MiniMax (video tokens unpriced), Wan, Grok, Veo, Kling O1, (the O3 row reaches the sibling).
    expect(videoInputs('minimax/h3-max/reference-to-video').videoRefs).toBeNull();
    expect(videoInputs('fal-ai/kling-video/o1/reference-to-video').videoRefs).toBeNull();
  });

  test('with a video Kling O3 is read as its video-to-video sibling: no end frame, no sound; without one it keeps both', () => {
    const o3 = 'fal-ai/kling-video/o3/pro/reference-to-video';
    expect([videoInputs(o3).endFrame, videoInputs(o3, true).endFrame, videoInputs(o3, true).textOnly]).toEqual([true, false, false]);
    expect(videoInputs(o3).videoRefs).toMatchObject({ endFrame: false, silent: true });
    expect(videoInputs('bytedance/seedance-2.0/us/reference-to-video', true)).toEqual(videoInputs('bytedance/seedance-2.0/us/reference-to-video'));
  });

  test('the picture size and frame rate checks follow the schemas, and an unreadable frame rate passes', () => {
    const s20 = 'bytedance/seedance-2.0/us/reference-to-video';
    const s25 = 'bytedance/seedance-2.5/us/reference-to-video';
    const o3 = 'fal-ai/kling-video/o3/pro/reference-to-video';
    const at = (endpoint: string, width: number, height: number, fps: number | null = 30) => videoRefProblem(endpoint, { width, height, fps });
    expect([at(s20, 720, 1280), at(s20, 1280, 720), at(s20, 960, 960), at(s20, 834, 1112), at(s20, 640, 640)]).toEqual([null, null, null, null, null]);
    expect(at(s20, 320, 240)).toMatch(/320x240/);
    expect(at(s20, 1080, 1920)).toMatch(/1080x1920/); // ~2 Mpx, past ~720p
    expect([at(s25, 1080, 1920), at(s25, 300, 300, 24), at(s25, 1280, 720, 60)]).toEqual([null, null, null]);
    expect([at(s25, 200, 400), at(s25, 6001, 3000), at(s25, 1000, 300)].map((r) => r !== null)).toEqual([true, true, true]); // a side under 300 or over 6,000; aspect 3.3
    expect(at(s25, 1280, 720, 12)).toMatch(/12 fps/);
    expect(at(s25, 1280, 720, 120)).toMatch(/120 fps/);
    expect(at(s25, 1280, 720, null)).toBeNull();
    expect([at(o3, 1280, 720), at(o3, 720, 1280), at(o3, 3840, 2160)]).toEqual([null, null, null]);
    expect([at(o3, 640, 360), at(o3, 3841, 1080)].map((r) => r !== null)).toEqual([true, true]);
    expect(at(o3, 1280, 720, 12)).toBeNull(); // Kling states no frame rate
    expect(at('google/gemini-omni-flash/v1.2/reference-to-video', 100, 100, 5)).toBeNull(); // nor does Omni, or an endpoint without video
    expect(at('minimax/h3-max/reference-to-video', 100, 100)).toBeNull();
  });

  test('Seedance 2.0 and 2.5 get video_urls in fal storage and @Video1 in the prompt; the images stay inline', async () => {
    for (const [endpoint, name] of [['bytedance/seedance-2.0/us/reference-to-video', 'mp4'], ['bytedance/seedance-2.5/us/reference-to-video', 'mov']] as const) {
      const { fn, calls } = falFake();
      await createFalProvider({ apiKey: 'k', fetch: fn, readImage: read }).submit({ ...base, prompt, imageUrls: ['asset://img'], videoUrls: [`asset://clip.${name}`], audio: false, model: seedance(endpoint) });
      expect(calls.filter((c) => c.url.includes('/storage/upload/initiate')).map((c) => c.body)).toEqual([name === 'mov' ? { content_type: 'video/quicktime', file_name: 'input.mov' } : { content_type: 'video/mp4', file_name: 'input.mp4' }]);
      const submit = calls.at(-1)!;
      expect(submit.url).toBe(`https://queue.fal.run/${endpoint}`);
      expect(submit.body).toEqual({
        prompt: 'Follow the motion, camera framing and pace of @Video1; a woman in @Image1.', image_urls: [DATA_URL], aspect_ratio: base.ratio, duration: String(base.durationSec), resolution: '720p', generate_audio: false,
        video_urls: [name === 'mov' ? 'https://v3b.fal.media/files/video-quicktime' : 'https://v3b.fal.media/files/video-mp4'],
      });
    }
  });

  test('Gemini Omni gets reference_video_urls and a plain phrase, as it takes media in list order', async () => {
    const { fn, calls } = falFake();
    await createFalProvider({ apiKey: 'k', fetch: fn, readImage: read }).submit({ ...base, prompt, imageUrls: ['asset://img'], videoUrls: ['asset://clip.mp4'], model: seedance('google/gemini-omni-flash/v1.2/reference-to-video') });
    const body = calls.at(-1)!.body as Record<string, unknown>;
    expect(body.prompt).toBe('Follow the motion, camera framing and pace of the reference video; a woman in image 1.');
    expect(body.reference_video_urls).toEqual(['https://v3b.fal.media/files/video-mp4']);
  });

  test('Kling O3 Pro goes to the video-to-video sibling with video_url, @Video1 and keep_audio off, and keeps its text twin without a video', async () => {
    const { fn, calls } = falFake();
    await createFalProvider({ apiKey: 'k', fetch: fn, readImage: read }).submit({ ...base, prompt, imageUrls: ['asset://img'], videoUrls: ['asset://clip.mp4'], audio: true, model: seedance('fal-ai/kling-video/o3/pro/reference-to-video') });
    const submit = calls.at(-1)!;
    expect(submit.url).toBe('https://queue.fal.run/fal-ai/kling-video/o3/pro/video-to-video/reference');
    expect(submit.body).toEqual({
      prompt: 'Follow the motion, camera framing and pace of @Video1; a woman in @Image1.', image_urls: [DATA_URL], aspect_ratio: base.ratio, duration: String(base.durationSec), keep_audio: false,
      video_url: 'https://v3b.fal.media/files/video-mp4',
    });
    const plain = falFake();
    await createFalProvider({ apiKey: 'k', fetch: plain.fn, readImage: read }).submit({ ...base, prompt: 'p', imageUrls: ['asset://img'], model: seedance('fal-ai/kling-video/o3/pro/reference-to-video') });
    expect(plain.calls.at(-1)!.url).toBe('https://queue.fal.run/fal-ai/kling-video/o3/pro/reference-to-video');
  });

  test('a model without it, two clips or a failed upload submit nothing', async () => {
    const none = falFake();
    const submit = (req: Pick<SubmitRequest, 'model'> & Partial<SubmitRequest>, f = none) => createFalProvider({ apiKey: 'k', fetch: f.fn, readImage: read }).submit({ ...base, imageUrls: ['asset://img'], videoUrls: ['asset://clip.mp4'], ...req });
    await expect(submit({ model: seedance('minimax/h3-max/reference-to-video') })).rejects.toThrow(ImageReadError);
    await expect(submit({ videoUrls: ['asset://clip.mp4', 'asset://clip2.mp4'], model: seedance('bytedance/seedance-2.0/us/reference-to-video') })).rejects.toThrow(ImageReadError);
    expect(none.calls).toHaveLength(0);
    const broken = falFake(500);
    await expect(submit({ model: seedance('bytedance/seedance-2.0/us/reference-to-video') }, broken)).rejects.toThrow(ImageReadError);
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

describe('shared helpers', () => {
  test('inlined images over MAX_INLINE_CHARS in total are refused before any is returned (a provider reset a 3.8 MB body in the bake-off)', async () => {
    const big = async () => ({ bytes: new Uint8Array(Math.ceil((MAX_INLINE_CHARS * 3) / 8)), contentType: 'image/png' });
    await expect(resolveImages(['asset://a1', 'asset://a2'], big)).rejects.toThrow(ImageReadError);
    await expect(resolveImages(['asset://a1'], big)).resolves.toHaveLength(1);
  });

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
  const mockModel = { ...kling, provider: 'mock' as const, usdPerSecond: 0.2312 };

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
