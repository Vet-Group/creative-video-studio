import { cancelQueued } from '@cvs/core/ledger';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/**
 * Cancels the caller's own job while it is still `queued`, before the worker has sent anything to a provider: the job becomes failed with the canceled marker, its estimate is released and it costs 0.
 * A job that is submitting, running or finished is 409 (the provider may already bill it); another member's job or an unknown id is 404. Like Delete, it is not audited.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const result = await cancelQueued(pool, id, g.session.user.id);
  if (result === 'not_found') return Response.json({ error: 'not found' }, { status: 404 });
  if (result === 'started') return Response.json({ error: 'Job đã bắt đầu chạy, không huỷ được nữa.' }, { status: 409 });
  return Response.json({ id, status: 'failed', canceled: true });
}
