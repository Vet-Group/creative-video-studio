// The BytePlus adapters against fixtures shaped like the create, get and cancel pages and the image generation page (read 2026-11-04). No network, no key.
import { describe, expect, test } from 'vitest';
import { extraInputUsd, type ImageModelConfig, type ModelConfig, textToImage } from '../models';
import { createByteplusImageProvider, createByteplusProvider, isByteplusVideo } from './byteplus';
import { videoInputs } from './fal';
import { ImageReadError, MAX_INLINE_CHARS, ProviderHttpError, unpackJobId } from './http';
import type { ImageProviderJob, ImageSubmitRequest, ProviderJob, SubmitRequest } from './types';

const ARK_FIXTURE = 'ark-fixture-value';
const video = (endpoint: string, usdPerSecond: number, outputResolution: string): ModelConfig => ({
  id: endpoint, provider: 'byteplus', endpoint, label: endpoint, ratios: ['9:16', '1:1', '16:9'], durationsSec: [4, 5], maxImages: 9, outputResolution, usdPerSecond, billedAmountField: 'usage.completion_tokens', sources: {},
});
const S25 = video('dreamina-seedance-2-5-260628', 0.2312, '720p');
const S20 = video('dreamina-seedance-2-0-260128', 0.1512, '720p');
const S10 = video('seedance-1-0-pro-250528', 0.1224, '1080p');
const base: Omit<SubmitRequest, 'model'> = { prompt: 'put [Image1] on [Image2]', imageUrls: ['https://img/1.jpg', 'https://img/2.jpg'], ratio: '9:16', durationSec: 5 };

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown; signal?: AbortSignal | null };
function fakeFetch(...answers: [number, unknown][]) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(init.body as string) : undefined, signal: init.signal });
    const [status, json] = answers.shift() ?? [500, {}];
    return new Response(JSON.stringify(json), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const provider = (fn: typeof fetch, readImage?: Parameters<typeof createByteplusProvider>[0]['readImage']) => createByteplusProvider({ apiKey: ARK_FIXTURE, fetch: fn, readImage });
const bodyOf = async (model: ModelConfig, extra: Partial<SubmitRequest> = {}) => {
  const { fn, calls } = fakeFetch([200, { id: 'cgt-1' }]);
  await provider(fn).submit({ ...base, model, ...extra });
  return calls[0]!;
};
const job = (model: ModelConfig, id = 'cgt-1', durationSec = 5): ProviderJob => ({ providerJobId: `${durationSec}:${id}`, model });
const poll = async (model: ModelConfig, answer: unknown, status = 200) => provider(fakeFetch([status, answer]).fn).status(job(model));

describe('byteplus video submit', () => {
  test('Seedance 2.5 sends the images as references named @ImageN, at the row resolution, silent and unwatermarked, with the reference task type', async () => {
    const call = await bodyOf(S25);
    expect([call.url, call.method]).toEqual(['https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks', 'POST']);
    expect(call.headers.Authorization).toBe(`Bearer ${ARK_FIXTURE}`);
    expect(call.body).toEqual({
      model: 'dreamina-seedance-2-5-260628',
      content: [
        { type: 'text', text: 'put @Image1 on @Image2' },
        { type: 'image_url', image_url: { url: 'https://img/1.jpg' }, role: 'reference_image' },
        { type: 'image_url', image_url: { url: 'https://img/2.jpg' }, role: 'reference_image' },
      ],
      ratio: '9:16', duration: 5, resolution: '720p', watermark: false, generate_audio: false, omni_reference_task_type: 'reference',
    });
  });

  test('Seedance 2.0 is the same without the 2.5-only task type, and audio follows the job', async () => {
    const call = await bodyOf(S20, { audio: true });
    expect(call.body).toMatchObject({ model: 'dreamina-seedance-2-0-260128', generate_audio: true, resolution: '720p' });
    expect(call.body).not.toHaveProperty('omni_reference_task_type');
  });

  test('Seedance 1.0 sends one first-frame image, names it "image 1", asks 1080p and has no audio field', async () => {
    const call = await bodyOf(S10, { imageUrls: ['https://img/1.jpg'], prompt: 'put [Image1] on a table' });
    expect(call.body).toEqual({
      model: 'seedance-1-0-pro-250528',
      content: [{ type: 'text', text: 'put image 1 on a table' }, { type: 'image_url', image_url: { url: 'https://img/1.jpg' }, role: 'first_frame' }],
      ratio: '9:16', duration: 5, resolution: '1080p', watermark: false,
    });
  });

  test('a Run with no image is text-to-video: the prompt alone, on every row', async () => {
    for (const m of [S25, S20, S10]) {
      const call = await bodyOf(m, { imageUrls: [], prompt: 'a slow push-in' });
      expect(call.body).toMatchObject({ content: [{ type: 'text', text: 'a slow push-in' }] });
      expect(call.body).not.toHaveProperty('omni_reference_task_type');
    }
  });

  test('non-https images are inlined as data URLs before the call; a bad one submits nothing', async () => {
    const readImage = async (url: string) => {
      if (url.includes('missing')) throw new Error('asset not found');
      return { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' };
    };
    const { fn, calls } = fakeFetch([200, { id: 'cgt-1' }]);
    await provider(fn, readImage).submit({ ...base, model: S20, imageUrls: ['asset://a1'] });
    expect((calls[0]!.body as { content: { image_url?: { url: string } }[] }).content[1]!.image_url!.url).toBe('data:image/png;base64,AQID');
    const none = fakeFetch();
    await expect(provider(none.fn, readImage).submit({ ...base, model: S20, imageUrls: ['asset://missing'] })).rejects.toBeInstanceOf(ImageReadError);
    expect(none.calls).toEqual([]);
  });

  test('nine inlined images pass where the default 3.6 MB inline cap would refuse them (the cap is the 64 MB body, not 3.6 MB)', async () => {
    const big = async () => ({ bytes: new Uint8Array(Math.ceil((MAX_INLINE_CHARS * 3) / 4 / 5)), contentType: 'image/png' });
    const { fn, calls } = fakeFetch([200, { id: 'cgt-1' }]);
    await provider(fn, big).submit({ ...base, model: S25, imageUrls: Array.from({ length: 9 }, (_, i) => `asset://a${i}`) });
    expect(calls).toHaveLength(1);
  });

  test('an end frame and an unknown endpoint are refused before any call', async () => {
    const { fn, calls } = fakeFetch();
    await expect(provider(fn).submit({ ...base, model: S25, endImageUrl: 'https://img/e.jpg' })).rejects.toThrow('takes no end frame');
    await expect(provider(fn).submit({ ...base, model: video('seedance-3', 1, '720p') })).rejects.toBeInstanceOf(ImageReadError);
    expect(calls).toEqual([]);
  });

  test('a 400 from the create call (nothing was made, nothing billed) is an ImageReadError, so the estimate is released; 401, 403, 429 and 5xx stay HTTP errors', async () => {
    const refused = (status: number) => provider(fakeFetch([status, { error: { code: 'InvalidParameter', message: 'image aspect ratio is out of range' } }]).fn).submit({ ...base, model: S25 });
    await expect(refused(400)).rejects.toSatisfy((e) => e instanceof ImageReadError && /HTTP 400.*InvalidParameter/.test(e.message));
    for (const status of [401, 403, 429, 503]) await expect(refused(status), String(status)).rejects.toSatisfy((e) => e instanceof ProviderHttpError && e.status === status);
  });

  test('the job id carries the duration, and a refusal surfaces the HTTP status', async () => {
    const { fn } = fakeFetch([200, { id: 'cgt-2025-x:y' }]);
    expect(unpackJobId(job(S25, 'z'))).toEqual({ durationSec: 5, id: 'z' });
    expect((await provider(fn).submit({ ...base, model: S25, durationSec: 8 })).providerJobId).toBe('8:cgt-2025-x:y');
    const refused = provider(fakeFetch([402, { error: { message: 'insufficient balance' } }]).fn).submit({ ...base, model: S25 });
    await expect(refused).rejects.toSatisfy((e) => e instanceof ProviderHttpError && e.status === 402);
    await expect(provider(fakeFetch([200, {}]).fn).submit({ ...base, model: S25 })).rejects.toThrow('no id');
  });

  test('every row of migration 0056 runs from the prompt alone and takes no end frame or audio clips', () => {
    for (const endpoint of ['dreamina-seedance-2-5-260628', 'dreamina-seedance-2-0-260128', 'dreamina-seedance-2-0-fast-260128', 'dreamina-seedance-2-0-mini-260615', 'seedance-1-0-pro-250528', 'seedance-1-0-pro-fast-251015']) {
      expect([isByteplusVideo(endpoint), videoInputs(endpoint)]).toEqual([true, { endFrame: false, endMaxSec: null, textOnly: true, audioClips: null, videoRefs: null }]);
    }
    expect(isByteplusVideo('bytedance/seedance-2.0')).toBe(false);
  });
});

describe('byteplus video status and cancel', () => {
  test('queued and running map straight across, and the request carries the key and a timeout', async () => {
    const { fn, calls } = fakeFetch([200, { status: 'queued' }], [200, { status: 'running' }]);
    expect(await provider(fn).status(job(S25))).toEqual({ state: 'queued' });
    expect(await provider(fn).status(job(S25))).toEqual({ state: 'running' });
    expect([calls[0]!.url, calls[0]!.headers.Authorization, calls[0]!.signal instanceof AbortSignal]).toEqual(['https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-1', `Bearer ${ARK_FIXTURE}`, true]);
  });

  test('succeeded books the reported tokens at the row price, and an answer without usage falls back to the estimate', async () => {
    // 5 s at 720p is 108,000 tokens: 108,000 / 21,600 x 0.2312 = 1.156; the docs' own example reports 108,900.
    const ok = { status: 'succeeded', content: { video_url: 'https://tos/v.mp4' }, usage: { completion_tokens: 108_900, total_tokens: 108_900 } };
    expect(await poll(S25, ok)).toEqual({ state: 'succeeded', outputUrl: 'https://tos/v.mp4', costUsd: 1.1656, costSource: 'reported' });
    expect(await poll(S20, ok)).toMatchObject({ costUsd: 0.7623, costSource: 'reported' });
    // Seedance 1.0 at 1080p is 48,960 tokens per second: 244,800 tokens for 5 s are 5 x 0.1224.
    expect(await poll(S10, { ...ok, usage: { completion_tokens: 244_800 } })).toMatchObject({ costUsd: 0.612, costSource: 'reported' });
    expect(await poll(S25, { status: 'succeeded', content: { video_url: 'https://tos/v.mp4' } })).toEqual({ state: 'succeeded', outputUrl: 'https://tos/v.mp4', costUsd: 1.156, costSource: 'estimate' });
    expect(await poll(video('dreamina-seedance-2-0-260128', 0.1, '480p'), ok)).toMatchObject({ costSource: 'estimate', costUsd: 0.5 });
  });

  test('succeeded without a video URL is failed but still billed', async () => {
    expect(await poll(S25, { status: 'succeeded', content: {}, usage: { completion_tokens: 108_000 } })).toEqual({ state: 'failed', error: 'byteplus task has no video_url', costUsd: 1.156, costSource: 'reported' });
  });

  test('failed and expired carry the error code and cost nothing; cancelled is canceled', async () => {
    expect(await poll(S25, { status: 'failed', error: { code: 'OutputVideoSensitiveContentDetected', message: 'blocked' } })).toEqual({ state: 'failed', error: 'OutputVideoSensitiveContentDetected: blocked', costUsd: 0, costSource: 'reported' });
    expect(await poll(S25, { status: 'expired', error: null })).toEqual({ state: 'failed', error: 'expired', costUsd: 0, costSource: 'reported' });
    expect(await poll(S25, { status: 'cancelled' })).toEqual({ state: 'canceled', error: 'cancelled', costUsd: 0, costSource: 'reported' });
  });

  test('an unknown status and an HTTP error throw, so the poll is retried', async () => {
    await expect(poll(S25, { status: 'weird' })).rejects.toThrow('unknown status weird');
    await expect(poll(S25, { error: 'down' }, 503)).rejects.toBeInstanceOf(ProviderHttpError);
  });

  test('cancel deletes a queued task only; every other state is left alone, so its record stays readable', async () => {
    const url = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-1';
    const queued = fakeFetch([200, { status: 'queued' }], [200, {}]);
    expect(await provider(queued.fn).cancel(job(S25))).toEqual({ supported: true });
    expect(queued.calls.map((c) => [c.method, c.url, c.signal instanceof AbortSignal])).toEqual([['GET', url, true], ['DELETE', url, true]]);
    for (const status of ['running', 'succeeded', 'failed', 'cancelled', 'expired']) {
      const other = fakeFetch([200, { status }]);
      expect(await provider(other.fn).cancel(job(S25)), status).toEqual({ supported: false });
      expect(other.calls.map((c) => c.method), status).toEqual(['GET']);
    }
  });

  test('cancel of a task that is gone is "not supported"; a task that stops being queued before the DELETE too; a bad key, a rate limit or a 5xx throws', async () => {
    expect(await provider(fakeFetch([404, {}]).fn).cancel(job(S25))).toEqual({ supported: false });
    expect(await provider(fakeFetch([200, { status: 'queued' }], [400, { error: { message: 'running task cannot be deleted' } }]).fn).cancel(job(S25))).toEqual({ supported: false });
    for (const status of [401, 429, 500]) await expect(provider(fakeFetch([status, {}]).fn).cancel(job(S25))).rejects.toBeInstanceOf(ProviderHttpError);
    await expect(provider(fakeFetch([200, { status: 'queued' }], [500, {}]).fn).cancel(job(S25))).rejects.toBeInstanceOf(ProviderHttpError);
  });

  test('a task that answers 404 (deleted, or past its 7 days) is a final failure held at the estimate, so the poll ends; other HTTP errors still throw', async () => {
    expect(await poll(S25, { error: 'not found' }, 404)).toEqual({ state: 'failed', error: 'task not found', costUsd: 1.156, costSource: 'estimate' });
    await expect(poll(S25, {}, 401)).rejects.toBeInstanceOf(ProviderHttpError);
  });
});

describe('byteplus images', () => {
  const model = (endpoint: string, imagePrices: Record<string, string>): ImageModelConfig => ({ id: endpoint, provider: 'byteplus', endpoint, label: endpoint, ratios: ['auto', '1:1', '9:16'], maxImages: 4, imagePrices, features: ['image'] });
  const PRO = model('dola-seedream-5-0-pro-260628', { '1K': '0.045', '2K': '0.09' });
  const req = (extra: Partial<ImageSubmitRequest> = {}): ImageSubmitRequest => ({ model: PRO, prompt: 'a bottle on a table', imageUrls: ['https://img/1.jpg'], ratio: '1:1', resolution: '1K', ...extra });
  const images = (...answers: [number, unknown][]) => {
    const f = fakeFetch(...answers);
    return { ...f, p: createByteplusImageProvider({ apiKey: ARK_FIXTURE, fetch: f.fn }) };
  };
  const ok = { created: 1, model: 'dola-seedream-5-0-pro-260628', data: [{ url: 'https://tos/i.png', size: '1024x1024' }], usage: { generated_images: 1 } };
  const jobOf = (providerJobId: string, resolution = '1K'): ImageProviderJob => ({ providerJobId, model: PRO, resolution });

  test('sends the key, the reference image, a size in the ratio (about 1.1 MP at 1K, 4 MP at 2K), png and no watermark; status returns the URL at the price', async () => {
    const { p, calls } = images([200, ok]);
    const { providerJobId } = await p.submit(req({ ratio: '9:16' }));
    expect([calls[0]!.url, calls[0]!.headers.Authorization]).toEqual(['https://ark.ap-southeast.bytepluses.com/api/v3/images/generations', `Bearer ${ARK_FIXTURE}`]);
    expect(calls[0]!.body).toEqual({ model: 'dola-seedream-5-0-pro-260628', prompt: 'a bottle on a table', image: 'https://img/1.jpg', size: '784x1392', response_format: 'url', output_format: 'png', watermark: false });
    expect(await p.status(jobOf(providerJobId))).toEqual({ state: 'succeeded', outputUrl: 'https://tos/i.png', costUsd: 0.045, costSource: 'estimate' });
    const big = images([200, ok]);
    await big.p.submit(req({ ratio: '1:1', resolution: '2K', imageUrls: ['https://img/1.jpg', 'https://img/2.jpg'] }));
    expect(big.calls[0]!.body).toMatchObject({ size: '2000x2000', image: ['https://img/1.jpg', 'https://img/2.jpg'] });
  });

  test('Seedream 4.5 and 4.0 get no output_format (the API refuses it for them, canary 2026-11-04) and bill the flat price whatever the input images', async () => {
    for (const [endpoint, usd] of [['seedream-4-5-251128', '0.04'], ['seedream-4-0-250828', '0.03']] as const) {
      const { p, calls } = images([200, ok]);
      const m = model(endpoint, { '1K': usd, '2K': usd });
      const { providerJobId } = await p.submit(req({ model: m, ratio: 'auto', imageUrls: ['https://img/1.jpg', 'https://img/2.jpg'] }));
      expect(calls[0]!.body).toEqual({ model: endpoint, prompt: 'a bottle on a table', image: ['https://img/1.jpg', 'https://img/2.jpg'], size: '1K', response_format: 'url', watermark: false });
      expect(await p.status({ providerJobId, model: m, resolution: '1K' })).toMatchObject({ state: 'succeeded', costUsd: Number(usd) });
    }
  });

  test('every size sits inside the API range of 921,600 to 4,624,220 pixels, and the 2K ones are above the 2.61 MP of the cheaper tier', async () => {
    for (const ratio of ['1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4', '21:9']) {
      for (const [resolution, low, high] of [['1K', 921_600, 2_610_000], ['2K', 2_610_001, 4_624_220]] as const) {
        const { p, calls } = images([200, ok]);
        await p.submit(req({ ratio, resolution }));
        const [w, h] = (calls[0]!.body as { size: string }).size.split('x').map(Number) as [number, number];
        expect(w * h, `${ratio} ${resolution}`).toBeGreaterThanOrEqual(low);
        expect(w * h, `${ratio} ${resolution}`).toBeLessThanOrEqual(high);
      }
    }
  });

  test('Seedream makes a picture from words alone, so the picker offers it a Run with no image', () => {
    expect([textToImage(PRO), textToImage({ provider: 'fal', endpoint: PRO.endpoint })]).toEqual([true, false]);
  });

  test("'auto' names the resolution level; a Run with no image sends no image field", async () => {
    const auto = images([200, ok]);
    await auto.p.submit(req({ ratio: 'auto', resolution: '2K', imageUrls: [] }));
    expect(auto.calls[0]!.body).toMatchObject({ size: '2K' });
    expect(auto.calls[0]!.body).not.toHaveProperty('image');
  });

  test('a resolution without a size or price is refused before any call', async () => {
    const { p, calls } = images();
    await expect(p.submit(req({ resolution: '4K' }))).rejects.toBeInstanceOf(ImageReadError);
    await expect(p.submit(req({ model: model('dola-seedream-5-0-flash-260915', { '1K': '0.018' }), resolution: '2K' }))).rejects.toThrow('no price for resolution 2K');
    expect(calls).toEqual([]);
  });

  test('Pro adds $0.003 for every input image after the first, to the cost the job books and to the estimate the web app reserves; Flash input images are free', async () => {
    const FLASH = model('dola-seedream-5-0-flash-260915', { '1K': '0.018', '2K': '0.018' });
    const cost = async (m: ImageModelConfig, n: number) => {
      const { p } = images([200, ok]);
      const { providerJobId } = await p.submit(req({ model: m, imageUrls: Array.from({ length: n }, (_, i) => `https://img/${i}.jpg`) }));
      return ((await p.status(jobOf(providerJobId))) as { costUsd: number }).costUsd;
    };
    expect([await cost(PRO, 0), await cost(PRO, 1), await cost(PRO, 2), await cost(PRO, 4)]).toEqual([0.045, 0.045, 0.048, 0.054]);
    expect([await cost(FLASH, 1), await cost(FLASH, 4)]).toEqual([0.018, 0.018]);
    expect([extraInputUsd(PRO.endpoint, 4), extraInputUsd(FLASH.endpoint, 4), extraInputUsd('fal-ai/nano-banana-pro/edit', 4)]).toEqual([0.009, 0, 0]);
  });

  test('a 400 from the image call (nothing generated, nothing billed) is an ImageReadError; other HTTP errors are failed outcomes that cost nothing', async () => {
    const { p } = images([400, { error: { code: 'InvalidParameter', message: 'image width is under 300 px' } }]);
    await expect(p.submit(req())).rejects.toSatisfy((e) => e instanceof ImageReadError && /HTTP 400.*InvalidParameter/.test(e.message));
  });

  test('an HTTP error is a failed outcome that costs nothing; an answer without an image costs nothing only when none was generated', async () => {
    const refused = images([503, { error: { code: 'ServerOverloaded', message: 'try later' } }]);
    const failed = await refused.p.status(jobOf((await refused.p.submit(req())).providerJobId));
    expect(failed).toMatchObject({ state: 'failed', costUsd: 0, costSource: 'reported' });
    expect((failed as { error: string }).error).toContain('ServerOverloaded');
    const none = images([200, { data: [], usage: { generated_images: 0 } }], [200, { data: [] }]);
    expect(await none.p.status(jobOf((await none.p.submit(req())).providerJobId))).toMatchObject({ state: 'failed', costUsd: 0 });
    expect(await none.p.status(jobOf((await none.p.submit(req())).providerJobId))).toMatchObject({ state: 'failed', costUsd: 0.045, costSource: 'estimate' });
  });

  test('a lost connection may have been billed, so it keeps the estimate; a foreign job id is refused; cancel is unsupported', async () => {
    const f = createByteplusImageProvider({ apiKey: ARK_FIXTURE, fetch: (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch });
    expect(await f.status(jobOf((await f.submit(req())).providerJobId))).toMatchObject({ state: 'failed', error: 'fetch failed', costUsd: 0.045, costSource: 'estimate' });
    await expect(f.status(jobOf('abc'))).rejects.toThrow('Invalid byteplus image job');
    expect(await f.cancel(jobOf('x'))).toEqual({ supported: false });
  });
});
