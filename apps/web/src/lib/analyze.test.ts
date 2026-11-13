import type { Analysis } from '@cvs/core/analysis/breakdown';
import { expect, test } from 'vitest';
import { analysisFormat, clock, frameTime, mergeShots, roleLabel, scriptPrompt, scriptText, timeRange } from './analyze';

test('shot roles read in Vietnamese, in any case, and an unknown role stays as the model wrote it', () => {
  expect(roleLabel('hook')).toBe('Mở đầu');
  expect(roleLabel('Close-Up')).toBe('Cận cảnh');
  expect(roleLabel(' CTA ')).toBe('Kêu gọi hành động');
  expect(roleLabel('b-roll')).toBe('b-roll');
});

test('scene times read in tenths of a second under a minute, as m:ss beyond', () => {
  expect(clock(0)).toBe('0:00');
  expect(clock(75.6)).toBe('1:16');
  expect(timeRange(0, 4.2)).toBe('0.0–4.2s');
  expect(timeRange(1.17, 2.33)).toBe('1.2–2.3s'); // m:ss would read 0:01–0:02 for both of two short cuts
  expect(timeRange(58, 75.6)).toBe('0:58–1:16');
});

test('adjacent shots with the same role and prompt read as one scene, renumbered, with the Vietnamese kept in step', () => {
  const s = (index: number, start: number, end: number, role: string, prompt: string) => ({ index, start, end, role, prompt });
  const a: Analysis = {
    durationS: 8,
    shotCount: 4,
    format: 'product showcase',
    hook: 'h',
    summary: 's',
    shots: [s(1, 0, 1.2, 'hook', 'Pan.'), s(2, 1.2, 2.3, 'hook', 'Pan.'), s(3, 2.3, 4, 'proof', 'Spin.'), s(4, 4, 8, 'hook', 'Pan.')],
    vi: { format: 'f', hook: 'h', summary: 's', shots: ['Lia.', 'Lia.', 'Xoay.', 'Lia lại.'] },
  };
  const m = mergeShots(a);
  expect(m.shots.map((x) => [x.index, x.start, x.end, x.prompt])).toEqual([
    [1, 0, 2.3, 'Pan.'],
    [2, 2.3, 4, 'Spin.'],
    [3, 4, 8, 'Pan.'], // not adjacent to the first, so its own scene
  ]);
  expect(m.vi).toEqual(['Lia.', 'Xoay.', 'Lia lại.']);
  expect(m.first).toEqual([1, 3, 4]);
  expect(a.shots[0]!.end).toBe(1.2); // the stored analysis is left as it was
  expect(mergeShots({ ...a, vi: undefined }).vi).toBeUndefined();
});

test('the format line starts with a capital, whichever source it comes from', () => {
  const a = { format: 'product showcase', shots: [] } as unknown as Analysis;
  expect(analysisFormat({ ...a, vi: { format: 'trưng bày sản phẩm', hook: '', summary: '', shots: [] } })).toBe('Trưng bày sản phẩm');
  expect(analysisFormat(a)).toBe('Giới thiệu sản phẩm');
});

const shot = (index: number, prompt: string): Analysis['shots'][number] => ({ index, start: index * 4, end: index * 4 + 4, role: 'hook', prompt });

test('the script joins every shot prompt in order, one line each', () => {
  expect(scriptPrompt([shot(0, 'A.'), shot(1, 'B.'), shot(2, '')])).toBe('Shot 0 (0.0–4.0s): A.\nShot 1 (4.0–8.0s): B.');
});

test('the script stops before the shot that would pass the limit that Create takes', () => {
  const long = 'x'.repeat(900);
  const text = scriptPrompt([shot(1, long), shot(2, long), shot(3, long)]);
  expect(text.length).toBeLessThanOrEqual(2000);
  expect(text.split('\n')).toHaveLength(2);
  expect(scriptPrompt([shot(1, 'y'.repeat(2500))]).length).toBeGreaterThan(2000); // a single shot is never dropped; Create's own cap applies
});

test('the copied script has the format and hook, then a block per merged scene with its reading and English prompt', () => {
  const s = (index: number, start: number, end: number, role: string, prompt: string) => ({ index, start, end, role, prompt });
  const a: Analysis = {
    durationS: 8,
    shotCount: 3,
    format: 'product showcase',
    hook: 'Clean look.',
    summary: 's',
    shots: [s(1, 0, 1.2, 'hook', 'Pan.'), s(2, 1.2, 4, 'hook', 'Pan.'), s(3, 4, 8, 'proof', 'Spin.')],
    vi: { format: 'Trưng bày', hook: 'Gọn gàng.', summary: 's', shots: ['Lia.', 'Lia.', 'Xoay.'] },
  };
  expect(scriptText(a)).toBe('Định dạng: Trưng bày\nMở đầu: Gọn gàng.\n\nCảnh 1 (0.0–4.0s) · Mở đầu\nLia.\nPrompt: Pan.\n\nCảnh 2 (4.0–8.0s) · Minh chứng\nXoay.\nPrompt: Spin.');
  // No translation, no hook and a shot without a role or prompt: only what exists is written.
  expect(scriptText({ ...a, vi: undefined, hook: '', shots: [s(1, 0, 2, '', 'Pan.'), s(2, 2, 3, '', '')] })).toBe('Định dạng: Giới thiệu sản phẩm\n\nCảnh 1 (0.0–2.0s)\nPrompt: Pan.\n\nCảnh 2 (2.0–3.0s)');
});

test('the thumbnail is taken just inside the scene and never past its middle', () => {
  expect(frameTime(4, 8)).toBeCloseTo(4.3);
  expect(frameTime(4, 4.2)).toBeCloseTo(4.1);
  expect(frameTime(4, 4)).toBe(4);
});
