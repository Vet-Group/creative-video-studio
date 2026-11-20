/** The tray reads the user's jobs this often while one of them is in flight; a hidden tab too, since its title, chime and notification announce the finish. */
export const BUSY_POLL_MS = 5_000;
/** And this often while none is: all there is to see then is a job started in another tab or on another device (one started here is read at once). */
export const IDLE_POLL_MS = 30_000;

/**
 * Reads with `read` (which says whether a job is in flight) at once, then again after BUSY_POLL_MS or IDLE_POLL_MS, until `stop`. `now` reads at once and
 * restarts the wait from that read, so a job just started in this tab is watched every 5 s from the start instead of after an idle wait.
 */
export function pollTray(read: () => Promise<boolean>): { now: () => Promise<void>; stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest = 0; // only the newest read sets the next wait, so reads that overlap never leave two timers
  let stopped = false;
  const now = async () => {
    const mine = ++latest;
    clearTimeout(timer);
    let busy = false;
    try {
      busy = await read();
    } finally {
      if (!stopped && mine === latest) timer = setTimeout(() => void now(), busy ? BUSY_POLL_MS : IDLE_POLL_MS);
    }
  };
  void now();
  return {
    now,
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
