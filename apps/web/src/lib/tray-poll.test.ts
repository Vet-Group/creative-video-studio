// How often the "My jobs" tray reads /api/jobs?mine (components/jobs.tsx): every 5 s only while a job is in flight. The clock is faked; nothing sleeps.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BUSY_POLL_MS, IDLE_POLL_MS, pollTray } from './tray-poll';

let stop = () => {};
beforeEach(() => void vi.useFakeTimers());
afterEach(() => {
  stop();
  vi.useRealTimers();
});

test('with nothing in flight the tray reads every 30 s, not every 5 s', async () => {
  const read = vi.fn(async () => false);
  ({ stop } = pollTray(read));
  await vi.advanceTimersByTimeAsync(IDLE_POLL_MS - 1);
  expect(read).toHaveBeenCalledTimes(1); // the first read, at once
  await vi.advanceTimersByTimeAsync(1);
  expect(read).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(read).toHaveBeenCalledTimes(22); // 40 tabs left open: 1.3 reads a second instead of 8
});

test('a job in flight is read every 5 s until a read finds it finished, then the tray slows down again', async () => {
  let busy = true;
  const read = vi.fn(async () => busy);
  ({ stop } = pollTray(read));
  await vi.advanceTimersByTimeAsync(4 * BUSY_POLL_MS);
  expect(read).toHaveBeenCalledTimes(5);
  busy = false;
  await vi.advanceTimersByTimeAsync(BUSY_POLL_MS); // this read sees the result
  expect(read).toHaveBeenCalledTimes(6);
  await vi.advanceTimersByTimeAsync(IDLE_POLL_MS - 1);
  expect(read).toHaveBeenCalledTimes(6);
  await vi.advanceTimersByTimeAsync(1);
  expect(read).toHaveBeenCalledTimes(7);
});

test('a job started in this tab is read at once and then every 5 s, without waiting out the idle delay', async () => {
  let busy = false;
  const read = vi.fn(async () => busy);
  const poll = pollTray(read);
  stop = poll.stop;
  await vi.advanceTimersByTimeAsync(10_000);
  busy = true; // Run was pressed: the form refreshes the tray
  await poll.now();
  expect(read).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(BUSY_POLL_MS);
  expect(read).toHaveBeenCalledTimes(3);
});

test('reads that overlap leave one timer behind, a failed read keeps the polling going, and stop ends it', async () => {
  const read = vi.fn(async () => true);
  const poll = pollTray(read);
  await Promise.all([poll.now(), poll.now()]);
  expect(read).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(BUSY_POLL_MS);
  expect(read).toHaveBeenCalledTimes(4); // one read, not two
  read.mockRejectedValueOnce(new Error('network'));
  await poll.now().catch(() => {});
  await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);
  expect(read).toHaveBeenCalledTimes(6);
  poll.stop();
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(read).toHaveBeenCalledTimes(6);
});
