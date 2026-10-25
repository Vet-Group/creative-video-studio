'use client';
import { useEffect, useState } from 'react';

let pending: Promise<Set<string>> | null = null;

function load(): Promise<Set<string>> {
  pending ??= fetch('/api/samples')
    .then((r) => (r.ok ? (r.json() as Promise<{ samples: { name: string }[] }>) : { samples: [] }))
    .then((b) => new Set(b.samples.map((s) => s.name)))
    .catch(() => new Set<string>());
  return pending;
}

/** The names of the uploaded samples (lib/samples.ts), loaded once per page; empty until then, so every slot starts on its fallback. */
export function useSamples(): Set<string> {
  const [have, setHave] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let live = true;
    void load().then((s) => live && setHave(s));
    return () => {
      live = false;
    };
  }, []);
  return have;
}

