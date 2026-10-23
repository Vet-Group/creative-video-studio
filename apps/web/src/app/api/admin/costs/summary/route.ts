import { asOfParam, bad, isMonth } from '@/lib/admin';
import { snapshot, summaryCsv } from '@/lib/costs';
import { guard } from '@/lib/session';

/**
 * Admin: the month's summary by team and store as a CSV download (`?month=YYYY-MM`, default this ICT month), with a shared-costs row.
 * `?asOf=<n>` keeps only the ledger rows up to id n: the as_of the Costs page showed.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const url = new URL(request.url);
  const month = url.searchParams.get('month');
  if (month !== null && !isMonth(month)) return bad('month must look like 2026-09');
  const asOf = asOfParam(url);
  if (asOf === undefined) return bad('asOf must be a positive whole number');
  return summaryCsv(await snapshot(month, asOf));
}
