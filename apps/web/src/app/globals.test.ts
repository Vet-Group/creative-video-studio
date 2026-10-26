import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// A raw check mark in generated content was once garbled by a script save into two other glyphs; a CSS escape survives any encoding.
test('generated content in globals.css uses CSS escapes, not raw glyphs', () => {
  const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
  const values = [...css.matchAll(/content:\s*(['"])(.*?)\1/g)].map((m) => m[2] ?? '');
  expect(values.filter((v) => v === '\\2713')).toHaveLength(2); // the chosen-card badge and the chosen no-choice tile
  expect(values.filter((v) => /[^\x20-\x7e]/.test(v))).toEqual([]);
});
