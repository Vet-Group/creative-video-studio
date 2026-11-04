'use client';
import { useEffect, useState } from 'react';

let pending: Promise<Set<string>> | null = null;
const listeners = new Set<(have: Set<string>) => void>();
const versions = new Map<string, string>();

function load(): Promise<Set<string>> {
  pending ??= fetch('/api/samples')
    .then((r) => (r.ok ? (r.json() as Promise<{ samples: { name: string; version: string }[] }>) : { samples: [] }))
    .then((b) => {
      for (const s of b.samples) versions.set(s.name, s.version);
      return new Set(b.samples.map((s) => s.name));
    })
    .catch(() => new Set<string>());
  return pending;
}

/** A sample's URL with its version, so a replaced file is fetched anew rather than from the browser's hour-long cache. */
export const versionedSample = (src: string): string => {
  const v = versions.get(src.slice(src.lastIndexOf('/') + 1));
  return v ? `${src}?v=${v}` : src;
};

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

