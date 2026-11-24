import { turntableKey } from '@cvs/core/queue';
import { turntableState } from '@cvs/core/turntable';
import { readableAsset, streamAsset } from '@/lib/assets';
import { isBatchId } from '@/lib/apps';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';
import { headObject } from '@/lib/storage';

const notFound = () => Response.json({ error: 'not found' }, { status: 404 });

/**
 * The 360 turntable video of a multi-angle Run (`params.batch`) on one photo (`?asset=<the photo's asset id>`), streamed with Range support like a clip, or as a download
 * named `xoay-360-<first 8 of the Run>.mp4` with `?download=1`. 404 while the worker has not stored it, and when the caller's workspace has no such Run with all 7 horizontal
 * views still live (a deleted view ends the video's use). Whoever may read one of the Run's pictures may read it (readableAsset: a live result is in the Library, so every member of the workspace).
 */
export async function GET(request: Request, { params }: { params: Promise<{ batch: string }> }) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { batch } = await params;
  const query = new URL(request.url).searchParams;
  const photo = query.get('asset');
  if (!isBatchId(batch) || !photo) return notFound();
  const { rows } = await pool.query(
    `select j.params->>'view' as view, j.status, j.output_asset_id
       from jobs j where j.feature = 'multi_angle' and j.workspace_id = $1 and j.params->>'batch' = $2 and j.input_asset_ids[1] = $3 and j.deleted_at is null and j.purged_at is null`,
    [g.workspaceId, batch, photo],
  );
  const live = rows.filter((r) => r.status === 'succeeded' && r.output_asset_id);
  if (!turntableState(live).ready) return notFound();
  const readable = await readableAsset(g.session, g.workspaceId, live[0]!.output_asset_id as string);
  if (readable.error) return readable.error;
  const key = turntableKey(batch, photo);
  const stored = await headObject(key).catch((e: { name?: string }) => {
    if (e.name === 'NotFound') return null; // only a missing object is "not yet"; a storage error is an error
    throw e;
  });
  if (!stored) return notFound();
  return streamAsset(request, { s3Key: key, bytes: stored.size, mime: 'video/mp4', filename: `xoay-360-${batch.slice(0, 8)}.mp4` }, query.get('download') === '1' ? 'attachment' : 'inline');
}
