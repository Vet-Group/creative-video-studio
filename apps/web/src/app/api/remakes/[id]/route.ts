import { withTransaction } from '@cvs/core/ledger';
import { compressedKey } from '@cvs/core/queue';
import type { RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { REMAKE_COLUMNS, reaRemakeEnabled } from '@/lib/remake';
import { guard } from '@/lib/session';
import { deleteObject } from '@/lib/storage';

/** One of the caller's own remakes, polled while it runs. */
export async function GET(request: Request, { params }: RouteContext) {
  if (!reaRemakeEnabled()) return Response.json({ error: 'not found' }, { status: 404 });
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const row = (await pool.query(`select ${REMAKE_COLUMNS} from remakes where id = $1 and user_id = $2`, [id, g.session.user.id])).rows[0];
  if (!row) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(row);
}

/**
 * Deletes one of the caller's own remakes with its output assets (the joined video, the before/after and each shot's clip; rows and stored objects at once, as no
 * job's purge would ever reach them). The member's product image and the cost ledger stay. 404 for another user's; 409 while it is queued or running.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  if (!reaRemakeEnabled()) return Response.json({ error: 'not found' }, { status: 404 });
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const result = await withTransaction(pool, async (tx): Promise<Response | { keys: string[] }> => {
    const row = (await tx.query('select status, result, output_asset_id as "outputAssetId" from remakes where id = $1 and user_id = $2 for update', [id, g.session.user.id])).rows[0];
    if (!row) return Response.json({ error: 'not found' }, { status: 404 });
    if (row.status === 'queued' || row.status === 'running') return Response.json({ error: 'Video đang được tạo nên chưa xoá được. Hãy đợi nó xong.' }, { status: 409 });
    const assetIds = [row.outputAssetId, row.result?.compareAssetId, row.result?.fullAssetId, ...(row.result?.shots ?? []).map((s: { clipAssetId?: string }) => s.clipAssetId)].filter((a): a is string => !!a);
    await tx.query('delete from remakes where id = $1', [id]);
    const { rows } = await tx.query(`delete from assets where id = any($1::text[]) and kind = 'output' returning id, s3_key`, [assetIds]);
    // Each asset may also have a tile thumbnail or a compressed copy; removing a missing one is a no-op.
    return { keys: rows.flatMap((r) => [r.s3_key as string, `thumbs/${r.id}`, compressedKey(r.id as string)]) };
  });
  if (result instanceof Response) return result;
  // After the commit, as the purge does: a failure here only leaves an orphan object.
  await Promise.allSettled(result.keys.map(deleteObject));
  return Response.json({ id, deleted: true });
}
