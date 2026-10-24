import { describe, expect, test } from 'vitest';
import type { JobLine } from './jobs.ts';
import { buildReport, wilson, type Verdict } from './report.ts';

describe('report', () => {
  test('wilson matches the textbook 95% interval', () => {
    const [lo, hi] = wilson(7, 10);
    expect(lo).toBeCloseTo(0.3968, 3);
    expect(hi).toBeCloseTo(0.8922, 3);
    expect(wilson(0, 0)).toEqual([0, 0]);
  });

  test('go with the better model pre-selected, second-judging agreement and per-clip minutes', () => {
    const job = (image: number, model: string, provider: JobLine['provider'], estimateUsd: number): JobLine[] => [
      { image, model, round: 'bakeoff', provider, estimateUsd, status: 'submitted', at: '2026-10-24T10:00:00Z' },
      { image, model, round: 'bakeoff', provider, estimateUsd, status: 'succeeded', costUsd: estimateUsd, at: '2026-10-24T10:03:00Z' },
    ];
    const lines = [1, 2, 3].flatMap((i) => [...job(i, 'a', 'fal', 0.5), ...job(i, 'b', 'replicate', 1)]);
    const v = (id: string, model: string, image: number, pass: boolean): Verdict => ({ id, set: 'half-1', model, image, pass, faults: pass ? [] : ['print'] });
    const verdicts = [v('c1', 'a', 1, true), v('c2', 'a', 2, true), v('c3', 'a', 3, false), v('c4', 'b', 1, true), v('c5', 'b', 2, true), v('c6', 'b', 3, true)];
    lines[0]!.providerJobId = 'p1';
    const md = buildReport({ lines, verdicts, rejudge: { c3: true, c4: true }, providerSec: { p1: 137.6 } });
    expect(md).toContain('| half-1 | 1 | a | yes | - | 138 | 3.0 |');
    expect(md).toContain('| a | 2/3 | 67% |');
    expect(md).toContain('| b | 3/3 | 100% |');
    expect(md).toContain('**Go.** Enable b; the picker pre-selects b');
    expect(md).toContain('1/2 clips got the same pass or fail');
    expect(md).toContain('Total $4.50 (fal $1.50, replicate $3.00)');
    expect(md).toContain('Every planned clip rendered');
    expect(md).toContain('| half-1 | 3 | a | no | print | - | 3.0 |');
  });

  test('a provider-failed render counts as a fail and a key that never reached the provider is listed, not rated', () => {
    const base = { model: 'b', round: 'bakeoff', provider: 'replicate' as const, estimateUsd: 1, at: '2026-10-24T10:00:00Z', set: 'half-2' };
    const lines: JobLine[] = [{ ...base, image: 6, status: 'failed', error: 'flagged' }, { ...base, image: 9, status: 'unknown', error: 'fetch failed' }];
    const md = buildReport({ lines, verdicts: [{ id: 'c1', set: 'half-2', model: 'b', image: 7, pass: true, faults: [] }], rejudge: {} });
    expect(md).toContain('| b | 1/2 | 50% |');
    expect(md).toContain('render 1');
    expect(md).toContain('image 9 b (unknown: fetch failed)');
    expect(md).toContain('| half-2 | 6 | b | no | render |');
  });

  test('no-go when no model reaches the bar', () => {
    const md = buildReport({ lines: [], verdicts: [{ id: 'c1', set: 'half-1', model: 'a', image: 1, pass: false, faults: ['colour'] }], rejudge: {} });
    expect(md).toContain('**No-go.**');
    expect(md).toContain('Not run.');
  });
});
