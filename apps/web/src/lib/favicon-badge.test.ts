import { describe, expect, it } from 'vitest';
import { badgeFor, DONE_BADGE_MS } from './favicon-badge';

describe('badgeFor', () => {
  const finished = 1_000_000;

  it('is amber while any job runs, whatever else is true', () => {
    expect(badgeFor(1, false, 0, finished)).toBe('running');
    expect(badgeFor(3, true, finished, finished + 1)).toBe('running');
  });

  it('is green for a minute after the last job finished while the news is unseen, then none', () => {
    expect(badgeFor(0, true, finished, finished + 1_000)).toBe('done');
    expect(badgeFor(0, true, finished, finished + DONE_BADGE_MS - 1)).toBe('done');
    expect(badgeFor(0, true, finished, finished + DONE_BADGE_MS)).toBeNull();
  });

  it('is none once the tab was looked at (no news) or when nothing ran', () => {
    expect(badgeFor(0, false, finished, finished + 1_000)).toBeNull();
    expect(badgeFor(0, false, 0, finished)).toBeNull();
  });
});
