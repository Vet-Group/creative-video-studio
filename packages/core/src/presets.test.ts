import { expect, test } from 'vitest';
import { BAKEOFF_PRESET, KEEP, PRESETS } from './presets';

test('has six presets with unique ids', () => {
  expect(PRESETS).toHaveLength(6);
  expect(new Set(PRESETS.map((p) => p.id)).size).toBe(6);
});

test('exactly one preset is bake-off safe and it is BAKEOFF_PRESET', () => {
  const safe = PRESETS.filter((p) => p.isBakeoffSafe);
  expect(safe).toEqual([BAKEOFF_PRESET]);
});

test('labels are non-empty and prompts are ASCII-only', () => {
  for (const p of PRESETS) {
    expect(p.label.trim()).not.toBe('');
    expect(p.prompt).toMatch(/^[\x20-\x7e]+$/);
  }
});

test('every prompt tells the model to keep the product unchanged', () => {
  for (const p of PRESETS) expect(p.prompt).toContain(KEEP);
});
