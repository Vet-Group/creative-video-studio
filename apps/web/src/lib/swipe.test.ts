import { describe, expect, it } from 'vitest';
import { swipeStep } from './swipe';

describe('swipeStep', () => {
  it('commits a long slow drag: left is next, right is previous', () => {
    expect(swipeStep(-170, 2000, 400)).toBe(1);
    expect(swipeStep(170, 2000, 400)).toBe(-1);
  });
  it('commits a short fast flick', () => {
    expect(swipeStep(-60, 100, 400)).toBe(1);
    expect(swipeStep(60, 100, 400)).toBe(-1);
  });
  it('snaps back a short slow drag', () => {
    expect(swipeStep(-100, 1000, 400)).toBe(0);
    expect(swipeStep(100, 1000, 400)).toBe(0);
  });
  it('ignores a drag under the 10 px start, however fast', () => {
    expect(swipeStep(-9, 5, 400)).toBe(0);
    expect(swipeStep(10, 10, 400)).toBe(-1);
  });
  it('counts exactly 40% of the width as not enough, a bit more as enough', () => {
    expect(swipeStep(-160, 2000, 400)).toBe(0);
    expect(swipeStep(-161, 2000, 400)).toBe(1);
  });
  it('treats a zero or negative duration as 1 ms and an empty width as no swipe', () => {
    expect(swipeStep(-20, 0, 400)).toBe(1);
    expect(swipeStep(-300, 100, 0)).toBe(0);
  });
});
