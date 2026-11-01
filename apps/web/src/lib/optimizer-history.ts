/** Media Optimizer keeps this many results of the session, newest first; older ones are dropped. */
export const MAX_HISTORY = 20;

/** The list with `entry` first, and the entries pushed out of it (whose object URLs the caller revokes). */
export function addHistory<T>(list: T[], entry: T, max = MAX_HISTORY): { list: T[]; dropped: T[] } {
  const next = [entry, ...list];
  return { list: next.slice(0, max), dropped: next.slice(max) };
}
