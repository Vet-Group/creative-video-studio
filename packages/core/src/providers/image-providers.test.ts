// Image adapters against fixtures shaped like the fal input and output schemas read on 2026-10-24. No network, no key.
import { describe, expect, test } from 'vitest';
import type { ImageModelConfig } from '../models';
import { createFalImageProvider } from './fal';
import { imageEstimate, ProviderHttpError } from './http';
import { createMockImageProvider, MOCK_FAIL } from './mock';
import type { ImageProviderJob, ImageSubmitRequest } from './types';

const model = (endpoint: string, imagePrices: Record<string, string>): ImageModelConfig => ({
  id: endpoint, provider: 'fal', endpoint, label: endpoint, ratios: ['auto', '1:1', '9:16'], maxImages: 4, imagePrices, features: ['image'],
});
const PRO = model('fal-ai/nano-banana-pro/edit', { '1K': '0.15', '2K': '0.15', '4K': '0.30' });
const req = (m: ImageModelConfig, extra: Partial<ImageSubmitRequest> = {}): ImageSubmitRequest => ({
  model: m, prompt: 'a bottle on a table', imageUrls: ['https://img/1.jpg', 'https://img/2.jpg'], ratio: '1:1', resolution: '1K', ...extra,
});

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
function fakeFetch(...answers: [number, unknown][]) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(init.body as string) : undefined });
    const [status, json] = answers.shift() ?? [500, {}];
    return new Response(JSON.stringify(json), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

/** The body fal receives for a request, from a fake queue that accepts it. */
async function bodyFor(r: ImageSubmitRequest, readImage?: (url: string) => Promise<{ bytes: Uint8Array; contentType: string }>) {
  const { fn, calls } = fakeFetch([200, { request_id: 'r1' }]);
  await createFalImageProvider({ apiKey: 'k', fetch: fn, readImage }).submit(r);
  return { url: calls[0]!.url, headers: calls[0]!.headers, body: calls[0]!.body };
}

describe('fal image submit', () => {
  test('Nano Banana Pro sends auth, the prompt, images, ratio, resolution, one png image and returns the request id', async () => {
    const { fn, calls } = fakeFetch([200, { request_id: 'req-9', status_url: 'x' }]);
    const out = await createFalImageProvider({ apiKey: 'k', fetch: fn }).submit(req(PRO, { ratio: '9:16', resolution: '4K' }));
    expect(out.providerJobId).toBe('req-9');
    expect(calls[0]!.url).toBe('https://queue.fal.run/fal-ai/nano-banana-pro/edit');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.headers.Authorization).toBe('Key k');
    expect(calls[0]!.headers['X-Fal-Store-IO']).toBe('0');
    expect(calls[0]!.body).toEqual({
      prompt: 'a bottle on a table', image_urls: ['https://img/1.jpg', 'https://img/2.jpg'], aspect_ratio: '9:16', resolution: '4K', num_images: 1, output_format: 'png',
    });
  });

  test.each(['google/nano-banana-2.1/edit', 'fal-ai/nano-banana-2/edit'])('%s uses the same fields as Nano Banana Pro', async (endpoint) => {
    const { body } = await bodyFor(req(model(endpoint, { '1K': '0.04' }), { ratio: 'auto' }));
    expect(body).toMatchObject({ aspect_ratio: 'auto', resolution: '1K', num_images: 1 });
  });

  test('Nano Banana has no resolution input, so none is sent', async () => {
    const { body } = await bodyFor(req(model('fal-ai/nano-banana/edit', { '1K': '0.0398' })));
    expect(body).toEqual({ prompt: 'a bottle on a table', image_urls: ['https://img/1.jpg', 'https://img/2.jpg'], aspect_ratio: '1:1', num_images: 1, output_format: 'png' });
  });

  test('GPT Image 2 maps the ratio to a preset size and sends the high tier, unless a quality is given', async () => {
    const gpt = model('openai/gpt-image-2/edit', { '1K': '0.21' });
    expect((await bodyFor(req(gpt, { ratio: '9:16' }))).body).toEqual({
      prompt: 'a bottle on a table', image_urls: ['https://img/1.jpg', 'https://img/2.jpg'], image_size: 'portrait_16_9', quality: 'high', num_images: 1, output_format: 'png',
    });
    expect((await bodyFor(req(gpt, { ratio: 'auto', quality: 'low' }))).body).toMatchObject({ image_size: 'auto', quality: 'low' });
    const { fn, calls } = fakeFetch();
    await expect(createFalImageProvider({ apiKey: 'k', fetch: fn }).submit(req(gpt, { ratio: '21:9' }))).rejects.toThrow(/does not offer ratio 21:9/);
    expect(calls).toHaveLength(0);
  });

  test('Seedream sends auto_<resolution> for auto and otherwise a size inside 1024x1024..2048x2048 pixels, in multiples of 16', async () => {
    const seed = model('bytedance/seedream/v5/pro/edit', { '1K': '0.0675', '2K': '0.135' });
    expect((await bodyFor(req(seed, { ratio: 'auto', resolution: '2K' }))).body).toMatchObject({ image_size: 'auto_2K' });
    for (const resolution of ['1K', '2K']) {
      for (const ratio of ['1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4', '21:9']) {
        const size = ((await bodyFor(req(seed, { ratio, resolution }))).body as { image_size: { width: number; height: number } }).image_size;
        expect(size.width % 16).toBe(0);
        expect(size.height % 16).toBe(0);
        expect(size.width * size.height).toBeGreaterThanOrEqual(1024 * 1024);
        expect(size.width * size.height).toBeLessThanOrEqual(2048 * 2048);
        const [w, h] = ratio.split(':').map(Number) as [number, number];
        expect(Math.abs(size.width / size.height - w / h)).toBeLessThan(0.03);
      }
    }
  });

  test('FASHN sends the person as model_image and the garment as garment_image, and needs exactly two images', async () => {
    const fashn = model('fal-ai/fashn/tryon/v1.6', { '1K': '0.075' });
    expect((await bodyFor(req(fashn, { ratio: 'auto' }))).body).toEqual({ model_image: 'https://img/1.jpg', garment_image: 'https://img/2.jpg', num_samples: 1, output_format: 'png' });
    const { fn, calls } = fakeFetch();
    await expect(createFalImageProvider({ apiKey: 'k', fetch: fn }).submit(req(fashn, { imageUrls: ['https://img/1.jpg'] }))).rejects.toThrow(/model image and the garment image/);
    expect(calls).toHaveLength(0);
  });

  test('an endpoint without a builder submits nothing', async () => {
    const { fn, calls } = fakeFetch();
    await expect(createFalImageProvider({ apiKey: 'k', fetch: fn }).submit(req(model('fal-ai/unknown/edit', { '1K': '1' })))).rejects.toThrow(/no request builder/);
    expect(calls).toHaveLength(0);
  });

  test('inlines non-https images as data URLs, and a failed read submits nothing', async () => {
    const readImage = async (url: string) => {
      if (url.includes('missing')) throw new Error('asset not found');
      return { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' };
    };
    expect((await bodyFor(req(PRO, { imageUrls: ['asset://a'] }), readImage)).body).toMatchObject({ image_urls: ['data:image/png;base64,AQID'] });
    const { fn, calls } = fakeFetch();
    await expect(createFalImageProvider({ apiKey: 'k', fetch: fn, readImage }).submit(req(PRO, { imageUrls: ['asset://missing'] }))).rejects.toThrow(/asset not found/);
    expect(calls).toHaveLength(0);
  });

  test('a refusal surfaces the HTTP status, and a response without request_id throws', async () => {
    const err = await createFalImageProvider({ apiKey: 'k', fetch: fakeFetch([402, { detail: 'Exhausted balance' }]).fn }).submit(req(PRO)).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderHttpError);
    expect(err.status).toBe(402);
    await expect(createFalImageProvider({ apiKey: 'k', fetch: fakeFetch([200, {}]).fn }).submit(req(PRO))).rejects.toThrow(/no request_id/);
  });
});

describe('fal image status', () => {
  const job: ImageProviderJob = { providerJobId: 'req-9', model: PRO, resolution: '4K' };
  const provider = (...answers: [number, unknown][]) => {
    const f = fakeFetch(...answers);
    return { p: createFalImageProvider({ apiKey: 'k', fetch: f.fn }), calls: f.calls };
  };

  test.each([['IN_QUEUE', 'queued'], ['IN_PROGRESS', 'running']])('%s is %s', async (status, state) => {
    const { p, calls } = provider([200, { status }]);
    expect(await p.status(job)).toEqual({ state });
    expect(calls[0]!.url).toBe('https://queue.fal.run/fal-ai/nano-banana-pro/requests/req-9/status');
  });

  test('COMPLETED reads images[0].url from the result and costs the price of the resolution', async () => {
    const { p, calls } = provider(
      [200, { status: 'COMPLETED' }],
      [200, { images: [{ url: 'https://v3.fal.media/a.png', content_type: 'image/png', file_name: 'a.png', width: 1024, height: 1024 }], description: '' }],
    );
    expect(await p.status(job)).toEqual({ state: 'succeeded', outputUrl: 'https://v3.fal.media/a.png', costUsd: 0.3, costSource: 'estimate' });
    expect(calls[1]!.url).toBe('https://queue.fal.run/fal-ai/nano-banana-pro/requests/req-9');
  });

  test('COMPLETED with an error, an empty result or a 4xx result is failed and still carries the price', async () => {
    expect(await provider([200, { status: 'COMPLETED', error: 'content policy', error_type: 'content_policy_violation' }]).p.status(job)).toEqual({
      state: 'failed', error: 'content policy', costUsd: 0.3, costSource: 'estimate',
    });
    expect(await provider([200, { status: 'COMPLETED' }], [200, { images: [] }]).p.status(job)).toMatchObject({ state: 'failed', error: 'fal result has no images[0].url' });
    expect(await provider([200, { status: 'COMPLETED' }], [422, { detail: 'image_too_large' }]).p.status(job)).toMatchObject({ state: 'failed', error: expect.stringContaining('422') });
  });

  test.each([401, 403, 429, 500])('a %i on the result throws so the poll is retried', async (code) => {
    await expect(provider([200, { status: 'COMPLETED' }], [code, {}]).p.status(job)).rejects.toThrow(/fal result/);
  });

  test('an unknown status throws, and a resolution without a price throws', async () => {
    await expect(provider([200, { status: 'WEIRD' }]).p.status(job)).rejects.toThrow(/unknown status/);
    await expect(provider().p.status({ ...job, resolution: '8K' })).rejects.toThrow(/no price for resolution 8K/);
  });

  test('cancel is unsupported and makes no network call', async () => {
    const { p, calls } = provider();
    expect(await p.cancel(job)).toEqual({ supported: false });
    expect(calls).toHaveLength(0);
  });
});

describe('mock image provider', () => {
  const m = model('mock', { '1K': '0.15' });
  const job = (providerJobId: string): ImageProviderJob => ({ providerJobId, model: m, resolution: '1K' });

  test('walks queued, running, succeeded and costs the price', async () => {
    const p = createMockImageProvider();
    const { providerJobId } = await p.submit(req(m));
    expect((await p.status(job(providerJobId))).state).toBe('queued');
    expect((await p.status(job(providerJobId))).state).toBe('running');
    expect(await p.status(job(providerJobId))).toEqual({ state: 'succeeded', outputUrl: `mock://image/${providerJobId}.png`, costUsd: 0.15, costSource: 'estimate' });
  });

  test('MOCK_FAIL fails and cancel ends as canceled', async () => {
    const p = createMockImageProvider({ runningPolls: 0 });
    const failing = await p.submit(req(m, { prompt: `x ${MOCK_FAIL}` }));
    await p.status(job(failing.providerJobId));
    expect(await p.status(job(failing.providerJobId))).toMatchObject({ state: 'failed', error: 'mock provider failure' });
    const canceled = await p.submit(req(m));
    await p.cancel(job(canceled.providerJobId));
    expect((await p.status(job(canceled.providerJobId))).state).toBe('canceled');
  });
});

test('imageEstimate is the price of the resolution as a number', () => {
  expect(imageEstimate({ model: PRO, resolution: '2K' })).toEqual({ costUsd: 0.15, costSource: 'estimate' });
});
