import { describe, expect, test } from 'vitest';
import { mp4DurationMs, mp4VideoInfo } from './assets';
import { mp4Fixture } from './mp4-fixture';

describe('mp4VideoInfo', () => {
  test('reads the picture size and the average frame rate of the video track', () => {
    expect(mp4VideoInfo(mp4Fixture({ ms: 5000, width: 720, height: 1280, fps: 30 }))).toEqual({ width: 720, height: 1280, fps: 30 });
    expect(mp4VideoInfo(mp4Fixture({ ms: 4000, width: 1920, height: 1080, fps: 24 }))).toEqual({ width: 1920, height: 1080, fps: 24 });
  });

  test('swaps the size when the matrix turns the picture a quarter, as a phone clip does', () => {
    expect(mp4VideoInfo(mp4Fixture({ ms: 5000, width: 1920, height: 1080, fps: 30, turned: true }))).toEqual({ width: 1080, height: 1920, fps: 30 });
  });

  test('gives a null frame rate when the sample table says nothing, and nothing when there is no video track', () => {
    expect(mp4VideoInfo(mp4Fixture({ ms: 5000, width: 640, height: 360 }))).toEqual({ width: 640, height: 360, fps: null });
    expect(mp4VideoInfo(mp4Fixture({ ms: 5000 }))).toBeUndefined();
    expect(mp4VideoInfo(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });

  test('the fixture keeps the movie length mp4DurationMs reads', () => {
    expect(mp4DurationMs(mp4Fixture({ ms: 7400, width: 640, height: 360, fps: 30, size: 4096 }))).toBe(7400);
  });
});
