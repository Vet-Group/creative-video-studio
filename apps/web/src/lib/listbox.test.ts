import { expect, test } from 'vitest';
import { firstEnabled, moveActive } from './listbox';

const none = [false, false, false, false];

test('arrow keys move one option and stop at the ends', () => {
  expect(moveActive('ArrowDown', 0, none)).toBe(1);
  expect(moveActive('ArrowDown', 3, none)).toBe(3);
  expect(moveActive('ArrowUp', 2, none)).toBe(1);
  expect(moveActive('ArrowUp', 0, none)).toBe(0);
});

test('Home and End jump to the first and last enabled option', () => {
  expect(moveActive('Home', 2, [true, false, false, false])).toBe(1);
  expect(moveActive('End', 1, [false, false, false, true])).toBe(2);
  expect(moveActive('End', 0, none)).toBe(3);
});

test('disabled options are skipped, and nothing moves when none is left', () => {
  expect(moveActive('ArrowDown', 0, [false, true, true, false])).toBe(3);
  expect(moveActive('ArrowDown', 0, [false, true, true, true])).toBe(0);
  expect(moveActive('ArrowUp', 3, [true, true, false, false])).toBe(2);
  expect(moveActive('ArrowUp', 2, [true, true, false, false])).toBe(2);
});

test('other keys leave the active option alone', () => {
  expect(moveActive('a', 2, none)).toBe(2);
});

test('firstEnabled finds the first usable option', () => {
  expect(firstEnabled([true, false, false])).toBe(1);
  expect(firstEnabled([true, true])).toBe(-1);
  expect(firstEnabled([false, true, false], 1)).toBe(2);
});
