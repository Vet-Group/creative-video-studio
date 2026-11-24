// The multi-angle Runs of a History list that can have a 360 turntable video (components/TurntableBlock.tsx).
import { turntableState } from '@cvs/core/turntable';
import type { TrayJob } from './api';

export interface TurntableRun {
  batch: string;
  /** The Run's photo: the first input of its jobs, which names the video with the Run's id. */
  photo: string;
  jobs: TrayJob[];
}

/**
 * The Runs in `jobs` (a list, newest first) that asked for all 7 horizontal views of one photo, keyed by the id of their last card in the list, which the video goes under.
 * A Run the list cuts (it keeps the 20 latest jobs) has fewer views there and is left out, rather than shown as missing views.
 */
export function turntableRuns(jobs: TrayJob[]): Map<string, TurntableRun> {
  const runs = new Map<string, TurntableRun>();
  for (const job of jobs) {
    const photo = job.inputAssetIds[0];
    if (job.feature !== 'multi_angle' || !job.batch || !job.view || !photo) continue;
    const key = `${job.batch}/${photo}`;
    runs.set(key, { batch: job.batch, photo, jobs: [...(runs.get(key)?.jobs ?? []), job] });
  }
  return new Map([...runs.values()].filter((r) => turntableState(r.jobs).complete).map((r) => [r.jobs.at(-1)!.id, r]));
}
