import { bad } from '@/lib/admin';
import { csvResponse, text } from '@/lib/csv';
import { vnDay } from '@/lib/lark-prompt';
import { parsePeriod } from '@/lib/period';
import { guard } from '@/lib/session';
import { usageReport } from '@/lib/usage';
import { USAGE_STATUS } from '@/lib/usage-status';

/** Admin: the usage of `?from=&to=[&real=0]` (see GET /api/admin/usage) as a CSV download, one line per person in the page's order; dates are ICT days. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const params = new URL(request.url).searchParams;
  const period = parsePeriod(params);
  if ('error' in period) return bad(period.error);
  const r = await usageReport(period, params.get('real') !== '0');
  const day = (v: string | null) => (v === null ? null : vnDay(new Date(v)));
  return csvResponse(
    `Creative Video Studio usage ${period.from} to ${period.to}${r.real ? '' : ' (all accounts)'}`,
    `cvs-usage-${period.from}-${period.to}.csv`,
    ['team', 'user', 'email', 'role', 'tags', 'status', 'spend USD in period', 'spend USD all time', 'creations in period', 'creations all time', 'video analyses in period', 'video analyses all time', 'last used', 'last signed in'],
    r.teams.flatMap((t) =>
      t.users.map((u) => [
        text(t.name), text(u.name), text(u.email), u.role, text(u.tags.join('; ')), USAGE_STATUS[u.status], u.usd, u.usdAll,
        String(u.jobs), String(u.jobsAll), String(u.analyses), String(u.analysesAll), day(u.lastUsedAt), day(u.lastSeenAt),
      ]),
    ),
  );
}
