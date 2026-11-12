'use client';
import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'cvs.draft.';
/** Keys restored in this document, so a page opened again by in-app navigation starts as it always did. */
const restored = new Set<string>();

// Storage can be blocked (a privacy setting) or full: a draft is a convenience, so every access swallows the error.
export function readDraft(key: string): string {
  try {
    return sessionStorage.getItem(PREFIX + key) ?? '';
  } catch {
    return '';
  }
}

export function writeDraft(key: string, text: string): void {
  try {
    if (text) sessionStorage.setItem(PREFIX + key, text);
    else sessionStorage.removeItem(PREFIX + key);
  } catch {
    // no draft, nothing else lost
  }
}

/**
 * A prompt that survives a reload of the tab: the text is kept per page in sessionStorage as it is typed, and the form takes it back when the
 * tab is reloaded, never over a refill (`skip`, set while a link or template fills the form) or a text already there. `clear` drops it after a successful Run.
 * Only a reload restores it, so opening the page afresh (a link, the sidebar, a new tab) is blank as before.
 */
export function useDraftState(key: string, skip = false, initial = ''): [string, (text: string) => void, () => void] {
  const [text, setText] = useState(initial);
  useEffect(() => {
    if (skip || restored.has(key)) return;
    restored.add(key);
    if ((performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type !== 'reload') return;
    const draft = readDraft(key);
    if (draft) setText((cur) => cur || draft);
  }, []);
  const set = useCallback(
    (next: string) => {
      setText(next);
      writeDraft(key, next);
    },
    [key],
  );
  const clear = useCallback(() => writeDraft(key, ''), [key]);
  return [text, set, clear];
}
