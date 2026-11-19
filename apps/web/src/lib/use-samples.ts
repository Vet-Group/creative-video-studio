'use client';
import { useEffect, useState } from 'react';

let pending: Promise<Set<string>> | null = null;
const listeners = new Set<(have: Set<string>) => void>();
const versions = new Map<string, string>();
/** Whether the last list request failed: the pages then say so with a retry rather than "no samples yet". */
let failed = false;
/** The last list read, so a page mounted later starts on it instead of an empty list. */
let known: Set<string> | null = null;
let retries = 0;
/** The waits before the next tries after a failed list, so a server that recovers fills the pages without a reload. */
export const RETRY_MS = [3_000, 10_000, 30_000];

function load(): Promise<Set<string>> {
  pending ??= fetch('/api/samples')
    .then((r) => {
      if (!r.ok) throw new Error(`samples ${r.status}`);
      return r.json() as Promise<{ samples: { name: string; version: string }[] }>;
    })
    .then((b) => {
      failed = false;
      retries = 0;
      for (const s of b.samples) versions.set(s.name, s.version);
      known = new Set(b.samples.map((s) => s.name));
      return known;
    })
    .catch(() => {
      // A failure is never kept: the next mount or the timer below asks again.
      failed = true;
      pending = null;
      const wait = RETRY_MS[retries++];
      if (wait !== undefined) setTimeout(reloadSamples, wait);
      return new Set<string>();
    });
  return pending;
}

/** Whether the sample list failed to load (read on the render after useSamples updates). */
export const samplesFailed = (): boolean => failed;

/** Whether the list has not answered yet (neither read nor failed): pages show a skeleton rather than the built-in test patterns that stand for an empty list. */
export const samplesPending = (): boolean => known === null && !failed;

/** A sample's URL with its version, so a replaced file is fetched anew rather than from the browser's hour-long cache. */
export const versionedSample = (src: string): string => {
  const v = versions.get(src.slice(src.lastIndexOf('/') + 1));
  return v ? `${src}?v=${v}` : src;
};

/** A sample picture's small thumbnail, for a picker tile; picking still copies the full sample by its name. */
export const sampleThumb = (name: string): string => `/api/samples/${name}?thumb=1`;

/** Reads the list again after an upload or a failed load, for every mounted useSamples. */
export function reloadSamples(): void {
  pending = null;
  void load().then((have) => listeners.forEach((set) => set(have)));
}

/** The names of the uploaded samples (lib/samples.ts), loaded once per page; empty until then, so every slot starts on its fallback. */
export function useSamples(): Set<string> {
  const [have, setHave] = useState<Set<string>>(() => known ?? new Set());
  useEffect(() => {
    let live = true;
    const set = (s: Set<string>) => live && setHave(s);
    listeners.add(set);
    void load().then(set);
    return () => {
      live = false;
      listeners.delete(set);
    };
  }, []);
  return have;
}

