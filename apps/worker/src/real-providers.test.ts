// The real adapters are wired by key, and read input assets from the bucket; fetch is faked, so no test reaches a provider.
import { BAKEOFF_MODELS } from '@cvs/core/models';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { assetReader, cropToRatio, fitForInline, MAX_INLINE_BYTES, realProviders } from './real-providers';

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

  test('wires Vertex image models from the key file, with the project from the env or else the key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cvs-vertex-'));
    const file = join(dir, 'key.json');
    writeFileSync(file, JSON.stringify({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: 'unused', project_id: 'from-key' }));
    try {
      const vertex = realProviders(pool([]), { GOOGLE_APPLICATION_CREDENTIALS: file });
      expect([Object.keys(vertex.providers), Object.keys(vertex.imageProviders!)]).toEqual([[], ['vertex']]);
      writeFileSync(file, JSON.stringify({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: 'unused' }));
      expect(Object.keys(realProviders(pool([]), { GOOGLE_APPLICATION_CREDENTIALS: file, GOOGLE_CLOUD_PROJECT: 'p' }).imageProviders!)).toEqual(['vertex']);
      expect(() => realProviders(pool([]), { GOOGLE_APPLICATION_CREDENTIALS: file })).toThrow(/GOOGLE_CLOUD_PROJECT/);
    } finally {
      rmSync(dir, { recursive: true });
    }
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

describe('cropToRatio', () => {
  test('centre-crops to the ratio, never enlarging', async () => {
    const size = async (out: { bytes: Uint8Array }) => sharp(out.bytes).metadata().then((m) => [m.width, m.height]);
    const wide = await png(1200, 800);
    expect(await size(await cropToRatio(wide, '9:16'))).toEqual([450, 800]);
    expect(await size(await cropToRatio(wide, '1:1'))).toEqual([800, 800]);
    expect(await size(await cropToRatio(await png(300, 1000), '1:1'))).toEqual([300, 300]);
    expect((await cropToRatio(await png(40, 40, false, true), '9:16')).contentType).toBe('image/png'); // transparency kept
    await expect(cropToRatio(wide, 'auto')).rejects.toThrow('cannot crop');
  });

  test('a fal endpoint that follows the input image gets the asset cropped to the chosen ratio', async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ request_id: 'req-2' }));
    });
    const wide = await png(1200, 800);
    const { providers } = realProviders(pool([asset]), { FAL_KEY: 'k' }, async () => wide);
    const model = { ...BAKEOFF_MODELS[0]!, endpoint: 'fal-ai/kling-video/v3/pro/image-to-video' };
    await providers.fal!.submit({ model, prompt: 'p', imageUrls: ['asset://a1'], ratio: '9:16', durationSec: 5 });
    const sent = Buffer.from((bodies[0]!.start_image_url as string).split(',')[1]!, 'base64');
    expect(await sharp(sent).metadata().then((m) => [m.width, m.height])).toEqual([450, 800]);
    expect(bodies[0]).toEqual({ prompt: 'p', start_image_url: expect.any(String), duration: '5', generate_audio: false });
  });
});

describe('assetReader', () => {
  test('reads the bytes and type of an asset, and refuses one that is gone', async () => {
    expect(await assetReader(pool([asset]), read)('asset://a1')).toEqual({ bytes: small, contentType: 'image/png' });
    await expect(assetReader(pool([]), read)('asset://gone')).rejects.toThrow('asset not found');
  });

  test('passes a video through untouched, even when a crop is asked for', async () => {
    const video = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]);
    expect(await assetReader(pool([{ s3_key: 'assets/v1', mime: 'video/mp4' }]), async () => video)('asset://v1', { ratio: '9:16' })).toEqual({ bytes: video, contentType: 'video/mp4' });
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
