import { bad } from '@/lib/admin';
import { csvResponse, text } from '@/lib/csv';
import { validWeek, weeklyReport } from '@/lib/report';
import { guard } from '@/lib/session';

/** Admin: the weekly report of `?week=` (see GET /api/admin/report) as a CSV download, one line per user. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const week = new URL(request.url).searchParams.get('week');
  if (!validWeek(week)) return bad('week must be a date like 2026-10-14');
  const r = await weeklyReport(week);
  const cell = (v: number | string | null) => (v === null ? null : String(v));
  return csvResponse(
    `Creative Video Studio report ${r.week.start} to ${r.week.end}`,
    `cvs-report-${r.week.start}.csv`,
    ['week start', 'user', 'email', 'team', 'jobs', 'accepted clips', 'spend USD', 'cost per accepted clip USD', 'median run seconds', 'failure rate', 'spend of cap'],
    r.users.map((u) => [r.week.start, text(u.name), text(u.email), text(u.team), cell(u.jobs), cell(u.acceptedClips), u.spendUsd, u.costPerAcceptedUsd, cell(u.medianRunSeconds), cell(u.failureRate), u.spendOfCap]),
  );
}
