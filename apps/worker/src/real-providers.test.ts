// The real adapters are wired by key, and read input assets from the bucket; fetch is faked, so no test reaches a provider.
import { BAKEOFF_MODELS } from '@cvs/core/models';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { assetReader, realProviders } from './real-providers';

const asset = { s3_key: 'inputs/a1', mime: 'image/png' };
const pool = (rows: unknown[]) => ({ query: vi.fn(async () => ({ rows })) }) as never;
const read = vi.fn(async () => new Uint8Array([1, 2, 3]));

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
    expect(calls).toEqual([{ url: 'https://queue.fal.run/fal-ai/kling-video/o3/pro/reference-to-video', body: expect.objectContaining({ image_urls: ['data:image/png;base64,AQID'], duration: '5' }) }]);
    expect(read).toHaveBeenCalledWith('inputs/a1');
  });
});

describe('assetReader', () => {
  test('reads the bytes and type of an asset, and refuses one that is gone', async () => {
    expect(await assetReader(pool([asset]), read)('asset://a1')).toEqual({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' });
    await expect(assetReader(pool([]), read)('asset://gone')).rejects.toThrow('asset not found');
  });
});
