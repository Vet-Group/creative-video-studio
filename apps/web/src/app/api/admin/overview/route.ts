import { adminOverview } from '@/lib/overview';
import { guard } from '@/lib/session';

/**
 * Admin: the Overview page. This ICT month's video and image-and-apps spend against their caps (as on the Costs page), today's (ICT) jobs by outcome
 * and the jobs still in progress, active and locked accounts, enabled models, and the 5 newest audit entries.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  return Response.json(await adminOverview());
}
