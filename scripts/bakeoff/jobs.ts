// The bake-off job log and the sets of jobs (plan B.4). Every state change is one appended JSON line, so a killed run loses nothing.
import { appendFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface JobKey {
  /** 1-based image number. */
  image: number;
  model: string;
  /** 'bakeoff' for the canary and both halves, 'extra' for the extra round, 'smoke' for the D.5 clip. */
  round: string;
}
export const keyId = (k: JobKey): string => `${k.image}|${k.model}|${k.round}`;

/**
 * submitting: written before the provider is called; submitted: the provider answered with an id; succeeded, failed: final;
 * timeout: still unfinished when polling stopped (polled again on a rerun); unknown: submitting with no id, never resubmitted;
 * not_funded: the provider refused for lack of credit, so nothing was billed and the key may be submitted again after a top-up.
 */
export type JobStatus = 'submitting' | 'submitted' | 'succeeded' | 'failed' | 'timeout' | 'unknown' | 'not_funded';
const STATUSES: JobStatus[] = ['submitting', 'submitted', 'succeeded', 'failed', 'timeout', 'unknown', 'not_funded'];

export interface JobLine extends JobKey {
  at: string;
  provider: 'fal' | 'replicate' | 'mock';
  status: JobStatus;
  estimateUsd: number;
  set?: string;
  providerJobId?: string;
  costUsd?: number;
  costSource?: 'reported' | 'estimate';
  /** The downloaded clip, relative to the out folder. */
  clip?: string;
  error?: string;
}

/** The job log every run appends to. */
export const JOBS_FILE = 'jobs.jsonl';

export function appendLine(outDir: string, line: JobLine): void {
  mkdirSync(outDir, { recursive: true });
  appendFileSync(join(outDir, JOBS_FILE), `${JSON.stringify(line)}\n`);
}

/**
 * Every line of every *.jsonl in the out folder, oldest first (stable by timestamp). A line that does not parse stops the run: skipping it
 * could hide spend.
 */
export function readLines(outDir: string): JobLine[] {
  let files: string[];
  try {
    files = readdirSync(outDir).filter((f) => f.endsWith('.jsonl')).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const lines: JobLine[] = [];
  for (const f of files) {
    readFileSync(join(outDir, f), 'utf8').split('\n').forEach((text, i) => {
      if (!text.trim()) return;
      let v: Partial<JobLine>;
      try {
        v = JSON.parse(text) as Partial<JobLine>;
      } catch {
        throw new Error(`${f}:${i + 1}: not valid JSON; fix or remove the line before spending anything`);
      }
      const ok = typeof v.image === 'number' && typeof v.model === 'string' && typeof v.round === 'string' && typeof v.at === 'string' &&
        typeof v.estimateUsd === 'number' && STATUSES.includes(v.status as JobStatus);
      if (!ok) throw new Error(`${f}:${i + 1}: not a job log line; fix or remove it before spending anything`);
      lines.push(v as JobLine);
    });
  }
  return lines.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** The latest line of each key. */
export function latest(lines: JobLine[]): Map<string, JobLine> {
  const m = new Map<string, JobLine>();
  for (const l of lines) m.set(keyId(l), l);
  return m;
}

/** What one key counts against the cap: the larger of estimate and reported once final, the estimate while in flight or unknown, 0 if refused. */
export const lineSpend = (l: JobLine): number =>
  l.status === 'not_funded' ? 0 : l.status === 'succeeded' || l.status === 'failed' ? Math.max(l.estimateUsd, l.costUsd ?? 0) : l.estimateUsd;

/** Cumulative spend over every out/*.jsonl, in total and per provider. */
export function spend(lines: JobLine[]): { total: number; byProvider: Record<string, number> } {
  const byProvider: Record<string, number> = {};
  let total = 0;
  for (const l of latest(lines).values()) {
    const s = lineSpend(l);
    total += s;
    byProvider[l.provider] = (byProvider[l.provider] ?? 0) + s;
  }
  return { total, byProvider };
}

export type SetName = 'canary' | 'half-1' | 'half-2' | 'extra';
export const SET_NAMES: SetName[] = ['canary', 'half-1', 'half-2', 'extra'];
const SET_IMAGES: Record<Exclude<SetName, 'extra'>, number[]> = { canary: [1], 'half-1': [1, 2, 3, 4, 5], 'half-2': [6, 7, 8, 9, 10] };

/** half-1 contains the canary image, whose jobs are already in the log and are polled, not resubmitted. */
export const inSet = (set: SetName, k: JobKey): boolean =>
  set === 'extra' ? k.round === 'extra' : k.round === 'bakeoff' && SET_IMAGES[set].includes(k.image);

export const roundOf = (set: SetName): string => (set === 'extra' ? 'extra' : 'bakeoff');
export const defaultImages = (set: Exclude<SetName, 'extra'>): number[] => SET_IMAGES[set];

export function parseSet(v: string | undefined): SetName {
  if (!SET_NAMES.includes(v as SetName)) throw new Error(`--set must be one of ${SET_NAMES.join(', ')}`);
  return v as SetName;
}
