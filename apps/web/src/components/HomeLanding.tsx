'use client';
import { useEffect } from 'react';
import { HOME_COOKIE } from '@/lib/landing';

/** Saves the landing page of the member's team for src/proxy.ts (see HOME_COOKIE); it follows an Admin's change of the team's tool from the next page on. */
export function HomeLanding({ tool }: { tool: string }) {
  useEffect(() => {
    document.cookie = `${HOME_COOKIE}=${tool}; path=/; max-age=31536000; samesite=lax`;
  }, [tool]);
  return null;
}
