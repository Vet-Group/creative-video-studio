import { expect, test } from 'vitest';
import type { Analysis } from './breakdown';
import { REMAKE_MAX_SHOTS, remakeScene, remakeShotSeconds, remakeShotsProblem, remakeShotUsd } from './remake';

test('a chosen shot that starts a merged scene stands for the whole scene; a shot inside one stands for itself', () => {
  const s = (index: number, start: number, end: number, prompt: string) => ({ index, start, end, role: 'proof', prompt });
  const a: Analysis = { durationS: 8, shotCount: 4, format: '', hook: '', summary: '', shots: [s(1, 0, 1.2, 'Pan.'), s(2, 1.2, 2.3, 'Pan.'), s(3, 2.3, 4, 'Spin.'), s(4, 4, 8, 'Spin.')] };
  expect(remakeScene(a, 1)).toEqual(s(1, 0, 2.3, 'Pan.'));
  expect(remakeScene(a, 3)).toEqual(s(3, 2.3, 8, 'Spin.'));
  expect(remakeScene(a, 4)).toEqual(s(4, 4, 8, 'Spin.'));
  expect(remakeScene(a, 9)).toBeUndefined();
  expect(a.shots[0]!.end).toBe(1.2); // the analysis is left as it was
});

test('a shot is sent and billed as its length in whole seconds, 2 to 10', () => {
  const secs = (start: number, end: number) => remakeShotSeconds({ start, end });
  expect([secs(0, 2), secs(0, 2.0000001), secs(0, 2.1), secs(2.1, 4.3), secs(4.3, 7), secs(0, 0.4), secs(3, 25)]).toEqual([2, 2, 3, 3, 3, 2, 10]);
  expect(remakeShotUsd({ start: 2.1, end: 4.3 })).toBeCloseTo(0.3);
  expect(remakeShotUsd({ start: 0, end: 25 })).toBeCloseTo(1);
});

test('takes 1 to REMAKE_MAX_SHOTS distinct shots of the analysis, and says why anything else is refused', () => {
  const available = [1, 2, 3, 4, 5, 6, 7, 8];
  expect(remakeShotsProblem([3, 1], available)).toBeNull();
  expect(remakeShotsProblem(available.slice(0, REMAKE_MAX_SHOTS), available)).toBeNull();
  expect(remakeShotsProblem(available.slice(0, REMAKE_MAX_SHOTS + 1), available)).toBe('at most 6 shots per remake');
  expect(remakeShotsProblem([], available)).toBe('shots must be a non-empty list of shot numbers');
  expect(remakeShotsProblem('1,2', available)).toBe('shots must be a non-empty list of shot numbers');
  expect(remakeShotsProblem([1.5], available)).toBe('shots must be a non-empty list of shot numbers');
  expect(remakeShotsProblem([2, 2], available)).toBe('each shot may be chosen once');
  expect(remakeShotsProblem([1, 9], available)).toBe('shot 9 is not in the analysis');
});
