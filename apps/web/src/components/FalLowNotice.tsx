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

/** Admins: the notice on every page while fal's balance is low, read once when the app loads; a failed read shows nothing. */
export function FalLowNotice() {
  const [low, setLow] = useState<{ balance: number; warningUsd: number; billingUrl: string } | null>(null);
  useEffect(() => {
    api<Balances>('/api/admin/costs/balances')
      .then((b) => b.fal.low && b.fal.balance !== undefined && setLow({ balance: b.fal.balance, warningUsd: b.warningUsd, billingUrl: b.fal.billingUrl }))
      .catch(() => {});
  }, []);
  return low && <FalLowText {...low} />;
}
