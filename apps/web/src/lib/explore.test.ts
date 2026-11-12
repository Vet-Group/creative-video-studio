import { CANCELED_ERROR } from '@cvs/core/ledger';
import { expect, test } from 'vitest';
import { continueJobs, givenName, greeting, jobNote, typicalLabel } from './explore';

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

test('the recent-job note shows elapsed while running, the finish time when done, a cancel, else a failure', () => {
  const now = Date.parse('2026-11-12T10:00:00Z');
  const fin = new Date('2026-11-12T09:30:00Z');
  const done = (d: Date) => d.toISOString();
  const base = { error: null, finished_at: null };
  expect(jobNote({ ...base, status: 'running', created_at: new Date(now - 3 * 60_000) }, done, now)).toBe('Đang tạo · đã chạy 3 phút');
  expect(jobNote({ ...base, status: 'queued', created_at: new Date(now - 30_000) }, done, now)).toBe('Đang tạo · vừa gửi');
  expect(jobNote({ ...base, status: 'succeeded', created_at: fin, finished_at: fin }, done, now)).toBe(fin.toISOString());
  expect(jobNote({ status: 'failed', error: CANCELED_ERROR, created_at: fin, finished_at: fin }, done, now)).toBe('Đã huỷ');
  expect(jobNote({ status: 'failed', error: 'boom', created_at: fin, finished_at: fin }, done, now)).toBe('Không thành công');
});

test('the typical finish time is the median to the 75th percentile of the same model\'s recent successes', () => {
  const done = (modelId: string, secs: number, status = 'succeeded') => ({ status, modelId, createdAt: '2026-11-12T10:00:00Z', finishedAt: new Date(Date.parse('2026-11-12T10:00:00Z') + secs * 1000).toISOString() });
  const running = { status: 'running', modelId: 'm' };
  const four = [60, 120, 180, 240].map((s) => done('m', s));
  expect(typicalLabel(running, four)).toBe('thường xong sau ~3–4 phút');
  expect(typicalLabel({ status: 'submitting', modelId: 'm' }, four)).toBe('thường xong sau ~3–4 phút');
  // Other models, failures and unfinished jobs are no samples; fewer than three samples show nothing.
  expect(typicalLabel(running, [...four.slice(0, 2), done('other', 100), done('m', 100, 'failed'), { status: 'running', modelId: 'm', createdAt: '2026-11-12T10:00:00Z', finishedAt: null }])).toBeNull();
  expect(typicalLabel({ status: 'queued', modelId: 'm' }, four)).toBeNull();
  expect(typicalLabel({ status: 'succeeded', modelId: 'm' }, four)).toBeNull();
  expect(typicalLabel(running, [20, 30, 40].map((s) => done('m', s)))).toBe('thường xong sau dưới 1 phút');
  expect(typicalLabel(running, [150, 150, 150].map((s) => done('m', s)))).toBe('thường xong sau ~2–3 phút');
  expect(typicalLabel(running, [180, 180, 180].map((s) => done('m', s)))).toBe('thường xong sau ~3 phút');
});
