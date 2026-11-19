import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { type Analysis, mergeShots, parseBreakdown } from './breakdown';

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

test('builds the analysis from the VLM layer (summary, format, hook, per-shot English point, which is the prompt until the worker rewrites it)', () => {
  const a = parseBreakdown(sample);
  expect(a.durationS).toBe(11.433);
  expect(a.shotCount).toBe(1);
  expect(a.format).toBe('product showcase');
  expect(a.hook).toContain('Clean minimalist apparel');
  expect(a.summary).toContain('plain white t-shirt');
  const point = 'Model posing and slightly adjusting hair in a clean studio setting to showcase a plain white t-shirt.';
  expect(a.shots).toEqual([{ index: 1, start: 0, end: 11.433, role: 'mood', point, prompt: point }]);
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

test('parses the breakdown of rea-video ac47077, whose --vlm run also surveys the cuts, and merges its shots into the beats it describes', () => {
  // Trimmed from `rea-video decompose example-17.mp4 --vlm --lang en --workers 5 --max-vlm-shots 40` at ac47077 (2026-11-19).
  const raw = JSON.parse(readFileSync(new URL('./__fixtures__/breakdown.survey.sample.json', import.meta.url), 'utf8'));
  const a = parseBreakdown(raw);
  expect(a.durationS).toBe(8.042);
  expect(a.format).toBe('product showcase');
  expect(a.shots.map((s) => [s.start, s.end, s.role])).toEqual([
    [0, 1.167, 'hook'],
    [1.167, 2.333, 'hook'],
    [2.333, 4, 'proof'],
    [4, 4.75, 'proof'],
    [4.75, 6.417, 'proof'],
    [6.417, 8.042, 'mood'],
  ]);
  expect(a.shots.every((s) => (s.point ?? '').length > 0)).toBe(true);
  expect(mergeShots(a).shots.map((s) => [s.start, s.end, s.role])).toEqual([
    [0, 2.333, 'hook'],
    [2.333, 6.417, 'proof'],
    [6.417, 8.042, 'mood'],
  ]);
});

const scenes = (shots: Analysis['shots']) => mergeShots({ durationS: 0, shotCount: shots.length, format: '', hook: '', summary: '', shots });

test('mergeShots joins adjacent shots on their role and point, so the distinct detailed prompts still merge', () => {
  const m = scenes([
    { index: 1, start: 0, end: 2, role: 'hook', point: 'Beat A.', prompt: 'Wide shot; the model walks in.' },
    { index: 2, start: 2, end: 4, role: 'hook', point: 'Beat A.', prompt: 'Close-up; the model smiles.' },
    { index: 3, start: 4, end: 6, role: 'proof', point: 'Beat A.', prompt: 'Close-up; the model smiles.' }, // another role: its own scene
    { index: 4, start: 6, end: 8, role: 'proof', point: 'Beat B.', prompt: 'Close-up; the model smiles.' }, // another point: its own scene
  ]);
  expect(m.shots.map((s) => [s.index, s.start, s.end, s.prompt])).toEqual([
    [1, 0, 4, 'Wide shot; the model walks in.'],
    [2, 4, 6, 'Close-up; the model smiles.'],
    [3, 6, 8, 'Close-up; the model smiles.'],
  ]);
  expect(m.first).toEqual([1, 3, 4]);
});

test('mergeShots reads an older result without points on its prompts, which were the points', () => {
  const m = scenes([
    { index: 1, start: 0, end: 2, role: 'hook', prompt: 'Beat A.' },
    { index: 2, start: 2, end: 4, role: 'hook', prompt: 'Beat A.' },
    { index: 3, start: 4, end: 6, role: 'hook', prompt: 'Beat B.' },
  ]);
  expect(m.first).toEqual([1, 3]);
  expect(m.shots[0]!.end).toBe(4);
});
