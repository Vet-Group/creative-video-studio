import { CANCELED_ERROR } from '@cvs/core/ledger';
import { expect, test } from 'vitest';
import { continueJobs, givenName, greeting, jobNote, providerQueueLabel, runProgress, todayStat, typicalLabel, waitLabel, waitProgress } from './explore';

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

test('the typical finish time counts from when a job started, so a long queue wait does not inflate it', () => {
  const created = Date.parse('2026-11-12T10:00:00Z');
  // Each waited 10 minutes in the queue, then ran 1, 2, 3 and 4 minutes.
  const waited = [60, 120, 180, 240].map((s) => ({
    status: 'succeeded',
    modelId: 'm',
    createdAt: new Date(created).toISOString(),
    startedAt: new Date(created + 600_000).toISOString(),
    finishedAt: new Date(created + 600_000 + s * 1000).toISOString(),
  }));
  expect(typicalLabel({ status: 'running', modelId: 'm' }, waited)).toBe('thường xong sau ~3–4 phút');
});

test('a running recent job counts its elapsed time from its start', () => {
  const now = Date.parse('2026-11-12T10:00:00Z');
  const job = { status: 'running', error: null, finished_at: null, created_at: new Date(now - 20 * 60_000), started_at: new Date(now - 2 * 60_000) };
  expect(jobNote(job, (d) => d.toISOString(), now)).toBe('Đang tạo · đã chạy 2 phút');
});

test("providerQueueLabel says how many requests are ahead at the provider, only for a running job it still queues", () => {
  expect(providerQueueLabel({ status: 'running', providerQueue: 3 })).toBe('nhà cung cấp còn 3 lượt trước');
  expect(providerQueueLabel({ status: 'running', providerQueue: 0 })).toBe('nhà cung cấp sắp chạy');
  expect(providerQueueLabel({ status: 'running', providerQueue: null })).toBeNull();
  expect(providerQueueLabel({ status: 'queued', providerQueue: 2 })).toBeNull();
  expect(providerQueueLabel({ status: 'succeeded', providerQueue: 1 })).toBeNull();
});

test('the waiting bar eases toward 90% of the typical run time and never claims to be done', () => {
  const start = Date.parse('2026-11-12T10:00:00Z');
  const done = (secs: number) => ({ status: 'succeeded', modelId: 'm', createdAt: new Date(start).toISOString(), finishedAt: new Date(start + secs * 1000).toISOString() });
  const past = [120, 120, 180].map(done); // median 2 min, 75th percentile 3 min
  const job = { status: 'running', modelId: 'm', createdAt: new Date(start).toISOString(), startedAt: new Date(start).toISOString() };
  const at = (secs: number) => waitProgress(job, past, start + secs * 1000)!;
  expect(at(0)).toEqual({ fraction: 0, label: 'Thường mất khoảng 2–3 phút' });
  expect(at(60).fraction).toBeGreaterThan(0.3);
  expect(at(60).fraction).toBeLessThan(at(120).fraction);
  expect(at(170).label).toBe('Thường mất khoảng 2–3 phút');
  // Past the 75th percentile the caption turns honest, and a very long wait still stays under 90%.
  expect(at(190).label).toBe('Lâu hơn thường lệ một chút');
  expect(at(100_000).fraction).toBeLessThanOrEqual(0.9);
  expect(at(100_000).fraction).toBeGreaterThan(0.89);
  // The queue wait is not counted (startedAt); a clock behind the start gives 0; a quick model says so; no history or no run gives nothing.
  expect(waitProgress({ ...job, createdAt: new Date(start - 600_000).toISOString() }, past, start)!.fraction).toBe(0);
  expect(waitProgress(job, past, start - 5000)!.fraction).toBe(0);
  expect(waitProgress(job, [20, 30, 40].map(done), start)!.label).toBe('Thường mất dưới 1 phút');
  expect(waitProgress(job, past.slice(0, 2), start)).toBeNull();
  expect(waitProgress({ ...job, status: 'queued' }, past, start)).toBeNull();
});

test("the hero's day line counts images and clips across kinds, and keeps the clips-left wording for a member with a cap", () => {
  const free = { today: 2, cap: 100_000 };
  expect(todayStat({ clips: 0, images: 0 }, free)).toBe('Hôm nay bạn chưa tạo ảnh hay clip nào');
  expect(todayStat({ clips: 0, images: 3 }, free)).toBe('Hôm nay: 3 ảnh');
  expect(todayStat({ clips: 2, images: 0 }, free)).toBe('Hôm nay: 2 clip');
  expect(todayStat({ clips: 1, images: 3 }, free)).toBe('Hôm nay: 3 ảnh · 1 clip');
  expect(todayStat({ clips: 1, images: 0 }, { today: 2, cap: 5 })).toBe('Hôm nay bạn còn 3/5 clip video');
  expect(todayStat({ clips: 1, images: 4 }, { today: 2, cap: 5 })).toBe('Hôm nay bạn còn 3/5 clip video · 4 ảnh');
  expect(todayStat({ clips: 6, images: 0 }, { today: 6, cap: 5 })).toBe('Hôm nay bạn còn 0/5 clip video');
});

test("a model's usual wait before Run reads as minutes, or under a minute", () => {
  expect(waitLabel({ p50: 150, p75: 200 })).toBe('~2–4 phút');
  expect(waitLabel({ p50: 70, p75: 110 })).toBe('~1–2 phút');
  expect(waitLabel({ p50: 20, p75: 40 })).toBe('dưới 1 phút');
});

test('a fixed usual run time (an analysis) gives the same bar and caption as a job: the range, then past it, longer than usual', () => {
  const t = { p50: 125, p75: 232 };
  expect(runProgress(0, t)).toEqual({ fraction: 0, label: 'Thường mất khoảng 2–4 phút' });
  expect(runProgress(125, t).fraction).toBeGreaterThan(0.7);
  expect(runProgress(125, t).fraction).toBeLessThan(0.9);
  expect(runProgress(300, t).label).toBe('Lâu hơn thường lệ một chút');
});
