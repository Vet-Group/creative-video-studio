// The real adapters are wired by key, and read input assets from the bucket; fetch is faked, so no test reaches a provider.
import { BAKEOFF_MODELS } from '@cvs/core/models';
import sharp from 'sharp';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { assetReader, fitForInline, MAX_INLINE_BYTES, realProviders } from './real-providers';

const asset = { s3_key: 'inputs/a1', mime: 'image/png' };
const pool = (rows: unknown[]) => ({ query: vi.fn(async () => ({ rows })) }) as never;
const png = (w: number, h: number, noise = false, alpha = false) => {
  const c = alpha ? 4 : 3;
  return sharp(noise ? Buffer.from(Array.from({ length: w * h * c }, (_, i) => (i * 7919 + (i >> 5) * 104729) % 251)) : Buffer.alloc(w * h * c, 200), { raw: { width: w, height: h, channels: c } })
    .png().toBuffer().then((b) => new Uint8Array(b));
};
const small = await png(4, 4);
const read = vi.fn(async () => small);
const SMALL_URL = `data:image/png;base64,${Buffer.from(small).toString('base64')}`;

afterEach(() => vi.unstubAllGlobals());

describe('realProviders', () => {
  test('wires fal (video and image) and Replicate only when their keys are set', () => {
    expect(realProviders(pool([]), {})).toEqual({ providers: {}, imageProviders: {} });
    const fal = realProviders(pool([]), { FAL_KEY: 'k' });
    expect([Object.keys(fal.providers), Object.keys(fal.imageProviders!)]).toEqual([['fal'], ['fal']]);
    const both = realProviders(pool([]), { FAL_KEY: 'k', REPLICATE_API_TOKEN: 't' });
    expect([Object.keys(both.providers), Object.keys(both.imageProviders!)]).toEqual([['fal', 'replicate'], ['fal']]);
  });

  test('submits a Kling job to fal with the input asset inlined from the bucket', async () => {
    const calls: { url: string; body: { image_urls: string[]; duration: string } }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ request_id: 'req-1' }));
    });
    const { providers } = realProviders(pool([asset]), { FAL_KEY: 'k' }, read);
    const out = await providers.fal!.submit({ model: BAKEOFF_MODELS[0]!, prompt: 'p', imageUrls: ['asset://a1'], ratio: '9:16', durationSec: 5 });
    expect(out).toEqual({ providerJobId: '5:req-1' });
    expect(calls).toEqual([{ url: 'https://queue.fal.run/fal-ai/kling-video/o3/pro/reference-to-video', body: expect.objectContaining({ image_urls: [SMALL_URL], duration: '5' }) }]);
    expect(read).toHaveBeenCalledWith('inputs/a1');
  });
});

describe('assetReader', () => {
  test('reads the bytes and type of an asset, and refuses one that is gone', async () => {
    expect(await assetReader(pool([asset]), read)('asset://a1')).toEqual({ bytes: small, contentType: 'image/png' });
    await expect(assetReader(pool([]), read)('asset://gone')).rejects.toThrow('asset not found');
  });
});

describe('fitForInline', () => {
  test('passes a small image through untouched', async () => {
    expect(await fitForInline(small, 'image/png')).toEqual({ bytes: small, contentType: 'image/png' });
  });

  test('shrinks a large or oversized image to a JPEG of at most 2048 px and MAX_INLINE_BYTES', async () => {
    for (const big of [await png(2600, 1400, true), await png(3000, 400)]) {
      const out = await fitForInline(big, 'image/png');
      const meta = await sharp(out.bytes).metadata();
      expect([out.contentType, meta.format, out.bytes.byteLength <= MAX_INLINE_BYTES, Math.max(meta.width!, meta.height!) <= 2048]).toEqual(['image/jpeg', 'jpeg', true, true]);
    }
  }, 60_000);

  test('keeps the transparency of a large PNG with alpha (WebP)', async () => {
    const out = await fitForInline(await png(2600, 1400, true, true), 'image/png');
    const meta = await sharp(out.bytes).metadata();
    expect([out.contentType, meta.format, meta.hasAlpha, out.bytes.byteLength <= MAX_INLINE_BYTES]).toEqual(['image/webp', 'webp', true, true]);
  }, 60_000);

  test('refuses bytes that are not an image', async () => {
    await expect(fitForInline(new Uint8Array([1, 2, 3]), 'image/png')).rejects.toThrow();
  });
});
