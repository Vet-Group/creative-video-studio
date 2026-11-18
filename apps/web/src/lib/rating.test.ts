import { describe, expect, test } from 'vitest';
import { isRatingDue, parseRating, RATING_COMMENT_MAX, ratingFollowUp, type RatingState } from './rating';

const NOW = new Date('2026-11-17T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const base: RatingState = { system: false, succeededJobs: 3, lastRatedAt: null, snoozedUntil: null };
const due = (over: Partial<RatingState>) => isRatingDue({ ...base, ...over }, NOW);

describe('isRatingDue', () => {
  test('asks a real user with 3 succeeded jobs who never rated or snoozed', () => {
    expect(due({})).toBe(true);
  });

  test('needs 3 succeeded real jobs: 2 is too few', () => {
    expect(due({ succeededJobs: 2 })).toBe(false);
    expect(due({ succeededJobs: 3 })).toBe(true);
    expect(due({ succeededJobs: 0 })).toBe(false);
  });

  test('never asks a system account', () => {
    expect(due({ system: true })).toBe(false);
  });

  test('waits 30 days after a rating: 30 days less a moment is still too soon, exactly 30 days is due', () => {
    expect(due({ lastRatedAt: ago(30 * DAY - 1) })).toBe(false);
    expect(due({ lastRatedAt: ago(30 * DAY) })).toBe(true);
    expect(due({ lastRatedAt: ago(31 * DAY) })).toBe(true);
    expect(due({ lastRatedAt: ago(DAY) })).toBe(false);
  });

  test('stays quiet while a snooze runs and asks again once it has passed', () => {
    expect(due({ snoozedUntil: new Date(NOW.getTime() + 1) })).toBe(false);
    expect(due({ snoozedUntil: new Date(NOW.getTime() + 7 * DAY) })).toBe(false);
    expect(due({ snoozedUntil: NOW })).toBe(true);
    expect(due({ snoozedUntil: ago(1) })).toBe(true);
  });

  test('every condition must hold at once', () => {
    expect(due({ lastRatedAt: ago(40 * DAY), snoozedUntil: new Date(NOW.getTime() + DAY) })).toBe(false);
    expect(due({ lastRatedAt: ago(40 * DAY), snoozedUntil: ago(DAY), succeededJobs: 2 })).toBe(false);
  });
});

test('the comment asks what to fix up to 6, what would make it a 10 at 7-8, and what works at 9-10', () => {
  expect([1, 6, 7, 8, 9, 10].map(ratingFollowUp)).toEqual([
    'Chúng tôi nên cải thiện điều gì?',
    'Chúng tôi nên cải thiện điều gì?',
    'Điều gì sẽ giúp bạn chấm 10 điểm?',
    'Điều gì sẽ giúp bạn chấm 10 điểm?',
    'Bạn thích điều gì nhất?',
    'Bạn thích điều gì nhất?',
  ]);
});

describe('parseRating', () => {
  test('accepts every whole score from 1 to 10', () => {
    for (let score = 1; score <= 10; score++) expect(parseRating({ score })).toEqual({ score, comment: null });
  });

  test.each([[0], [11], [-1], [3.5], ['7'], [null], [undefined], [NaN], [Infinity], [[7]]])('refuses the score %j', (score) => {
    expect(parseRating({ score })).toHaveProperty('error');
  });

  test('refuses a body that is not an object', () => {
    for (const body of [null, undefined, 7, 'x', []]) expect(parseRating(body)).toHaveProperty('error');
  });

  test('trims the comment and turns an empty one into null', () => {
    expect(parseRating({ score: 9, comment: '  Tốt lắm  ' })).toEqual({ score: 9, comment: 'Tốt lắm' });
    expect(parseRating({ score: 9, comment: '   ' })).toEqual({ score: 9, comment: null });
    expect(parseRating({ score: 9, comment: null })).toEqual({ score: 9, comment: null });
  });

  test('allows a comment of 1000 characters and refuses 1001; the spaces trimmed off do not count', () => {
    expect(parseRating({ score: 5, comment: 'x'.repeat(RATING_COMMENT_MAX) })).toMatchObject({ comment: 'x'.repeat(RATING_COMMENT_MAX) });
    expect(parseRating({ score: 5, comment: ` ${'x'.repeat(RATING_COMMENT_MAX)} ` })).toMatchObject({ score: 5 });
    expect(parseRating({ score: 5, comment: 'x'.repeat(RATING_COMMENT_MAX + 1) })).toHaveProperty('error');
  });

  test('refuses a comment that is not text', () => {
    expect(parseRating({ score: 5, comment: 5 })).toHaveProperty('error');
    expect(parseRating({ score: 5, comment: ['a'] })).toHaveProperty('error');
  });
});
