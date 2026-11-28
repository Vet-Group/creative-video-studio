'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** GET /api/admin/costs/balances, only the fal part this notice reads. */
interface Balances {
  warningUsd: number;
  fal: { ok: boolean; balance?: number; currency?: string; billingUrl: string; low: boolean };
}

/** The notice itself, for a fal balance under the Admin warning threshold (docs/ops/provider-balances.md). */
export function FalLowText({ balance, warningUsd, billingUrl }: { balance: number; warningUsd: number; billingUrl: string }) {
  return (
    <p className="warn fal-low" role="status">
      Số dư fal còn ${balance.toFixed(2)}, dưới ngưỡng cảnh báo ${warningUsd}. Mô hình trên fal sẽ bị khoá khi không đủ tiền cho một lượt tạo.{' '}
      <a href={billingUrl} target="_blank" rel="noopener noreferrer">
        Nạp tiền trên fal
      </a>
    </p>
  );
}

type Low = { balance: number; warningUsd: number; billingUrl: string };
const CACHE_KEY = 'cvs.fal-low';
const CACHE_MS = 5 * 60_000; // the balance moves slowly, and every page load asked the server (and fal) for it

/** Admins: the notice on every page while fal's balance is low, read at most every five minutes of the tab's session; a failed read shows nothing and is not kept. */
export function FalLowNotice() {
  const [low, setLow] = useState<Low | null>(null);
  useEffect(() => {
    try {
      const hit = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? 'null') as { at: number; low: Low | null } | null;
      if (hit && Date.now() - hit.at < CACHE_MS) return setLow(hit.low);
    } catch {
      // No storage, or a damaged entry: ask the server.
    }
    api<Balances>('/api/admin/costs/balances')
      .then((b) => {
        const next = b.fal.low && b.fal.balance !== undefined ? { balance: b.fal.balance, warningUsd: b.warningUsd, billingUrl: b.fal.billingUrl } : null;
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), low: next }));
        } catch {
          // Storage is full or off: the next page asks again.
        }
        setLow(next);
      })
      .catch(() => {});
  }, []);
  return low && <FalLowText {...low} />;
}
