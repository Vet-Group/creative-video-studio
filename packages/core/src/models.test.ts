import { describe, expect, test } from 'vitest';
import { BAKEOFF_MODELS, estimateUsd, imagePricesFor, PROMPT_CEILING, promptLimit, usdPerSecondFor, usdPerSecondWithVideo, validateRequest } from './models';

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

test('ids and labels match the row seeded by migration 0002, and Kling carries the resolution B.5a measured', () => {
  expect(BAKEOFF_MODELS.map((m) => [m.id, m.label])).toEqual([['kling-o3-pro', 'Kling O3 Pro']]);
  expect(BAKEOFF_MODELS.map((m) => m.outputResolution)).toEqual(['1080p']);
});

test('estimates the cost of a thrift clip and of an 8 s staff clip', () => {
  const [kling] = BAKEOFF_MODELS;
  expect(estimateUsd(kling!.usdPerSecond, kling!.thrift!.durationSec)).toBe('0.5600');
  expect(estimateUsd(kling!.usdPerSecond, 8)).toBe('0.8960');
});

test('audio on takes the endpoint audio price, audio off or absent the stored price, an always-audio endpoint its stored price, and an endpoint without audio has none', () => {
  const kling = { endpoint: 'fal-ai/kling-video/o3/pro/reference-to-video', usdPerSecond: 0.112 };
  expect(usdPerSecondFor(kling, 'on')).toBe(0.14);
  expect(usdPerSecondFor(kling, 'off')).toBe(0.112);
  expect(usdPerSecondFor(kling, undefined)).toBe(0.112);
  expect(usdPerSecondFor({ endpoint: 'fal-ai/wan/v2.7/reference-to-video', usdPerSecond: 0.1 }, 'on')).toBe(0.1); // always makes sound (0060)
  expect(usdPerSecondFor({ endpoint: 'fal-ai/wan/v2.7/reference-to-video', usdPerSecond: 0.1 }, 'off')).toBe(0.1);
  expect(usdPerSecondFor({ endpoint: 'fal-ai/kling-video/o1/reference-to-video', usdPerSecond: 0.112 }, 'on')).toBeUndefined();
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

describe('a reference video prices the Run (fal model pages, read 2026-11-06)', () => {
  const bill = (endpoint: string, out: number, ref: number) => estimateUsd(usdPerSecondWithVideo(endpoint, 0.37, out, ref), out);

  test('Seedance bills the input seconds too, at the x0.6 video rate', () => {
    expect(bill('bytedance/seedance-2.0/us/reference-to-video', 8, 5)).toBe('2.8860'); // 0.222 x (8 + 5)
    expect(bill('bytedance/seedance-2.5/us/reference-to-video', 10, 3)).toBe('3.6894'); // 0.2838 x (10 + 3)
  });

  test('Kling O3 bills the output seconds only, at $0.168 whatever the audio switch says', () => {
    expect(bill('fal-ai/kling-video/o3/pro/reference-to-video', 10, 15)).toBe('1.6800');
  });

  test('an endpoint that does not bill references keeps its own rate', () => {
    expect(usdPerSecondWithVideo('google/gemini-omni-flash/v1.2/reference-to-video', 0.0819, 8, 5)).toBe(0.0819);
    expect(usdPerSecondWithVideo('constructor', 0.5, 8, 5)).toBe(0.5);
  });
});

describe('the Seedance token math at 720p, whatever the ratio', () => {
  // fal's schema gives no output size per ratio; its own limits text calls a 3:4 clip "~720p (834x1112)", about 0.93 Mpx, and the page's "$0.37/second" fits 1280x720 (0.92 Mpx).
  // So "720p" is a pixel-area tier shared by every ratio (a 1:1 clip is taken as 960x960, UNVERIFIED), not a 720 px side: 720x720 would be 45% cheaper than the flat rate.
  const perSecond = (w: number, h: number) => (w * h * 24 * 0.0168) / 1024 / 1000;

  test('1280x720, 720x1280, 834x1112 and 960x960 all land on the flat rate of the model page; 720x720 does not', () => {
    for (const [w, h] of [[1280, 720], [720, 1280], [834, 1112], [960, 960]] as const) expect(perSecond(w, h)).toBeCloseTo(0.37, 1);
    expect(perSecond(720, 720)).toBeLessThan(0.21);
  });

  test('so the estimate is the same for 9:16, 1:1 and 16:9', () => {
    expect(estimateUsd(usdPerSecondWithVideo('bytedance/seedance-2.0/us/reference-to-video', 0.37, 5, 5), 5)).toBe('2.2200');
  });
});
