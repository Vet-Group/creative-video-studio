import { describe, expect, test } from 'vitest';
import { rank, scoreOf } from './model-scores';

describe('scoreOf', () => {
  test('is the pass rate times reliability, out of 100; nothing counted is 50', () => {
    expect(scoreOf({ passes: 7, total: 10, ok: 0, bad: 0 })).toEqual({ passRate: 0.7, reliability: 1, score: 70 });
    expect(scoreOf({ passes: 0, total: 0, ok: 0, bad: 0 }).score).toBe(50);
    expect(scoreOf({ passes: 7, total: 10, ok: 6, bad: 0 }).score).toBe(70); // successes alone keep reliability at 1
    expect(scoreOf({ passes: 7, total: 10, ok: 0, bad: 4 })).toMatchObject({ reliability: 0.5, score: 35 });
  });
});

describe('rank', () => {
  test('best is the top score, the cheaper on a tie; recommended unless all choices score the same', () => {
    expect(rank([{ id: 'a', score: 60, usd: 1 }, { id: 'b', score: 70, usd: 2 }])).toEqual({ best: 'b', recommended: 'b' });
    expect(rank([{ id: 'a', score: 60, usd: 2 }, { id: 'b', score: 60, usd: 1 }])).toEqual({ best: 'b', recommended: null });
    expect(rank([{ id: 'a', score: 60, usd: 2 }, { id: 'b', score: 60, usd: 1 }, { id: 'c', score: 50, usd: 0 }])).toEqual({ best: 'b', recommended: 'b' });
    expect(rank([{ id: 'a', score: 60, usd: 1 }])).toEqual({ best: 'a', recommended: null });
    expect(rank([])).toEqual({ best: null, recommended: null });
  });
});
