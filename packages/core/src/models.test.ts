import { describe, expect, test } from 'vitest';
import { BAKEOFF_MODELS, estimateUsd, validateRequest } from './models';

describe.each(BAKEOFF_MODELS)('$id', (model) => {
  const ok = { ratio: '9:16', durationSec: 5, imageCount: 1 };

  test('accepts the thrift settings', () => {
    expect(validateRequest(model, { ...ok, durationSec: model.thrift!.durationSec })).toBeNull();
    expect(validateRequest(model, { ...ok, ratio: '1:1', imageCount: model.maxImages })).toBeNull();
  });

  test.each([
    ['16:9', { ratio: '16:9' }],
    ['4 s', { durationSec: 4 }],
    ['11 s', { durationSec: 11 }],
    ['too many images', { imageCount: model.maxImages + 1 }],
    ['no images', { imageCount: 0 }],
  ])('rejects %s', (_name, change) => {
    expect(validateRequest(model, { ...ok, ...change })).not.toBeNull();
  });

  test('every fact has a source with a URL (or a repo path for a measurement) and a read date', () => {
    for (const field of ['ratios', 'durationsSec', 'maxImages', 'outputResolution', 'usdPerSecond', 'billedAmountField']) {
      expect(model.sources[field]?.url).toMatch(/^(https:\/\/|scripts\/)/);
      expect(model.sources[field]?.readAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

test('ids and labels match the rows seeded by migration 0002, and Kling carries the resolution B.5a measured', () => {
  expect(BAKEOFF_MODELS.map((m) => [m.id, m.label])).toEqual([['kling-o3-pro', 'Kling O3 Pro'], ['seedance-2.5', 'Seedance 2.5']]);
  expect(BAKEOFF_MODELS.map((m) => m.outputResolution)).toEqual(['1080p', '720p']);
});

test('estimates the cost of a thrift clip and of an 8 s staff clip', () => {
  const [kling, seedance] = BAKEOFF_MODELS;
  expect(estimateUsd(kling!.usdPerSecond, kling!.thrift!.durationSec)).toBe('0.5600');
  expect(estimateUsd(seedance!.usdPerSecond, seedance!.thrift!.durationSec)).toBe('1.1560');
  expect(estimateUsd(kling!.usdPerSecond, 8)).toBe('0.8960');
  expect(estimateUsd(seedance!.usdPerSecond, 8)).toBe('1.8496');
});
