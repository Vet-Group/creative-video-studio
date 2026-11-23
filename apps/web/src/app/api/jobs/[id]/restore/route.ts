import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/**
 * Undoes a Library delete (DELETE /api/jobs/:id): clears `deleted_at` on the clip and on its video and poster assets, nothing else, because the delete changed nothing else
 * (an Examples row and favourites stay on the job, and show again with it). Allowed to the same people as the delete (the creator, or an Admin, whose restore of another user's clip is
 * audited), in the caller's workspace, and only while the worker's purge has not run (`purged_at` is null). A clip that is not deleted is 409; an unknown, purged or non-clip job is 404.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const { id: userId, role } = g.session.user;
  const refused = await withTransaction(pool, async (tx): Promise<Response | null> => {
    const job = (await tx.query(`select j.user_id, j.deleted_at, j.output_asset_id, j.poster_asset_id from jobs j where j.id = $1 and j.workspace_id = $2 and j.status = 'succeeded' and j.purged_at is null and j.output_asset_id is not null for update of j`, [id, g.workspaceId])).rows[0];
    if (!job) return Response.json({ error: 'not found' }, { status: 404 });
    if (job.user_id !== userId && role !== 'admin') return Response.json({ error: 'forbidden' }, { status: 403 });
    if (!job.deleted_at) return Response.json({ error: 'not deleted' }, { status: 409 });
    await tx.query('update jobs set deleted_at = null where id = $1', [id]);
    await tx.query('update assets set deleted_at = null where id = any($1::text[]) and workspace_id = $2', [[job.output_asset_id, job.poster_asset_id].filter(Boolean), g.workspaceId]);
    if (job.user_id !== userId) await audit(tx, { actorId: userId, action: 'clip.restore', target: `job:${id}`, oldValue: { ownerId: job.user_id, deleted: true }, newValue: { ownerId: job.user_id, deleted: false } });
    return null;
  });
  return refused ?? Response.json({ id, deleted: false });
}
