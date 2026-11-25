import { bad } from '@/lib/admin';
import { costsPage, realParam, snapshot } from '@/lib/costs';
import { parsePeriod } from '@/lib/period';
import { guard } from '@/lib/session';

/**
 * Admin: the Costs page for `?from=YYYY-MM-DD&to=YYYY-MM-DD` or the legacy `?month=YYYY-MM` (default: this ICT month), read in one REPEATABLE
 * READ snapshot. `real=0` shows every row; by default only the real users' job and LLM rows count, and `hidden` says what that leaves out.
 * Totals by user, team (now and at job time), store, feature and model, each in USD (4 decimals and a 2-decimal display value) and VND, with the
 * failed-clip sub-columns, accepted clips and cost per accepted clip; the spend by day; the period compared with; the shared line (bake-off,
 * manual adjustments, invoice differences); `provisional` while a shown job has no closing row; and the cap usage and invoices of the month
 * of `to`, with their difference, `red` above 5%.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams);
  if ('error' in period) return bad(period.error);
  const real = realParam(url);
  if (real === undefined) return bad('real must be 0 or 1');
  return Response.json(costsPage(await snapshot(period), real));
}
