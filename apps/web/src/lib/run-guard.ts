// What every form's Run goes through: a confirm before a costly job, and Ctrl+Enter (Cmd+Enter) in the prompt.
import type { KeyboardEvent } from 'react';
import { confirmDialog } from '@/components/Confirm';
import { api, ApiError, sendJson } from '@/lib/api';

/** A Run whose button shows this many USD or more asks first. */
export const RUN_CONFIRM_USD = 1;

/**
 * A price as the forms show it: dollars and cents with thousands separators ($0.70, $99,841.81) and, under a dollar, up to 4 decimals with no trailing zeros
 * ($0.035, $0.0035), so a small price is never shown as free and a per-item line ("3 × $0.035 = $0.105") adds up.
 */
export function usd(value: string | number): string {
  const n = Number(value);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: Math.abs(n) < 1 ? 4 : 2 });
}

/** True when the Run may go: the price is unknown or under RUN_CONFIRM_USD, or the member said yes. */
export async function confirmRun(usd: string | number | null | undefined, text?: string): Promise<boolean> {
  if (usd === null || usd === undefined || !(Number(usd) >= RUN_CONFIRM_USD)) return true;
  return confirmDialog({ title: text ?? `Tạo lượt này với giá $${usd}?`, confirmLabel: 'Tiếp tục' });
}

/** Each feature's last Run sent in this page load, as its JSON body. */
const lastRuns = new Map<string, string>();

/**
 * Sends a Run's job and returns true. A body identical to the last one this page load sent for the same feature asks first, as Fash's "Run Again?";
 * when the member says no, nothing is sent and false comes back. A Run counts once the server took it.
 */
export async function sendRun(body: Record<string, unknown>): Promise<boolean> {
  const feature = typeof body.feature === 'string' ? body.feature : 'video';
  const json = JSON.stringify(body);
  const again = lastRuns.get(feature) === json;
  if (again && !(await confirmDialog({ title: 'Chạy lại đúng các cài đặt vừa gửi?', body: 'Bạn vừa gửi một lượt tạo y hệt. Lượt mới tạo thêm một kết quả và tính phí như lượt trước.', confirmLabel: 'Chạy lại' }))) return false;
  await api('/api/jobs', sendJson('POST', body));
  lastRuns.set(feature, json);
  return true;
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
