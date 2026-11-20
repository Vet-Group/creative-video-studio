import { memberUsage } from '@cvs/core/limits';
import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { pool } from '@/lib/auth';
import { teamMonth } from '@/lib/billing';
import { guard } from '@/lib/session';

/** The caller's own use of the Run caps (the Limits section of the Settings dialog): today's clips and image/apps spend of the ICT day and month, beside each cap.
 * Outside the company's workspace only the clip count is sent: spend stays with the company (docs/WORKSPACES.md §3), so the USD figures are null.
 * A member of a billing team also gets `team`, the team's month so far against its free allowance (docs/BILLING.md); it never blocks a Run. */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const usage = await memberUsage(pool, g.session.user.id);
  if (g.workspaceId !== COMPANY_WORKSPACE_ID) return Response.json({ clips: usage.clips, dayUsd: null, monthUsd: null, monthToDate: null });
  const team = await teamMonth(pool, g.session.user.id);
  return Response.json(team ? { ...usage, team } : usage);
}
