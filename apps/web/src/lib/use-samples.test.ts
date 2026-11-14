import { afterEach, beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ok = (names: string[]) => new Response(JSON.stringify({ samples: names.map((name) => ({ name, version: 'v1' })) }), { status: 200 });

test('a failed sample list is never kept: it reports the failure, tries again on a timer and clears once the server answers', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(new Response('', { status: 524 })).mockResolvedValue(ok(['example-1.mp4']));
  vi.stubGlobal('fetch', fetch);
  const m = await import('./use-samples');
  m.reloadSamples();
  await vi.waitFor(() => expect(m.samplesFailed()).toBe(true));
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(m.RETRY_MS[0]!); // the second try answers 524: still failed, and a later try is due
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(m.samplesFailed()).toBe(true);
  await vi.advanceTimersByTimeAsync(m.RETRY_MS[1]!);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(m.samplesFailed()).toBe(false);
  expect(m.versionedSample('/api/samples/example-1.mp4')).toBe('/api/samples/example-1.mp4?v=v1');
  await vi.advanceTimersByTimeAsync(60_000); // a success stops the timer
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('the timer gives up after the last wait; the next page that needs the list asks again', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('network'));
  vi.stubGlobal('fetch', fetch);
  const m = await import('./use-samples');
  m.reloadSamples();
  for (const wait of m.RETRY_MS) await vi.advanceTimersByTimeAsync(wait);
  expect(fetch).toHaveBeenCalledTimes(1 + m.RETRY_MS.length);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(fetch).toHaveBeenCalledTimes(1 + m.RETRY_MS.length);
  m.reloadSamples();
  expect(fetch).toHaveBeenCalledTimes(2 + m.RETRY_MS.length);
});
