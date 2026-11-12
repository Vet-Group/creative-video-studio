// The personal part of Explore: the greeting and the jobs to continue. Times are Vietnam time, as the server renders them.
import { CANCELED_ERROR } from '@cvs/core/ledger';

const FINISHED = ['succeeded', 'failed', 'failed_unknown', 'timed_out'];

export const isRunning = (job: { status: string }): boolean => !FINISHED.includes(job.status);

/** How long an unfinished job has waited or run, so a slow job does not look stuck; nothing once it finished. A poll re-renders it. */
export function elapsedLabel(job: { status: string; createdAt: string }, now = Date.now()): string | null {
  if (FINISHED.includes(job.status)) return null;
  const min = Math.floor((now - Date.parse(job.createdAt)) / 60_000);
  if (min < 1) return 'vừa gửi';
  return `${job.status === 'queued' ? 'đã chờ' : 'đã chạy'} ${min < 60 ? `${min} phút` : `${Math.floor(min / 60)} giờ ${min % 60} phút`}`;
}

/** The given name of a full name: Vietnamese names put it last; '' for an empty name. */
export const givenName = (name: string | null | undefined): string => (name ?? '').trim().split(/\s+/).at(-1) ?? '';

/** Good morning, afternoon or evening by given name, for the hour in Vietnam: morning 4:00-11:59, afternoon 12:00-17:59, evening otherwise. */
export function greeting(name: string | null | undefined, at: Date): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh' }).format(at));
  const part = hour >= 4 && hour < 12 ? 'sáng' : hour >= 12 && hour < 18 ? 'chiều' : 'tối';
  const given = givenName(name);
  return given ? `Chào buổi ${part}, ${given}` : `Chào buổi ${part}`;
}

/** The jobs to continue from newest-first jobs: the running ones first, then the latest finished, at most `cap`. */
export const continueJobs = <T extends { status: string }>(jobs: readonly T[], cap = 4): T[] => [...jobs.filter(isRunning), ...jobs.filter((j) => !isRunning(j))].slice(0, cap);

/** The one-line note under a recent job: elapsed while running, the finish time when done (via `done`), 'Đã huỷ' for a cancel, else a failure note. */
export function jobNote(j: { status: string; error: string | null; created_at: Date; finished_at: Date | null }, done: (d: Date) => string, now = Date.now()): string {
  if (isRunning(j)) {
    const el = elapsedLabel({ status: j.status, createdAt: j.created_at.toISOString() }, now);
    return el ? `Đang tạo · ${el}` : 'Đang tạo';
  }
  if (j.status === 'succeeded') return done(j.finished_at ?? j.created_at);
  return j.error === CANCELED_ERROR ? 'Đã huỷ' : 'Không thành công';
}
