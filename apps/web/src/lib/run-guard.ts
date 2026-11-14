// What every form's Run goes through: a confirm before a costly job, and Ctrl+Enter (Cmd+Enter) in the prompt.
import type { KeyboardEvent } from 'react';
import { confirmDialog } from '@/components/Confirm';
import { ApiError } from '@/lib/api';

/** A Run whose button shows this many USD or more asks first. */
export const RUN_CONFIRM_USD = 1;

/** True when the Run may go: the price is unknown or under RUN_CONFIRM_USD, or the member said yes. */
export async function confirmRun(usd: string | number | null | undefined, text?: string): Promise<boolean> {
  if (usd === null || usd === undefined || !(Number(usd) >= RUN_CONFIRM_USD)) return true;
  return confirmDialog({ title: text ?? `Tạo lượt này với giá $${usd}?`, confirmLabel: 'Tiếp tục' });
}

/**
 * A rerun asks for the price it shows, which the job sends as `maxUsd`; when the server's current price is higher it answers 409 with that price and nothing is reserved, and
 * the member is asked again about that price. False when the member says no.
 */
export async function confirmRerun(shownUsd: string | null | undefined, ask: (usd: string | null | undefined) => string, send: (maxUsd: number) => Promise<unknown>): Promise<boolean> {
  let usd = shownUsd;
  for (;;) {
    if (!(await confirmRun(usd, ask(usd)))) return false;
    try {
      await send(Number(usd ?? 0));
      return true;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409 && e.estimateUsd !== null)) throw e;
      usd = e.estimateUsd;
    }
  }
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
