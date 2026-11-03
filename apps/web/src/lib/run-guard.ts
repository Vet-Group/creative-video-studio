// What every form's Run goes through: a confirm before a costly job, and Ctrl+Enter (Cmd+Enter) in the prompt.
import type { KeyboardEvent } from 'react';
import { confirmDialog } from '@/components/Confirm';

/** A Run whose button shows this many USD or more asks first. */
export const RUN_CONFIRM_USD = 1;

/** True when the Run may go: the price is unknown or under RUN_CONFIRM_USD, or the member said yes. */
export async function confirmRun(usd: string | number | null | undefined, text?: string): Promise<boolean> {
  if (usd === null || usd === undefined || !(Number(usd) >= RUN_CONFIRM_USD)) return true;
  return confirmDialog({ title: text ?? `Chạy job này với giá $${usd}?`, confirmLabel: 'Tiếp tục' });
}

type RunKeyEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'repeat' | 'preventDefault'> & { nativeEvent: { isComposing: boolean } };

/** A keydown handler that calls `go` on Ctrl+Enter or Cmd+Enter, but not on a held key or while an input method is composing (Vietnamese Telex). */
export const runKey =
  (go: () => void) =>
  (e: RunKeyEvent): void => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.repeat || e.nativeEvent.isComposing) return;
    e.preventDefault();
    go();
  };
