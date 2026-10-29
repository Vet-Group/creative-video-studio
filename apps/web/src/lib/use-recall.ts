'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';

/** The model and settings of the member's latest job on a page (GET /api/recall); a field is null when the page keeps its default for it. */
export interface Recalled {
  modelId: string;
  ratio: string | null;
  durationSec: number | null;
  resolution: string | null;
  audio: boolean | null;
  enhance: boolean | null;
  storeId: string | null;
}

/**
 * The page opens as the member last ran it: `apply` gets the remembered settings once, unless a refill or the member's own edit came first (`touch`).
 * `answered` is false until the answer (or a failure, which counts as no memory) is in, so Run waits for it. With `skip` (a refill opens the page) nothing is fetched.
 */
export function useRecall(feature: string, apply: (s: Recalled) => void, { format, skip = false }: { format?: string; skip?: boolean } = {}): { answered: boolean; touch: () => void } {
  const [answered, setAnswered] = useState(skip);
  const touched = useRef(false);
  const fill = useRef(apply);
  fill.current = apply;
  useEffect(() => {
    if (skip) return;
    let stale = false;
    api<{ settings: Recalled | null }>(`/api/recall?feature=${feature}${format ? `&format=${format}` : ''}`)
      .then((r) => !stale && !touched.current && r.settings && fill.current(r.settings))
      .catch(() => undefined) // no memory: the defaults stay
      .finally(() => !stale && setAnswered(true));
    return () => {
      stale = true;
    };
  }, []);
  return { answered, touch: () => void (touched.current = true) };
}
