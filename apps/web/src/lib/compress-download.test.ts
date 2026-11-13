import { afterEach, expect, test, vi } from 'vitest';
import { compressedName, downloadCompressed } from './compress-download';
import { decodeOptimizerImage, optimizeImage } from './media-optimizer';

vi.mock('./media-optimizer', () => ({ decodeOptimizerImage: vi.fn(), optimizeImage: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

test('the compressed copy is named after the result with -nen and the WebP extension', () => {
  expect(compressedName('20261114-an-1a2b3c4d.png')).toBe('20261114-an-1a2b3c4d-nen.webp');
  expect(compressedName('photo.v2.jpg')).toBe('photo.v2-nen.webp');
  expect(compressedName('noext')).toBe('noext-nen.webp');
});

/** Runs the helper on a 1000-byte original with the optimizer stubbed to return `compressedBytes`, and tells what was saved. */
async function run(compressedBytes: number, name?: string) {
  const saved: { download: string; href: string }[] = [];
  const blobs: Blob[] = [];
  const close = vi.fn();
  vi.mocked(decodeOptimizerImage).mockResolvedValue({ width: 10, height: 20, close } as unknown as ImageBitmap);
  vi.mocked(optimizeImage).mockResolvedValue(new Blob([new Uint8Array(compressedBytes)], { type: 'image/webp' }));
  vi.stubGlobal('fetch', async (path: string) => {
    if (path === '/api/assets/a1') return Response.json({ mime: 'image/png', filename: 'out.png' });
    expect(path).toBe('/api/assets/a1/content');
    return new Response(new Uint8Array(1000), { headers: { 'content-type': 'image/png' } });
  });
  vi.stubGlobal('document', { createElement: () => ({ click() { saved.push({ download: (this as unknown as HTMLAnchorElement).download, href: (this as unknown as HTMLAnchorElement).href }); }, remove() {} }), body: { append() {} } });
  vi.stubGlobal('URL', { createObjectURL: (b: Blob) => (blobs.push(b), `blob:${blobs.length}`), revokeObjectURL() {} });
  const smaller = await downloadCompressed('a1', name);
  return { smaller, saved, blobs, close };
}

test('a smaller WebP is saved under the -nen name, from the original size', async () => {
  const { smaller, saved, blobs, close } = await run(400, '20261114-an-1a2b3c4d.png');
  expect(smaller).toBe(true);
  expect(saved).toEqual([{ download: '20261114-an-1a2b3c4d-nen.webp', href: 'blob:1' }]);
  expect(blobs[0]!.size).toBe(400);
  expect(vi.mocked(optimizeImage)).toHaveBeenLastCalledWith(expect.anything(), 10, 20, 'image/webp');
  expect(close).toHaveBeenCalled();
});

test('a copy that is not smaller leaves the original saved under its own name', async () => {
  const { smaller, saved, blobs } = await run(1000);
  expect(smaller).toBe(false);
  expect(saved).toEqual([{ download: 'out.png', href: 'blob:1' }]); // no name given: the asset's own filename
  expect(blobs[0]!.size).toBe(1000);
  expect(blobs[0]!.type).toBe('image/png');
});
