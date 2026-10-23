import { afterEach, expect, test, vi } from 'vitest';
import { MAX_PLAYING, playingCount, releaseSlot, requestSlot } from './play-slots';

const ids = Array.from({ length: MAX_PLAYING + 2 }, (_, i) => `p${i}`);
afterEach(() => ids.forEach(releaseSlot));

test('only MAX_PLAYING previews start, the rest wait their turn in order', () => {
  const starts = ids.map(() => vi.fn());
  ids.forEach((id, i) => requestSlot(id, starts[i]!));
  expect(starts.filter((s) => s.mock.calls.length > 0)).toHaveLength(MAX_PLAYING);
  expect(playingCount()).toBe(MAX_PLAYING);

  releaseSlot('p1');
  expect(starts[MAX_PLAYING]).toHaveBeenCalledTimes(1);
  expect(starts[MAX_PLAYING + 1]).not.toHaveBeenCalled();
  expect(playingCount()).toBe(MAX_PLAYING);
});

test('a waiting preview that leaves never starts, and asking twice starts once', () => {
  const first = vi.fn();
  requestSlot('p0', first);
  requestSlot('p0', first);
  expect(first).toHaveBeenCalledTimes(1);

  for (const id of ids.slice(1, MAX_PLAYING)) requestSlot(id, vi.fn());
  const late = vi.fn();
  requestSlot(ids[MAX_PLAYING]!, late);
  releaseSlot(ids[MAX_PLAYING]!);
  releaseSlot('p0');
  expect(late).not.toHaveBeenCalled();
});
