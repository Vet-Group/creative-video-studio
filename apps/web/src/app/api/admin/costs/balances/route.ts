import { BILLING_URLS, isLow, readBytePlusPack } from '@cvs/core/providers/balances';
import { pool } from '@/lib/auth';
import { falBalance } from '@/lib/provider-credit';
import { guard } from '@/lib/session';

/**
 * Admin: the provider balances (docs/ops/provider-balances.md): fal's live from its API (a good read is kept a minute), the warning threshold, each provider's billing page, and `low` when
 * a balance in USD is under the threshold. Vertex's credits come from /api/admin/costs/vertex, which already reads them from Google.
 * BytePlus has no balance API: `byteplus.pack` is the Seedance 2.0 resource pack the Admin entered, minus the tokens of the jobs finished since (null when none is entered).
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const warningUsd = Number((await pool.query('select balance_warning_usd::text as usd from settings where id = 1')).rows[0].usd);
  const fal = await falBalance();
  return Response.json({
    warningUsd,
    fal: { ...fal, billingUrl: BILLING_URLS.fal, low: fal.ok && isLow(fal.currency === 'USD' ? fal.balance : null, warningUsd) },
    vertex: { billingUrl: BILLING_URLS.vertex },
    byteplus: { billingUrl: BILLING_URLS.byteplus, pack: await readBytePlusPack(pool) },
  });
}
