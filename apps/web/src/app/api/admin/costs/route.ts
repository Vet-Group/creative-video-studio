import { bad, isMonth } from '@/lib/admin';
import { costsPage, snapshot } from '@/lib/costs';
import { guard } from '@/lib/session';

/**
 * Admin: the monthly Costs page for `?month=YYYY-MM` (default: this ICT month), read in one REPEATABLE READ snapshot. Totals by user, team and
 * store (a job with no store is listed under an empty id), each in USD (4 decimals and a 2-decimal display value) and VND, with the failed-clip
 * sub-columns, accepted clips and cost per accepted clip; the shared line (bake-off, manual adjustments, invoice differences); `provisional` while a job
 * of the month has no closing row; the month's cap usage; and the invoices with their difference, `red` above 5%.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const month = new URL(request.url).searchParams.get('month');
  if (month !== null && !isMonth(month)) return bad('month must look like 2026-09');
  return Response.json(costsPage(await snapshot(month)));
}
