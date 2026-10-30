import { describe, expect, test } from 'vitest';
import { BAKEOFF_MODELS, estimateUsd, imagePricesFor, PROMPT_CEILING, promptLimit, usdPerSecondFor, validateRequest } from './models';

describe.each(BAKEOFF_MODELS)('$id', (model) => {
  const ok = { ratio: '9:16', durationSec: 5, imageCount: 1 };

  test('accepts the thrift settings', () => {
    expect(validateRequest(model, { ...ok, durationSec: model.thrift!.durationSec })).toBeNull();
    expect(validateRequest(model, { ...ok, ratio: '1:1', imageCount: model.maxImages })).toBeNull();
  });

  test.each([
    ['4:3', { ratio: '4:3' }],
    ['2 s', { durationSec: 2 }],
    ['16 s', { durationSec: 16 }],
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

test('audio on takes the endpoint audio price, audio off or absent the stored price, and an endpoint without audio has none', () => {
  const kling = { endpoint: 'fal-ai/kling-video/o3/pro/reference-to-video', usdPerSecond: 0.112 };
  expect(usdPerSecondFor(kling, 'on')).toBe(0.14);
  expect(usdPerSecondFor(kling, 'off')).toBe(0.112);
  expect(usdPerSecondFor(kling, undefined)).toBe(0.112);
  expect(usdPerSecondFor({ endpoint: 'fal-ai/wan/v2.7/reference-to-video', usdPerSecond: 0.1 }, 'on')).toBeUndefined();
  expect(usdPerSecondFor({ endpoint: 'constructor', usdPerSecond: 0.1 }, 'on')).toBeUndefined();
});

test('a model’s prompt limit is its own, never past the ceiling', () => {
  expect([promptLimit(2000), promptLimit(4096), promptLimit(50000)]).toEqual([2000, 4096, PROMPT_CEILING]);
  expect(PROMPT_CEILING).toBe(5000);
});

test('an image job is priced at its thinking level, the default (first) level when it names none, and at image_prices on a model without level prices', () => {
  const row = { image_prices: { '1K': '0.04' }, thinking_levels: ['minimal', 'medium', 'high'], thinking_prices: { minimal: { '1K': '0.05' }, high: { '1K': '0.0618' } } };
  expect(imagePricesFor(row, 'high')).toEqual({ '1K': '0.0618' });
  expect(imagePricesFor(row)).toEqual({ '1K': '0.05' });
  expect(imagePricesFor(row, 'medium')).toEqual(row.image_prices);
  expect(imagePricesFor(row, 'constructor')).toEqual(row.image_prices);
  expect(imagePricesFor({ ...row, thinking_levels: [], thinking_prices: null })).toEqual(row.image_prices);
});
