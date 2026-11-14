import { expect, test, vi } from 'vitest';

const getObject = vi.fn(async () => new ReadableStream<Uint8Array>());
vi.mock('./storage', () => ({ getObject }));
vi.mock('./auth', () => ({ pool: {} }));
vi.mock('@cvs/db/client', () => ({ createDb: () => ({}) }));

test("a streamed file reads from storage under the browser request's signal, whole or by range, so a dropped request frees its socket", async () => {
  const { streamAsset } = await import('./assets');
  const asset = { s3Key: 'samples/a.mp4', bytes: 1000, mime: 'video/mp4', filename: 'a.mp4' };
  const whole = new Request('http://x/api/samples/a.mp4');
  expect((await streamAsset(whole, asset, 'inline')).status).toBe(200);
  expect(getObject).toHaveBeenLastCalledWith('samples/a.mp4', undefined, whole.signal);
  const part = new Request('http://x/api/samples/a.mp4', { headers: { range: 'bytes=0-99' } });
  expect((await streamAsset(part, asset, 'inline')).status).toBe(206);
  expect(getObject).toHaveBeenLastCalledWith('samples/a.mp4', 'bytes=0-99', part.signal);
});
