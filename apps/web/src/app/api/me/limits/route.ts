import { memberUsage } from '@cvs/core/limits';
import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/** The caller's own use of the Run caps (the Limits section of the Settings dialog): today's clips and image/apps spend of the ICT day and month, beside each cap.
 * Outside the company's workspace only the clip count is sent: spend stays with the company (docs/WORKSPACES.md §3), so the USD figures are null. */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const usage = await memberUsage(pool, g.session.user.id);
  return Response.json(g.workspaceId === COMPANY_WORKSPACE_ID ? usage : { clips: usage.clips, dayUsd: null, monthUsd: null, monthToDate: null });
}
