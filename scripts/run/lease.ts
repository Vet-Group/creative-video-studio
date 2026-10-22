// Conductor lease and the watchdog's relaunch decision (plan A.0). Never matches processes by name.
import { closeSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';

export interface Lease {
  pid: number;
  /** Process start time as reported by the OS, so a reused PID is detected. */
  startedAt: string;
}

export const STALE_MIN = 45;
const START_TOLERANCE_MS = 2_000;

/** Atomic create-new; `force` is only for the relay, which replaces its own lease. */
export function writeLease(path: string, lease: Lease, force = false): void {
  if (force) rmSync(path, { force: true });
  const fd = openSync(path, 'wx');
  try {
    writeSync(fd, `${JSON.stringify(lease)}\n`);
  } finally {
    closeSync(fd);
  }
}

export function readLease(path: string): Lease | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Lease;
  } catch {
    return null;
  }
}

/**
 * Relaunch only when the heartbeat is stale AND the leased process is gone or is a different process with a reused PID.
 * `procStartedAt` is the OS start time of `lease.pid`, or null when no such process exists.
 */
export function shouldRelaunch(o: { heartbeat?: string; lease: Lease | null; procStartedAt: string | null; now: Date; finished: boolean }): { relaunch: boolean; why: string } {
  if (o.finished) return { relaunch: false, why: 'run finished' };
  if (o.heartbeat && o.now.getTime() - Date.parse(o.heartbeat) < STALE_MIN * 60_000) return { relaunch: false, why: 'heartbeat fresh' };
  if (!o.lease) return { relaunch: true, why: 'no lease' };
  if (!o.procStartedAt) return { relaunch: true, why: 'leased process gone' };
  if (Math.abs(Date.parse(o.procStartedAt) - Date.parse(o.lease.startedAt)) > START_TOLERANCE_MS) return { relaunch: true, why: 'PID reused by another process' };
  return { relaunch: false, why: 'conductor alive but silent; step timeouts handle it' };
}
