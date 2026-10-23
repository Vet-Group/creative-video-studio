import { expect, test } from 'vitest';
import { EXAMPLES, splitColumns } from './examples';

test('the samples cover four aspects and never set a ratio the job form lacks', () => {
  expect(new Set(EXAMPLES.map((e) => e.aspect))).toEqual(new Set(['16:9', '1:1', '3:4', '9:16']));
  for (const e of EXAMPLES) {
    if (e.ratio) expect(['9:16', '1:1']).toContain(e.ratio);
    else expect(['16:9', '3:4']).toContain(e.aspect);
  }
  expect(EXAMPLES.length).toBeGreaterThanOrEqual(9);
  expect(new Set(EXAMPLES.slice(0, 9).map((e) => e.height / e.width)).size).toBeGreaterThanOrEqual(3);
});

test('splitColumns keeps every tile once, in order within a column, and levels the columns', () => {
  const columns = splitColumns(EXAMPLES, 3);
  expect(columns.flat().map((e) => e.id).sort()).toEqual(EXAMPLES.map((e) => e.id).sort());
  const height = (col: typeof EXAMPLES) => col.reduce((sum, e) => sum + e.height / e.width, 0);
  const heights = columns.map(height);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1.8); // under one tall tile
  for (const col of columns) {
    const indexes = col.map((e) => EXAMPLES.indexOf(e));
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  }
});
