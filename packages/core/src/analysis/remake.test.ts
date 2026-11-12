import { expect, test } from 'vitest';
import { REMAKE_MAX_SHOTS, remakeShotsProblem } from './remake';

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
