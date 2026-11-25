import { expect, test } from 'vitest';
import { USAGE_STATUS, usageStatus } from './usage-status';

const at = '2026-11-20T03:00:00.000Z';

test('a job or an analysis in the period comes first, then any use outside it, then a sign-in alone, then nothing', () => {
  expect(usageStatus({ jobs: 1, analyses: 0, lastUsedAt: at, lastSeenAt: null })).toBe('using');
  expect(usageStatus({ jobs: 0, analyses: 2, lastUsedAt: at, lastSeenAt: at })).toBe('using');
  expect(usageStatus({ jobs: 0, analyses: 0, lastUsedAt: at, lastSeenAt: at })).toBe('lapsed');
  // Signed out with a password: no trace of the sign-in is left, but the jobs are.
  expect(usageStatus({ jobs: 0, analyses: 0, lastUsedAt: at, lastSeenAt: null })).toBe('lapsed');
  expect(usageStatus({ jobs: 0, analyses: 0, lastUsedAt: null, lastSeenAt: at })).toBe('idle');
  expect(usageStatus({ jobs: 0, analyses: 0, lastUsedAt: null, lastSeenAt: null })).toBe('never');
});

test('the badges read in Vietnamese, in the order a team lists its people', () => {
  expect(Object.entries(USAGE_STATUS)).toEqual([
    ['using', 'Có dùng trong khoảng'],
    ['lapsed', 'Ngưng trước khoảng'],
    ['idle', 'Đã vào, chưa tạo'],
    ['never', 'Chưa đăng nhập'],
  ]);
});
