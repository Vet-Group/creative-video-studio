import { asOfParam, bad, isMonth } from '@/lib/admin';
import { GROUP_KEYS, type GroupBy, groupJobs, monthRows } from '@/lib/costs';
import { guard } from '@/lib/session';

/**
 * Admin: the jobs behind one line of the Costs page, `?month=YYYY-MM&by=user|team|store|feature&id=<line id>` (an empty id is the line with
 * no team or store), read in its own snapshot; `?asOf=<n>` keeps the ledger rows the page showed.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const url = new URL(request.url);
  const month = url.searchParams.get('month');
  if (month === null || !isMonth(month)) return bad('month must look like 2026-09');
  const by = url.searchParams.get('by');
  if (by === null || !Object.hasOwn(GROUP_KEYS, by)) return bad('by must be user, team, store or feature');
  const id = url.searchParams.get('id');
  if (id === null) return bad('id is required');
  const asOf = asOfParam(url);
  if (asOf === undefined) return bad('asOf must be a positive whole number');
  return Response.json(groupJobs(await monthRows(month, asOf), by as GroupBy, id));
}
