'use client';
import { useEffect, useRef } from 'react';

/** Runs `run` when the tab comes back to the front, so a page that loads once shows what changed while it was in the background. */
export function useTabReturn(run: () => void): void {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    const back = () => document.visibilityState === 'visible' && latest.current();
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, []);
}
