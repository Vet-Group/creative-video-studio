// The 360 turntable of the multi-angle app: which views make it and when a Run has them all (shared by the worker's trigger and the page).
import { PRODUCT_VIEWS } from './models';

/** The ids of the 7 horizontal views (45 to 315 degrees, eye level), in the order the camera goes round; the front is the photo itself and `top` is not part of it. */
export const TURNTABLE_VIEWS: readonly string[] = PRODUCT_VIEWS.filter((v) => v.vertical === 0 && v.horizontal > 0)
  .sort((a, b) => a.horizontal - b.horizontal)
  .map((v) => v.id);

const PENDING = ['queued', 'submitting', 'running'];

/**
 * Where a Run stands for its turntable, from its jobs' views and statuses (a retry keeps the Run's id, so a view may have several jobs, and one that succeeded is enough):
 * `ready` when every horizontal view has a succeeded job, else `missing`, the views without one in turntable order, and `pending`, true while a missing view still has a job
 * queued or running. `complete` is whether the Run asked for all 7 views at all.
 */
export function turntableState(jobs: { view: string | null; status: string }[]): { complete: boolean; ready: boolean; missing: string[]; pending: boolean } {
  const missing = TURNTABLE_VIEWS.filter((id) => !jobs.some((j) => j.view === id && j.status === 'succeeded'));
  return {
    complete: TURNTABLE_VIEWS.every((id) => jobs.some((j) => j.view === id)),
    ready: missing.length === 0,
    missing,
    pending: missing.some((id) => jobs.some((j) => j.view === id && PENDING.includes(j.status))),
  };
}
