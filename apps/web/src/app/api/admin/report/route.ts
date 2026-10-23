import { bad } from '@/lib/admin';
import { validWeek, weeklyReport } from '@/lib/report';
import { guard } from '@/lib/session';

/**
 * Admin: the weekly KPIs per user for the ICT week (Monday 00:00 to Sunday 24:00) that holds `?week=YYYY-MM-DD` (default: this week). A job belongs to
 * the week of its Run, and so does every ledger row it gets later. Per user: jobs, accepted clips (Pass verdicts), `spendUsd`, `costPerAcceptedUsd`
 * (null with no accepted clip), `medianRunSeconds` (created to finished, succeeded jobs), `failureRate` (failed, timed out or lost jobs over finished
 * jobs) and `spendOfCap`, the spend as a fraction of the monthly cap. `cap` is the ledger usage of the month the week starts in. Hidden teams and
 * stores do not matter: history stays.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const week = new URL(request.url).searchParams.get('week');
  if (!validWeek(week)) return bad('week must be a date like 2026-10-14');
  return Response.json(await weeklyReport(week));
}
