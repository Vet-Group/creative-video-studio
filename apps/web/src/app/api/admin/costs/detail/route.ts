import { bad, isMonth } from '@/lib/admin';
import { detailCsv, snapshot } from '@/lib/costs';
import { guard } from '@/lib/session';

/** Admin: the month's ledger detail as a CSV download (`?month=YYYY-MM`, default this ICT month), read in its own REPEATABLE READ snapshot. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const month = new URL(request.url).searchParams.get('month');
  if (month !== null && !isMonth(month)) return bad('month must look like 2026-09');
  return detailCsv(await snapshot(month));
}
