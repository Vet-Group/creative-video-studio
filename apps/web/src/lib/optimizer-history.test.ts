import { describe, expect, it } from 'vitest';
import { addHistory } from './optimizer-history';

describe('optimizer session history', () => {
  it('puts the newest entry first and drops nothing under the cap', () => {
    expect(addHistory([2, 1], 3)).toEqual({ list: [3, 2, 1], dropped: [] });
  });
  it('returns the oldest entries beyond the cap so their object URLs can be revoked', () => {
    expect(addHistory([3, 2, 1], 4, 3)).toEqual({ list: [4, 3, 2], dropped: [1] });
  });
});
