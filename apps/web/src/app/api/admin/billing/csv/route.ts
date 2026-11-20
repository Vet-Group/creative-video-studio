import { bad, isMonth } from '@/lib/admin';
import { billingCsv } from '@/lib/billing';
import { guard } from '@/lib/session';

/**
 * Admin: the month's billing for accounting as a CSV download (`?month=YYYY-MM`, default this ICT month): one line per bucket, user, store and kind;
 * with `?part=summary`, one line per team, partner and company reason with its total, free allowance and payable, and the ledger's total.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const url = new URL(request.url);
  const month = url.searchParams.get('month');
  const part = url.searchParams.get('part');
  if (month !== null && !isMonth(month)) return bad('month must look like 2026-11');
  if (part !== null && part !== 'summary') return bad('part must be summary or left out');
  return billingCsv(month, part === 'summary');
}
