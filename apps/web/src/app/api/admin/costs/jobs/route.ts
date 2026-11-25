import { asOfParam, bad } from '@/lib/admin';
import { GROUP_KEYS, type GroupBy, groupJobs, periodRows, realParam, shownRows } from '@/lib/costs';
import { parsePeriod } from '@/lib/period';
import { guard } from '@/lib/session';

/**
 * Admin: the jobs behind one line of the Costs page, `?from=&to=` (or `?month=YYYY-MM`) `&by=user|team|teamNow|store|feature|model&id=<line id>`
 * (an empty id is the line with no team or store), read in its own snapshot; `real=0` as on the page, and `?asOf=<n>` keeps the ledger rows the page showed.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const url = new URL(request.url);
  if (!['from', 'to', 'month'].some((k) => url.searchParams.has(k))) return bad('from and to, or month, are required');
  const period = parsePeriod(url.searchParams);
  if ('error' in period) return bad(period.error);
  const by = url.searchParams.get('by');
  if (by === null || !Object.hasOwn(GROUP_KEYS, by)) return bad('by must be user, team, teamNow, store, feature or model');
  const id = url.searchParams.get('id');
  if (id === null) return bad('id is required');
  const real = realParam(url);
  if (real === undefined) return bad('real must be 0 or 1');
  const asOf = asOfParam(url);
  if (asOf === undefined) return bad('asOf must be a positive whole number');
  return Response.json(groupJobs(shownRows(await periodRows(period, asOf), real), by as GroupBy, id));
}
