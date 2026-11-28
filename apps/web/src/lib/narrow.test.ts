import { expect, test } from 'vitest';
import { guessNarrow } from './narrow';

test('the saved width class wins, and without one a phone or tablet agent gets the phone layout', () => {
  const phone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  expect(guessNarrow('1', desktop)).toBe(true);
  expect(guessNarrow('0', phone)).toBe(false);
  expect(guessNarrow(undefined, phone)).toBe(true);
  expect(guessNarrow(undefined, desktop)).toBe(false);
  expect(guessNarrow(undefined, null)).toBe(false);
});
