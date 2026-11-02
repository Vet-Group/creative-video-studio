import { memberUsage } from '@cvs/core/limits';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/** The caller's own use of the Run caps (the Limits section of the Settings dialog): today's clips and image/apps spend of the ICT day and month, beside each cap. */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  return Response.json(await memberUsage(pool, g.session.user.id));
}
