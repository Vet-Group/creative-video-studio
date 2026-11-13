'use client';
// Whether the Smart Remake app is on (both REA flags, read on the server in app/(app)/layout.tsx): the Apps index and the change-app menu leave it out otherwise.
import { createContext, type ReactNode, useContext } from 'react';

const Gate = createContext(false);

export function SmartRemakeGate({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <Gate.Provider value={enabled}>{children}</Gate.Provider>;
}

export const useSmartRemakeEnabled = (): boolean => useContext(Gate);
