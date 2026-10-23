import { bad, isMonth } from '@/lib/admin';
import { snapshot, summaryCsv } from '@/lib/costs';
import { guard } from '@/lib/session';

/** Admin: the month's summary by team and store as a CSV download (`?month=YYYY-MM`, default this ICT month), with a shared-costs row. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const month = new URL(request.url).searchParams.get('month');
  if (month !== null && !isMonth(month)) return bad('month must look like 2026-09');
  return summaryCsv(await snapshot(month));
}
