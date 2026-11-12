'use client';
// Explore is server-rendered with no poll, so a running job's elapsed note (jobNote) would freeze at page-load time.
// This leaf re-renders itself each minute while the job runs, so the elapsed label keeps up like it does in the jobs tray.
import { useEffect, useState } from 'react';
import { isRunning, jobNote } from '@/lib/explore';

type NoteJob = { status: string; error: string | null; created_at: Date; finished_at: Date | null };

/**
 * `initial` is the note the server already rendered; the leaf shows it until mounted (so hydration matches), then, only
 * for a running job, recomputes jobNote on a one-minute tick. `done` is the finish label the server formatted in Vietnam time.
 */
export function ExploreJobNote({ job, done, initial }: { job: NoteJob; done: string; initial: string }) {
  const [live, setLive] = useState<string | null>(null);
  useEffect(() => {
    if (!isRunning(job)) return;
    const update = () => setLive(jobNote(job, () => done));
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, [job, done]);
  return <>{live ?? initial}</>;
}
