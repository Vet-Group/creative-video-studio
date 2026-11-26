import { expect, test } from 'vitest';
import { alignEnd, firstEnabled, moveActive } from './listbox';

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

test('a chip list lines up with the right side of its trigger only when lining up with its left side would run off the screen', () => {
  expect(alignEnd(215, 120, 390)).toBe(true); // the 390 px Image generation bar: the thinking-level chip at x 215, whose 192-256 px list ended past 390
  expect(alignEnd(16, 120, 390)).toBe(false); // a chip at the left of the row
  expect(alignEnd(600, 120, 1440)).toBe(false); // a wide screen has room
  expect(alignEnd(16, 380, 390)).toBe(true); // a trigger as wide as the screen is no wider than its list: the right edge is the same as the left
});
