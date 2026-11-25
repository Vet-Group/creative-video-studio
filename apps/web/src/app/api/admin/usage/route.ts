import { bad } from '@/lib/admin';
import { parsePeriod } from '@/lib/period';
import { guard } from '@/lib/session';
import { usageReport } from '@/lib/usage';

/**
 * Admin: who uses CVS in `?from=&to=` (ICT days, lib/period.ts; default this month), per team and per person (lib/usage.ts). `real=0` lists every
 * unlocked account, the system ones and the excluded teams' members tagged; otherwise only real users, with how many were hidden.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const params = new URL(request.url).searchParams;
  const period = parsePeriod(params);
  if ('error' in period) return bad(period.error);
  return Response.json(await usageReport(period, params.get('real') !== '0'));
}
