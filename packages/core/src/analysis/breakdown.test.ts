import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseBreakdown } from './breakdown';

// A representative slice of a rea-video breakdown.json (apparel reference clip from the spike),
// carrying the deterministic verdict/material flags so the test can prove they are ignored.
const sample = {
  summary: { duration: 11.433, shots: 1, verdict: 'still image + pan/zoom 100%', real_material: { ratio: 1.0 } },
  whole_video_vlm: {
    summary: 'A female model wearing a plain white t-shirt and light blue jeans stands against a neutral beige studio background, briefly adjusting her hair.',
    format: 'product showcase',
    hook: 'Clean minimalist apparel presentation with a neutral aesthetic background.',
  },
  shots: [
    {
      index: 1,
      start: 0.0,
      end: 11.433,
      material: { origin: 'real', has_real_material: true },
      narrative: { role: 'mood', point: 'Model posing and slightly adjusting hair in a clean studio setting to showcase a plain white t-shirt.', source: 'vlm' },
    },
  ],
};

test('builds the analysis from the VLM layer (summary, format, hook, per-shot English prompt)', () => {
  const a = parseBreakdown(sample);
  expect(a.durationS).toBe(11.433);
  expect(a.shotCount).toBe(1);
  expect(a.format).toBe('product showcase');
  expect(a.hook).toContain('Clean minimalist apparel');
  expect(a.summary).toContain('plain white t-shirt');
  expect(a.shots).toEqual([{ index: 1, start: 0, end: 11.433, role: 'mood', prompt: 'Model posing and slightly adjusting hair in a clean studio setting to showcase a plain white t-shirt.' }]);
});

test('ignores the unreliable deterministic verdict/material flags', () => {
  const flipped = { ...sample, summary: { ...sample.summary, verdict: '3D render 100%', real_material: { ratio: 0 } }, shots: [{ ...sample.shots[0], material: { origin: 'synthetic', has_real_material: false } }] };
  expect(parseBreakdown(flipped)).toEqual(parseBreakdown(sample));
});

test('degrades safely on missing or malformed fields', () => {
  expect(parseBreakdown({})).toEqual({ durationS: 0, shotCount: 0, format: '', hook: '', summary: '', shots: [] });
  expect(parseBreakdown(null)).toEqual({ durationS: 0, shotCount: 0, format: '', hook: '', summary: '', shots: [] });
  const a = parseBreakdown({ shots: [{}, { start: 2 }] });
  expect(a.shotCount).toBe(2);
  expect(a.shots.map((s) => s.index)).toEqual([1, 2]);
});

test('falls back to summary.shots when the shots array is empty, and keeps a source index', () => {
  expect(parseBreakdown({ shots: [], summary: { shots: 3 } }).shotCount).toBe(3);
  expect(parseBreakdown({ shots: [{ index: 5 }] }).shots.map((s) => s.index)).toEqual([5]);
});

test('parses a real rea-video breakdown.json fixture into non-empty prompts (guards upstream field renames)', () => {
  const raw = JSON.parse(readFileSync(new URL('./__fixtures__/breakdown.sample.json', import.meta.url), 'utf8'));
  const a = parseBreakdown(raw);
  expect(a.shotCount).toBeGreaterThanOrEqual(1);
  expect(a.summary.length).toBeGreaterThan(10);
  expect(a.shots.every((s) => s.prompt.length > 0)).toBe(true);
});
