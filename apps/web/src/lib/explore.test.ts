import { expect, test } from 'vitest';
import { continueJobs, givenName, greeting } from './explore';

test('the given name is the last word of a Vietnamese full name', () => {
  expect(givenName('Nguyễn Văn An')).toBe('An');
  expect(givenName('  Trần   Thị  Hoa ')).toBe('Hoa');
  expect(givenName('Hưng')).toBe('Hưng');
  expect(givenName('')).toBe('');
  expect(givenName('   ')).toBe('');
  expect(givenName(null)).toBe('');
});

test('the greeting follows the hour in Vietnam, not the server clock', () => {
  // 07:00Z is 14:00 in Vietnam (UTC+7).
  expect(greeting('Phạm Quốc Hưng', new Date('2026-11-02T07:00:00Z'))).toBe('Chào buổi chiều, Hưng');
  expect(greeting('Nguyễn Văn An', new Date('2026-11-02T01:30:00Z'))).toBe('Chào buổi sáng, An'); // 08:30
  expect(greeting('An', new Date('2026-11-01T21:00:00Z'))).toBe('Chào buổi sáng, An'); // 04:00
  expect(greeting('An', new Date('2026-11-02T04:59:00Z'))).toBe('Chào buổi sáng, An'); // 11:59
  expect(greeting('An', new Date('2026-11-02T05:00:00Z'))).toBe('Chào buổi chiều, An'); // 12:00
  expect(greeting('An', new Date('2026-11-02T11:00:00Z'))).toBe('Chào buổi tối, An'); // 18:00
  expect(greeting('An', new Date('2026-11-02T19:00:00Z'))).toBe('Chào buổi tối, An'); // 02:00 the next day
  expect(greeting('', new Date('2026-11-02T07:00:00Z'))).toBe('Chào buổi chiều');
});

test('Continue puts running jobs first, then the latest finished, and keeps at most four', () => {
  const jobs = [
    { id: 'a', status: 'succeeded' },
    { id: 'b', status: 'running' },
    { id: 'c', status: 'failed' },
    { id: 'd', status: 'queued' },
    { id: 'e', status: 'succeeded' },
    { id: 'f', status: 'submitting' },
  ];
  expect(continueJobs(jobs).map((j) => j.id)).toEqual(['b', 'd', 'f', 'a']);
  expect(continueJobs(jobs, 3).map((j) => j.id)).toEqual(['b', 'd', 'f']);
  expect(continueJobs(jobs.filter((j) => j.status === 'succeeded')).map((j) => j.id)).toEqual(['a', 'e']);
  expect(continueJobs([])).toEqual([]);
});
