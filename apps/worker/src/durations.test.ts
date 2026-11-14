import { describe, expect, test } from 'vitest';
import { planDuration, shorterClipCost } from './durations';

describe('shorterClipCost', () => {
  test('scales the cost to the seconds a shorter clip plays, rounded up', () => {
    expect(shorterClipCost(0.756, 6, 3.7)).toBeCloseTo((0.756 * 4) / 6, 6); // 6 s asked, 3.7 s played
    expect(shorterClipCost(2.016, 16, 4.5)).toBeCloseTo((2.016 * 5) / 16, 6);
  });

  test('keeps the cost for a clip that rounds up to the length, is longer, or has no readable length', () => {
    expect(shorterClipCost(0.63, 5, 5)).toBe(0.63);
    expect(shorterClipCost(0.63, 5, 4.2)).toBe(0.63); // rounds up to 5 s
    expect(shorterClipCost(0.63, 5, 9)).toBe(0.63);
    expect(shorterClipCost(0.63, 5, 0)).toBe(0.63);
    expect(shorterClipCost(0.63, 5, Number.NaN)).toBe(0.63);
    expect(shorterClipCost(0.63, 0, 3)).toBe(0.63);
  });
});

describe('planDuration', () => {
  const row = { id: 'j', feature: 'motion_control', duration_s: 6, duration_ms: null, cost_usd: '0.7560' };

  test('sets the asset length and corrects a Motion Control cost', () => {
    expect(planDuration(row, 3.7)).toEqual({ durationMs: 3700, correctedUsd: '0.5040' });
  });

  test('leaves other features, and a Motion Control clip that plays what was asked, at their cost', () => {
    expect(planDuration({ ...row, feature: 'video' }, 3.7)).toEqual({ durationMs: 3700, correctedUsd: null });
    expect(planDuration(row, 6)).toEqual({ durationMs: 6000, correctedUsd: null });
  });

  test('does not touch a length that is already recorded, and writes none for an unreadable clip', () => {
    expect(planDuration({ ...row, duration_ms: 3700 }, 3.7)).toEqual({ durationMs: null, correctedUsd: '0.5040' });
    expect(planDuration(row, 0)).toEqual({ durationMs: null, correctedUsd: null });
  });
});
