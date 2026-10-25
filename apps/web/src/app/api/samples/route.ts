import { listSamples } from '@/lib/samples';
import { guard } from '@/lib/session';

/** The sample files that exist, for the pages to choose a sample over their built-in fallback. */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  return Response.json({ samples: await listSamples() });
}
