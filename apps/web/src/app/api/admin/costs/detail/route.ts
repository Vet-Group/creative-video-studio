import { asOfParam, bad } from '@/lib/admin';
import { detailCsv, realParam, snapshot } from '@/lib/costs';
import { parsePeriod } from '@/lib/period';
import { guard } from '@/lib/session';

/**
 * Admin: the ledger detail of the period the Costs page shows as a CSV download (`?from=&to=` or `?month=YYYY-MM`, default this ICT month,
 * and `real=0` for every row), read in its own REPEATABLE READ snapshot. `?asOf=<n>` keeps only the ledger rows up to id n: the as_of the Costs page showed.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams);
  if ('error' in period) return bad(period.error);
  const real = realParam(url);
  if (real === undefined) return bad('real must be 0 or 1');
  const asOf = asOfParam(url);
  if (asOf === undefined) return bad('asOf must be a positive whole number');
  return detailCsv(await snapshot(period, asOf), real);
}
