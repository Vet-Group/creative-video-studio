import { useSyncExternalStore } from 'react';

const never = () => () => {};

/** False while the page is server-rendered and until React has attached its handlers; controls whose events would be lost before then stay disabled. */
export const useHydrated = (): boolean => useSyncExternalStore(never, () => true, () => false);
