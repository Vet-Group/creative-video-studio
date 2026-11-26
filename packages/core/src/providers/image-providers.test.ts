// Image adapters against fixtures shaped like the fal input and output schemas read on 2026-10-24. No network, no key.
import { describe, expect, test } from 'vitest';
import { FEATURE_PROMPTS, type ImageModelConfig, PRODUCT_VIEWS } from '../models';
import { createFalImageProvider } from './fal';
import { ImageReadError, imageEstimate, ProviderHttpError } from './http';
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

  test.each(['fal-ai/nano-banana-pro/edit', 'openai/gpt-image-2/edit', 'bytedance/seedream/v5/pro/edit'])('%s gets the [ImageN] chips as the plain words "image N"', async (endpoint) => {
    const { body } = await bodyFor(req(model(endpoint, { '1K': '0.04', '2K': '0.04' }), { prompt: 'the model in [Image1] wears the shirt in [Image2]' }));
    expect((body as { prompt: string }).prompt).toBe('the model in image 1 wears the shirt in image 2');
  });

  test.each(['google/nano-banana-2.1/edit', 'fal-ai/nano-banana-2/edit'])('%s uses the same fields as Nano Banana Pro', async (endpoint) => {
    const { body } = await bodyFor(req(model(endpoint, { '1K': '0.04' }), { ratio: 'auto' }));
    expect(body).toMatchObject({ aspect_ratio: 'auto', resolution: '1K', num_images: 1 });
  });

  test('Nano Banana 2.1 sends a thinking level and an ultra-wide ratio as given, on the edit endpoint and its text twin; none sends no thinking_level', async () => {
    const nb21 = model('google/nano-banana-2.1/edit', { '1K': '0.04' });
    expect((await bodyFor(req(nb21, { ratio: '1:8', thinking: 'medium' }))).body).toMatchObject({ aspect_ratio: '1:8', thinking_level: 'medium' });
    const text = await bodyFor(req(nb21, { imageUrls: [], ratio: '4:1', thinking: 'high' }));
    expect([text.url, text.body]).toEqual(['https://queue.fal.run/google/nano-banana-2.1', expect.objectContaining({ aspect_ratio: '4:1', thinking_level: 'high' })]);
    expect((await bodyFor(req(nb21))).body).not.toHaveProperty('thinking_level');
  });

  test("Try On's 14 photos on Nano Banana 2.1 (each about 400 KB once shrunk) go through fal storage, as inlined they pass the inline limit; 4 stay inlined", async () => {
    // fal's storage and queue: each initiate gets its own file URL, each PUT succeeds, the submit returns a request id.
    const storageFake = () => {
      const calls: { url: string; body: unknown }[] = [];
      let n = 0;
      const fn = (async (url: string, init: RequestInit = {}) => {
        calls.push({ url, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body });
        if (url.startsWith('https://rest.fal.ai/storage/upload/initiate')) return Response.json({ upload_url: `https://upload.test/${++n}`, file_url: `https://v3b.fal.media/files/p${n}.jpg` });
        if (url.startsWith('https://upload.test/')) return new Response('', { status: 200 });
        return Response.json({ request_id: 'r14' });
      }) as unknown as typeof fetch;
      return { fn, calls };
    };
    const photo = async () => ({ bytes: new Uint8Array(400_000), contentType: 'image/jpeg' });
    const photos = Array.from({ length: 14 }, (_, i) => `asset://p${i}`);
    const nb21 = { ...model('google/nano-banana-2.1/edit', { '1K': '0.04' }), maxImages: 14 };
    const many = storageFake();
    expect((await createFalImageProvider({ apiKey: 'k', fetch: many.fn, readImage: photo }).submit(req(nb21, { imageUrls: photos }))).providerJobId).toBe('r14');
    expect(many.calls.filter((c) => c.url.includes('/storage/upload/initiate'))).toHaveLength(14);
    const sent = (many.calls.at(-1)!.body as { image_urls: string[] }).image_urls;
    expect(new Set(sent).size).toBe(14);
    expect(sent.every((u) => u.startsWith('https://v3b.fal.media/files/'))).toBe(true);
    const four = storageFake();
    await createFalImageProvider({ apiKey: 'k', fetch: four.fn, readImage: photo }).submit(req(nb21, { imageUrls: photos.slice(0, 4) }));
    expect(four.calls).toHaveLength(1); // the submit alone: no upload
    expect((four.calls[0]!.body as { image_urls: string[] }).image_urls.every((u) => u.startsWith('data:image/jpeg;base64,'))).toBe(true);
  });

  test.each([
    ['fal-ai/nano-banana-pro/edit', 'fal-ai/nano-banana-pro'],
    ['google/nano-banana-2.1/edit', 'google/nano-banana-2.1'],
    ['fal-ai/nano-banana-2/edit', 'fal-ai/nano-banana-2'],
    ['fal-ai/nano-banana/edit', 'fal-ai/nano-banana'],
    ['openai/gpt-image-2/edit', 'openai/gpt-image-2'],
    ['bytedance/seedream/v5/pro/edit', 'bytedance/seedream/v5/pro/text-to-image'],
    ['bytedance/seedream/v5.5/edit', 'bytedance/seedream/v5.5/text-to-image'],
  ])('with no input image, %s goes to its text-to-image twin %s, with no images and no auto ratio', async (edit, text) => {
    const { url, body } = await bodyFor(req(model(edit, { '1K': '0.04' }), { imageUrls: [], ratio: 'auto' }));
    expect(url).toBe(`https://queue.fal.run/${text}`);
    expect(body).not.toHaveProperty('image_urls');
    expect(body).not.toHaveProperty('aspect_ratio');
    expect(body).toMatchObject({ prompt: 'a bottle on a table', num_images: 1 });
  });

  test('a model with no text-to-image twin refuses a job with no input image before any call', async () => {
    const { fn, calls } = fakeFetch();
    await expect(createFalImageProvider({ apiKey: 'k', fetch: fn }).submit(req(model('openai/gpt-image-2.5/flare/edit', { '1K': '0.21' }), { imageUrls: [] }))).rejects.toThrow(ImageReadError);
    expect(calls).toHaveLength(0);
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

  test('GPT Image 2 at 2K and 4K sends a custom size in the ratio, edges in multiples of 16, within the priced pixels and the schema limits', async () => {
    const gpt = model('openai/gpt-image-2/edit', { '1K': '0.21', '2K': '0.234', '4K': '0.413' });
    const sizeOf = async (r: ImageSubmitRequest, readImage?: Parameters<typeof bodyFor>[1]) => ((await bodyFor(r, readImage)).body as { image_size: { width: number; height: number } }).image_size;
    expect(await sizeOf(req(gpt, { ratio: '16:9', resolution: '2K' }))).toEqual({ width: 2560, height: 1440 });
    expect(await sizeOf(req(gpt, { ratio: '9:16', resolution: '4K' }))).toEqual({ width: 2160, height: 3840 });
    for (const [resolution, pixels] of [['2K', 2560 * 1440], ['4K', 3840 * 2160]] as const) {
      for (const ratio of ['1:1', '9:16', '16:9', '3:4', '4:3']) {
        const { width, height } = await sizeOf(req(gpt, { ratio, resolution }));
        const [w, h] = ratio.split(':').map(Number) as [number, number];
        expect([width % 16, height % 16, width * h - height * w]).toEqual([0, 0, 0]);
        expect(width * height).toBeLessThanOrEqual(pixels);
        expect(width * height).toBeGreaterThan(pixels * 0.95);
        expect(Math.max(width, height)).toBeLessThanOrEqual(3840);
      }
    }
    // auto: the shape of the first image (a 900x1200 png is 3:4), or square when the image cannot be measured.
    const png = new Uint8Array(33);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    new DataView(png.buffer).setUint32(16, 900);
    new DataView(png.buffer).setUint32(20, 1200);
    const readImage = async () => ({ bytes: png, contentType: 'image/png' });
    expect(await sizeOf(req(gpt, { ratio: 'auto', resolution: '4K', imageUrls: ['s3://in/1.png'] }), readImage)).toEqual({ width: 2448, height: 3264 });
    expect(await sizeOf(req(gpt, { ratio: 'auto', resolution: '2K' }))).toEqual({ width: 1920, height: 1920 });
  });

  test('GPT Image 2.5 Flare and Sunburst take the same body as GPT Image 2', async () => {
    for (const endpoint of ['openai/gpt-image-2.5/flare/edit', 'openai/gpt-image-2.5/sunburst/edit']) {
      const { url, body } = await bodyFor(req(model(endpoint, { '1K': '0.21' }), { ratio: '3:4' }));
      expect(url).toBe(`https://queue.fal.run/${endpoint}`);
      expect(body).toEqual({ prompt: 'a bottle on a table', image_urls: ['https://img/1.jpg', 'https://img/2.jpg'], image_size: 'portrait_4_3', quality: 'high', num_images: 1, output_format: 'png' });
    }
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

  test('Seedream 5.5 Edit takes the Pro body at its own endpoint, with sizes inside its 921,600 to 4,624,220 pixels and the 2K price tier above 2,610,000', async () => {
    const seed = model('bytedance/seedream/v5.5/edit', { '1K': '0.042', '2K': '0.0525' });
    expect(await bodyFor(req(seed, { ratio: 'auto', resolution: '1K' }))).toMatchObject({
      url: 'https://queue.fal.run/bytedance/seedream/v5.5/edit',
      body: { prompt: 'a bottle on a table', image_urls: ['https://img/1.jpg', 'https://img/2.jpg'], image_size: 'auto_1K', num_images: 1, output_format: 'png' },
    });
    for (const [resolution, min, max] of [['1K', 921_600, 2_610_000], ['2K', 2_610_001, 4_624_220]] as const) {
      for (const ratio of ['1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4', '21:9']) {
        const size = ((await bodyFor(req(seed, { ratio, resolution }))).body as { image_size: { width: number; height: number } }).image_size;
        expect(size.width * size.height, `${resolution} ${ratio}`).toBeGreaterThanOrEqual(min);
        expect(size.width * size.height, `${resolution} ${ratio}`).toBeLessThanOrEqual(max);
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

  // The apps of 2026-10-24. Field names and shapes are those of each endpoint's input schema.
  describe('image apps', () => {
    const app = (endpoint: string, price = '0.05') => model(endpoint, { '1K': price });
    const one = { imageUrls: ['https://img/1.jpg'] };
    const two = { imageUrls: ['https://img/1.jpg', 'https://img/2.jpg'] };
    const refuses = async (r: ImageSubmitRequest, message: RegExp, readImage?: Parameters<typeof bodyFor>[1]) => {
      const { fn, calls } = fakeFetch();
      const err = await createFalImageProvider({ apiKey: 'k', fetch: fn, readImage }).submit(r).catch((e: unknown) => e);
      expect([err instanceof ImageReadError, (err as Error).message]).toEqual([true, expect.stringMatching(message)]);
      expect(calls).toHaveLength(0);
    };
    /** A png header of the given size, which the adapters measure. */
    const png = (width: number, height: number) => {
      const b = new Uint8Array(33);
      b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      new DataView(b.buffer).setUint32(16, width);
      new DataView(b.buffer).setUint32(20, height);
      return b;
    };

    test('Character Swap and Model Swap send the images and the fixed prompt through the Nano Banana Pro body', async () => {
      const prompt = FEATURE_PROMPTS.character_swap!;
      expect(prompt).toBe('replace the whole person in the second image with the person from the first image, keep the background');
      expect(FEATURE_PROMPTS.model_swap).toBe('replace the person in the second image with the model from the first image, keep the clothing, pose and background exactly');
      expect((await bodyFor(req(PRO, { ...two, prompt, ratio: 'auto' }))).body).toEqual({
        prompt, image_urls: ['https://img/1.jpg', 'https://img/2.jpg'], aspect_ratio: 'auto', resolution: '1K', num_images: 1, output_format: 'png',
      });
    });

    test('Background Changer sends the reference image or the prompt, never both, and needs one of them', async () => {
      const bria = app('fal-ai/bria/background/replace', '0.04');
      expect((await bodyFor(req(bria, { ...one, prompt: 'a marble table', ratio: 'auto' }))).body).toEqual({ image_url: 'https://img/1.jpg', prompt: 'a marble table', num_images: 1 });
      expect((await bodyFor(req(bria, { ...two, prompt: FEATURE_PROMPTS.background_changer, ratio: 'auto' }))).body).toEqual({
        image_url: 'https://img/1.jpg', ref_image_url: 'https://img/2.jpg', num_images: 1,
      });
      await refuses(req(bria, { ...one, prompt: '  ', ratio: 'auto' }), /reference image or a prompt/);
    });

    test('Reframe sends the image and a width and height in the ratio, about one megapixel in multiples of 16', async () => {
      const reframe = app('fal-ai/ideogram/v3/reframe', '0.03');
      expect((await bodyFor(req(reframe, { ...one, ratio: '16:9' }))).body).toEqual({
        image_url: 'https://img/1.jpg', image_size: { width: 1360, height: 768 }, rendering_speed: 'TURBO', num_images: 1,
      });
      for (const ratio of ['1:1', '9:16', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4', '21:9']) {
        const { width, height } = ((await bodyFor(req(reframe, { ...one, ratio }))).body as { image_size: { width: number; height: number } }).image_size;
        expect([width % 16, height % 16]).toEqual([0, 0]);
        expect(width * height).toBeGreaterThan(900_000);
        expect(width * height).toBeLessThan(1_200_000);
      }
      await refuses(req(reframe, { ...one, ratio: 'auto' }), /needs a ratio, not auto/);
    });

    describe('Upscale', () => {
      const topaz = model('fal-ai/topaz/upscale/image', { '2K': '0.08', '4K': '0.08' });
      const readPng = (width: number, height: number) => async () => ({ bytes: png(width, height), contentType: 'image/png' });
      const upscaleReq = (resolution: string) => req(topaz, { imageUrls: ['asset://a'], resolution, ratio: 'auto' });
      const factor = async (width: number, height: number, resolution: string) =>
        ((await bodyFor(upscaleReq(resolution), readPng(width, height))).body as { upscale_factor: number }).upscale_factor;

      test('works out the factor that lands on the pixel budget of the resolution, from the image size', async () => {
        expect((await bodyFor(upscaleReq('2K'), readPng(1024, 1024))).body).toEqual({ image_url: expect.stringMatching(/^data:image\/png;base64,/), upscale_factor: 2, model: 'Standard V2' });
        expect(await factor(1000, 1000, '2K')).toBe(2.04); // 2048 x 2048 = 4.19 MP over 1 MP
        expect(await factor(1920, 1080, '4K')).toBe(2); // 3840 x 2160
        expect(await factor(1000, 1000, '4K')).toBe(2.88); // 8.29 MP over 1 MP
      });

      test('never asks for more than the 4x of the schema, and keeps the output inside the target', async () => {
        expect(await factor(200, 200, '4K')).toBe(4);
        for (const [w, h, resolution] of [[1234, 987, '2K'], [3000, 2000, '4K'], [641, 480, '4K']] as const) {
          const f = await factor(w, h, resolution);
          expect(f).toBeGreaterThanOrEqual(1);
          expect(w * f * (h * f)).toBeLessThanOrEqual(resolution === '2K' ? 2048 * 2048 : 3840 * 2160);
        }
      });

      test('an image at or over the target still goes through at factor 1, priced at the $0.08 tier while its output stays within 24 MP', async () => {
        expect(await factor(4032, 3024, '2K')).toBe(1); // 12.2 MP phone photo
        expect(await factor(4032, 3024, '4K')).toBe(1);
        expect(await factor(3000, 3000, '2K')).toBe(1);
        expect(await factor(6000, 4000, '4K')).toBe(1); // exactly 24 MP
      });

      test('refuses with ImageReadError, before any call, an image over 24 MP, an unknown resolution and an image it cannot measure', async () => {
        const refusal = async (r: ImageSubmitRequest, readImage: Parameters<typeof bodyFor>[1]) => {
          const { fn, calls } = fakeFetch();
          const err = await createFalImageProvider({ apiKey: 'k', fetch: fn, readImage }).submit(r).catch((e) => e);
          expect(calls).toHaveLength(0);
          return err;
        };
        const big = await refusal(upscaleReq('4K'), readPng(6001, 4000));
        expect(big).toBeInstanceOf(ImageReadError);
        expect(big.message).toMatch(/larger than the 24 MP/);
        expect(await refusal(upscaleReq('2K'), async () => ({ bytes: new Uint8Array(40), contentType: 'image/png' }))).toBeInstanceOf(ImageReadError);
        expect(await refusal(req(topaz, { imageUrls: ['https://img/1.jpg'], resolution: '2K', ratio: 'auto' }), undefined)).toBeInstanceOf(ImageReadError);
        await refuses(upscaleReq('1K'), /does not offer resolution 1K/, readPng(100, 100));
      });
    });

    test('Face Swap sends the source face and the target photo with its fixed prompt through the Nano Banana Pro body', async () => {
      const prompt = FEATURE_PROMPTS.face_swap!;
      expect(prompt).toBe('Swap the face from the first image onto the person in the second image.');
      expect((await bodyFor(req(PRO, { ...two, prompt, ratio: 'auto' }))).body).toEqual({
        prompt, image_urls: ['https://img/1.jpg', 'https://img/2.jpg'], aspect_ratio: 'auto', resolution: '1K', num_images: 1, output_format: 'png',
      });
    });

    describe('Multi-angle views', () => {
      const qwen = app('fal-ai/qwen-image-edit-2511-multiple-angles', '0.035');
      const view = (id: string | undefined, width = 1000, height = 1000) =>
        bodyFor(req(qwen, { imageUrls: ['asset://a'], prompt: FEATURE_PROMPTS.multi_angle!, ratio: 'auto', view: id }), async () => ({ bytes: png(width, height), contentType: 'image/png' }));

      test('turns the camera to each view, adds the fixed prompt and asks for one png', async () => {
        const angles: Record<string, [number, number]> = {};
        for (const v of PRODUCT_VIEWS) {
          const { url, body } = await view(v.id);
          expect(url).toBe('https://queue.fal.run/fal-ai/qwen-image-edit-2511-multiple-angles');
          expect(body).toMatchObject({ image_urls: [expect.stringMatching(/^data:image\/png;base64,/)], additional_prompt: FEATURE_PROMPTS.multi_angle, num_images: 1, output_format: 'png' });
          const { horizontal_angle, vertical_angle } = body as { horizontal_angle: number; vertical_angle: number };
          angles[v.id] = [horizontal_angle, vertical_angle];
        }
        // The schema: 0 front, 90 right side, 180 back, 270 left side; vertical 0 eye level, 60 high angle.
        expect(angles).toEqual({ back: [180, 0], left: [270, 0], right: [90, 0], 'three-quarter-left': [315, 0], 'three-quarter-right': [45, 0], 'back-three-quarter-right': [135, 0], 'back-three-quarter-left': [225, 0], top: [0, 60] });
      });

      test('keeps the output within one megapixel in the shape of the input, so a view costs its one 1K price', async () => {
        expect(((await view('back', 1000, 1000)).body as { image_size: unknown }).image_size).toEqual({ width: 992, height: 992 });
        for (const [w, h] of [[3000, 4000], [1080, 1920], [4000, 3000], [5000, 1000], [600, 600]] as const) {
          const { width, height } = ((await view('left', w, h)).body as { image_size: { width: number; height: number } }).image_size;
          expect([width % 16, height % 16]).toEqual([0, 0]);
          expect(width * height).toBeLessThanOrEqual(1_000_000);
          expect(width * height).toBeGreaterThan(900_000);
          expect(Math.abs(Math.log(width / height) - Math.log(w / h))).toBeLessThan(0.05);
        }
        expect(imageEstimate({ model: qwen, resolution: '1K' })).toEqual({ costUsd: 0.035, costSource: 'estimate' }); // $0.035 x 1 megapixel
      });

      test('refuses a job without a known view before any call', async () => {
        await refuses(req(qwen, { ...one, view: undefined }), /needs a view, not undefined/);
        await refuses(req(qwen, { ...one, view: 'under' }), /needs a view, not under/);
      });
    });

    test('Background Remover sends the image only, even if a prompt is stored', async () => {
      expect((await bodyFor(req(app('fal-ai/bria/background/remove', '0.018'), { ...one, prompt: FEATURE_PROMPTS.background_remover, ratio: 'auto' }))).body).toEqual({ image_url: 'https://img/1.jpg' });
    });
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

  test('a submit fal turned away (429, 503) or never reached is sent again, up to twice; one that may have reached fal is not', async () => {
    const waits: number[] = [];
    const pause = async (ms: number) => void waits.push(ms);
    const submit = (fn: typeof fetch) => createFalImageProvider({ apiKey: 'k', fetch: fn, pause }).submit(req(PRO));

    const busy = fakeFetch([503, {}], [429, {}], [200, { request_id: 'r1' }]);
    expect((await submit(busy.fn)).providerJobId).toBe('r1');
    expect(busy.calls).toHaveLength(3);
    expect(waits).toEqual([2_000, 2_000]); // no Retry-After: the 2 s floor

    const limited = fakeFetch([429, {}], [429, {}], [429, {}], [200, { request_id: 'late' }]);
    expect((await submit(limited.fn).catch((e: ProviderHttpError) => e.status))).toBe(429); // given up after 3 tries
    expect(limited.calls).toHaveLength(3);

    for (const status of [500, 502, 504]) {
      const maybeTaken = fakeFetch([status, {}], [200, { request_id: 'twice' }]);
      expect(await submit(maybeTaken.fn).catch((e: ProviderHttpError) => e.status)).toBe(status);
      expect(maybeTaken.calls).toHaveLength(1);
    }

    const fail = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) });
    const flaky = (code: string) => {
      let n = 0;
      return (async () => (n++ === 0 ? Promise.reject(fail(code)) : new Response(JSON.stringify({ request_id: 'r2' })))) as unknown as typeof fetch;
    };
    expect((await submit(flaky('ECONNREFUSED'))).providerJobId).toBe('r2'); // never connected: sent again
    await expect(submit(flaky('ECONNRESET'))).rejects.toThrow('fetch failed'); // dropped mid-call: may have reached fal
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

  test.each([
    ['image', { image: { url: 'https://v3.fal.media/b.png', content_type: 'image/png', file_name: 'b.png', file_size: 1, width: 10, height: 10 } }],
    ['images', { images: [{ url: 'https://v3.fal.media/b.png' }], seed: 1 }],
  ])('a result with %s (Topaz, Face Swap and Remover answer image; Reframe and Bria Replace answer images) gives its url', async (_what, out) => {
    expect(await provider([200, { status: 'COMPLETED' }], [200, out]).p.status(job)).toMatchObject({ state: 'succeeded', outputUrl: 'https://v3.fal.media/b.png' });
  });

  test('COMPLETED with an error or an empty result is failed and still carries the price; a 4xx result is failed at no cost', async () => {
    expect(await provider([200, { status: 'COMPLETED', error: 'content policy', error_type: 'content_policy_violation' }]).p.status(job)).toEqual({
      state: 'failed', error: 'content policy', costUsd: 0.3, costSource: 'estimate',
    });
    expect(await provider([200, { status: 'COMPLETED' }], [200, { images: [] }]).p.status(job)).toMatchObject({ state: 'failed', error: 'fal result has no images[0].url or image.url' });
    expect(await provider([200, { status: 'COMPLETED' }], [422, { detail: 'image_too_large' }]).p.status(job)).toMatchObject({ state: 'failed', error: expect.stringContaining('422'), costUsd: 0 });
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
