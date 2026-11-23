import { afterEach, expect, test, vi } from 'vitest';
import { compressedName, downloadCompressed, downloadReframedVideo } from './compress-download';
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

test('a reframed video is asked for once, polled until ready, and saved named with its shape; a failed one throws', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    const calls: string[] = [];
    let state = 'working';
    vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      return Response.json(state === 'ready' ? { status: state, downloadUrl: '/api/assets/a1/download?t=x&variant=reframed&ratio=4:5&fill=black' } : { status: state });
    });
    const saved: { download: string; href: string }[] = [];
    vi.stubGlobal('document', { createElement: () => ({ click() { saved.push({ download: (this as unknown as HTMLAnchorElement).download, href: (this as unknown as HTMLAnchorElement).href }); }, remove() {} }), body: { append() {} } });
    const done = downloadReframedVideo('a1', '4:5', 'black', '20261124-an-1a2b3c4d.mp4');
    await vi.advanceTimersByTimeAsync(2_000);
    state = 'ready';
    await vi.advanceTimersByTimeAsync(2_000);
    await done;
    expect(calls).toEqual(['POST /api/assets/a1/reframe?ratio=4:5&fill=black', 'GET /api/assets/a1/reframe?ratio=4:5&fill=black', 'GET /api/assets/a1/reframe?ratio=4:5&fill=black']);
    expect(saved).toEqual([{ download: '20261124-an-1a2b3c4d-4x5.mp4', href: '/api/assets/a1/download?t=x&variant=reframed&ratio=4:5&fill=black' }]);

    state = 'failed';
    await expect(downloadReframedVideo('a1', '9:16', 'blur')).rejects.toThrow('reframe failed');
    expect(saved).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});
