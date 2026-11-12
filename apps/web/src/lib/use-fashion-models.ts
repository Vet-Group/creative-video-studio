'use client';
import { useEffect, useState } from 'react';
import { api } from './api';
import type { FashionModelItem } from './fashion-models';

/**
 * The saved AI models the member may use (GET /api/fashion-models): `models` is null while loading and empty when the request failed, so a picker just shows no group.
 * `active` false waits (a dialog not open yet); `version` reads the list again (after a save, a share or a delete).
 */
export function useFashionModels(active = true, version = 0): { models: FashionModelItem[] | null; failed: boolean } {
  const [state, setState] = useState<{ models: FashionModelItem[] | null; failed: boolean }>({ models: null, failed: false });
  useEffect(() => {
    if (!active) return;
    let live = true; // a later answer wins over a slower earlier one
    api<{ models: FashionModelItem[] }>('/api/fashion-models').then(
      (r) => live && setState({ models: r.models, failed: false }),
      () => live && setState({ models: [], failed: true }),
    );
    return () => void (live = false);
  }, [active, version]);
  return state;
}
