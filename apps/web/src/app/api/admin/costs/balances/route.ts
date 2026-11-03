import { BILLING_URLS, type FalBalance, isLow, readFalBalance, replicateCredit } from '@cvs/core/providers/balances';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

const CACHE_MS = 60_000;
let falCache: { at: number; fal: Extract<FalBalance, { ok: true }> } | undefined;

/**
 * Admin: the provider balances (docs/ops/provider-balances.md): fal's live from its API (a good read is kept a minute), Replicate's remaining
 * prepaid credit from the ledger (`credit` null until the Admin enters it), the warning threshold, each provider's billing page, and `low` when
 * a balance in USD is under the threshold. Vertex's credits come from /api/admin/costs/vertex, which already reads them from Google.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const [settings, credit] = await Promise.all([pool.query('select balance_warning_usd::text as usd from settings where id = 1'), replicateCredit(pool)]);
  const warningUsd = Number(settings.rows[0].usd);
  let fal: FalBalance;
  if (falCache && Date.now() - falCache.at < CACHE_MS) fal = falCache.fal;
  else {
    fal = await readFalBalance({ key: process.env.FAL_KEY });
    falCache = fal.ok ? { at: Date.now(), fal } : undefined;
  }
  return Response.json({
    warningUsd,
    fal: { ...fal, billingUrl: BILLING_URLS.fal, low: fal.ok && isLow(fal.currency === 'USD' ? fal.balance : null, warningUsd) },
    replicate: { credit, billingUrl: BILLING_URLS.replicate, low: isLow(credit?.remainingUsd ?? null, warningUsd) },
    vertex: { billingUrl: BILLING_URLS.vertex },
    byteplus: { billingUrl: BILLING_URLS.byteplus },
  });
}
