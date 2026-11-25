'use client';
// Each page's newest changelog entry time (lib/about-updated.ts pageUpdates, built in app/(app)/layout.tsx): the About pages date themselves from it.
import { createContext, type ReactNode, useContext } from 'react';

const Updates = createContext<Record<string, string>>({});

export function AboutUpdates({ updates, children }: { updates: Record<string, string>; children: ReactNode }) {
  return <Updates.Provider value={updates}>{children}</Updates.Provider>;
}

/** When the page was last changed for members, as an ISO time, or undefined. */
export const usePageUpdate = (path: string | undefined): string | undefined => {
  const updates = useContext(Updates);
  return path ? updates[path] : undefined;
};
