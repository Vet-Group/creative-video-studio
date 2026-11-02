// The personal part of Explore: the greeting and the jobs to continue. Times are Vietnam time, as the server renders them.
const FINISHED = ['succeeded', 'failed', 'failed_unknown', 'timed_out'];

export const isRunning = (job: { status: string }): boolean => !FINISHED.includes(job.status);

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
