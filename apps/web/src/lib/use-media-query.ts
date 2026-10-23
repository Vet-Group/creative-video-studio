'use client';
import { useCallback, useSyncExternalStore } from 'react';

/** The one layout breakpoint: below 1024 px the app uses the top bar, the drawer and the Create tabs. */
export const NARROW = '(max-width: 1023.98px)';
/** From 1536 px the Examples grid has a fourth column, as the live helper does (REA-video V09). */
export const WIDE = '(min-width: 1536px)';
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** A CSS media query as state. The server and the first client render assume `server`. */
export function useMediaQuery(query: string, server = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => server);
}
