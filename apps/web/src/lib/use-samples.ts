'use client';
import { useEffect, useState } from 'react';

let pending: Promise<Set<string>> | null = null;
const listeners = new Set<(have: Set<string>) => void>();

function load(): Promise<Set<string>> {
  pending ??= fetch('/api/samples')
    .then((r) => (r.ok ? (r.json() as Promise<{ samples: { name: string }[] }>) : { samples: [] }))
    .then((b) => new Set(b.samples.map((s) => s.name)))
    .catch(() => new Set<string>());
  return pending;
}

/** Reads the list again after an upload, for every mounted useSamples. */
export function reloadSamples(): void {
  pending = null;
  void load().then((have) => listeners.forEach((set) => set(have)));
}

/** The names of the uploaded samples (lib/samples.ts), loaded once per page; empty until then, so every slot starts on its fallback. */
export function useSamples(): Set<string> {
  const [have, setHave] = useState<Set<string>>(() => new Set());
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

