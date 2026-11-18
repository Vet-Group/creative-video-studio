// The personal part of Explore: the greeting and the jobs to continue. Times are Vietnam time, as the server renders them.
import { CANCELED_ERROR } from '@cvs/core/ledger';

const FINISHED = ['succeeded', 'failed', 'failed_unknown', 'timed_out'];

export const isRunning = (job: { status: string }): boolean => !FINISHED.includes(job.status);

/** When a job began to run: its `startedAt` (set once the provider took it), else its `createdAt` (a row without one, or a job still being sent). */
const runStart = (job: { createdAt: string; startedAt?: string | null }): number => Date.parse(job.startedAt ?? job.createdAt);

/** How long an unfinished job has waited (queued, from `createdAt`) or run (from `startedAt`, so the queue wait is not counted twice), so a slow job does
 * not look stuck; nothing once it finished. A poll re-renders it. */
export function elapsedLabel(job: { status: string; createdAt: string; startedAt?: string | null }, now = Date.now()): string | null {
  if (FINISHED.includes(job.status)) return null;
  const min = Math.floor((now - (job.status === 'queued' ? Date.parse(job.createdAt) : runStart(job))) / 60_000);
  if (min < 1) return 'vừa gửi';
  return `${job.status === 'queued' ? 'đã chờ' : 'đã chạy'} ${min < 60 ? `${min} phút` : `${Math.floor(min / 60)} giờ ${min % 60} phút`}`;
}

/** A running job the provider still holds in its own queue (fal's queue_position): how many requests are ahead of it, so a wait there does not look like a stuck job. */
export const providerQueueLabel = (job: { status: string; providerQueue?: number | null }): string | null =>
  job.status !== 'running' || job.providerQueue == null ? null : job.providerQueue === 0 ? 'nhà cung cấp sắp chạy' : `nhà cung cấp còn ${job.providerQueue} lượt trước`;

const TYPICAL_SAMPLES = 10;
const TYPICAL_MIN_SAMPLES = 3;

type TypicalJob = { status: string; modelId: string };
type PastJob = { status: string; modelId: string; createdAt: string; startedAt?: string | null; finishedAt: string | null };

/** The median and 75th percentile, in seconds, of the run time (start to finish, without the queue wait) of the member's own latest succeeded jobs on
 * a submitting or running job's model (`jobs` newest first). Nothing for another status or with fewer than three samples. */
function typicalRun(job: TypicalJob, jobs: readonly PastJob[]): { p50: number; p75: number } | null {
  if (job.status !== 'submitting' && job.status !== 'running') return null;
  const secs = jobs
    .filter((j) => j.status === 'succeeded' && j.modelId === job.modelId && j.finishedAt)
    .slice(0, TYPICAL_SAMPLES)
    .map((j) => (Date.parse(j.finishedAt!) - runStart(j)) / 1000)
    .filter((s) => s > 0)
    .sort((a, b) => a - b);
  if (secs.length < TYPICAL_MIN_SAMPLES) return null;
  const at = (q: number) => secs[Math.min(secs.length - 1, Math.floor(q * secs.length))]!;
  return { p50: at(0.5), p75: at(0.75) };
}

/** The usual run time as a range of whole minutes ("2–3 phút"); null when the 75th percentile is under a minute. */
function typicalSpan({ p50, p75 }: { p50: number; p75: number }): string | null {
  if (p75 < 60) return null;
  const lo = Math.max(1, Math.floor(p50 / 60));
  const hi = Math.max(lo, Math.ceil(p75 / 60));
  return `${lo === hi ? lo : `${lo}–${hi}`} phút`;
}

/** What a submitting or running job usually takes, as a range of minutes (see `typicalRun`). */
export function typicalLabel(job: TypicalJob, jobs: readonly PastJob[]): string | null {
  const t = typicalRun(job, jobs);
  if (!t) return null;
  const span = typicalSpan(t);
  return `thường xong sau ${span ? `~${span}` : 'dưới 1 phút'}`;
}

/**
 * The bar and the caption of a running job's waiting picture, from the time since it started against its model's usual run time. The fraction eases toward
 * 0.9 and never reaches it, so the bar never claims "done"; past the usual range the caption says so. Null without enough history, so no bar is invented.
 */
export function waitProgress(job: TypicalJob & { createdAt: string; startedAt?: string | null }, jobs: readonly PastJob[], now = Date.now()): { fraction: number; label: string } | null {
  const t = typicalRun(job, jobs);
  if (!t) return null;
  const elapsed = Math.max(0, (now - runStart(job)) / 1000);
  const span = typicalSpan(t);
  return {
    fraction: 0.9 * (1 - Math.exp((-1.6 * elapsed) / t.p50)),
    label: elapsed > t.p75 ? 'Lâu hơn thường lệ một chút' : span ? `Thường mất khoảng ${span}` : 'Thường mất dưới 1 phút',
  };
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
export function jobNote(j: { status: string; error: string | null; created_at: Date; started_at?: Date | null; finished_at: Date | null }, done: (d: Date) => string, now = Date.now()): string {
  if (isRunning(j)) {
    const el = elapsedLabel({ status: j.status, createdAt: j.created_at.toISOString(), startedAt: j.started_at?.toISOString() ?? null }, now);
    return el ? `Đang tạo · ${el}` : 'Đang tạo';
  }
  if (j.status === 'succeeded') return done(j.finished_at ?? j.created_at);
  return j.error === CANCELED_ERROR ? 'Đã huỷ' : 'Không thành công';
}
