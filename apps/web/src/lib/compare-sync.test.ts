import { expect, test } from 'vitest';
import { DRIFT_SECONDS, mirrorOf } from './compare-sync';

const at = (currentTime: number, paused = true, ended = false) => ({ currentTime, paused, ended });

test('playing one video plays the other, and pausing one pauses it', () => {
  expect(mirrorOf(at(0, false), at(0, true)).play).toBe(true);
  expect(mirrorOf(at(3, true), at(3, false)).play).toBe(false);
  expect(mirrorOf(at(3, false), at(3, false)).play).toBeNull();
});

test('a seek moves the other video, but a small drift or an echo of its own seek does not', () => {
  expect(mirrorOf(at(4), at(0)).seek).toBe(4);
  expect(mirrorOf(at(4), at(4 + DRIFT_SECONDS / 2)).seek).toBeNull();
});

test('a video that reached its end leaves the longer one playing', () => {
  expect(mirrorOf(at(5, true, true), at(5, false)).play).toBeNull();
});
