import { bad, isMonth } from '@/lib/admin';
import { billingMonth } from '@/lib/billing';
import { guard } from '@/lib/session';

/**
 * Admin: the month's billing (`?month=YYYY-MM`, default this ICT month; docs/BILLING.md): each billing team with its members, stores, total, free
 * allowance and payable, each partner workspace, the company's cost by reason, the totals and whether they reconcile with the ledger, and the lines
 * behind each bucket. A closed month comes from its snapshot.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const month = new URL(request.url).searchParams.get('month');
  if (month !== null && !isMonth(month)) return bad('month must look like 2026-11');
  return Response.json(await billingMonth(month));
}
