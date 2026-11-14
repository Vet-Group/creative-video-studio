import { COMPRESS_MAX_BYTES, COMPRESS_QUEUE, type CompressJobData, compressedKey } from '@cvs/core/queue';
import { readableAsset, type RouteContext } from '@/lib/assets';
import { signDownloadToken } from '@/lib/download-token';
import { boss } from '@/lib/queue';
import { guard } from '@/lib/session';
import { headObject } from '@/lib/storage';

type State = 'ready' | 'working' | 'original' | 'failed' | 'none';

/** Whether the compressed copy is stored; only a missing object is "no", so a storage error is an error and not "not compressed yet". */
async function stored(id: string): Promise<boolean> {
  try {
    await headObject(compressedKey(id));
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === 'NotFound') return false;
    throw e;
  }
}

/** Where a video's compression stands: the stored copy is the truth; else the worker's latest job for it (done without a copy means it was not enough smaller). */
async function stateOf(id: string): Promise<State> {
  if (await stored(id)) return 'ready';
  const last = (await (await boss()).findJobs<CompressJobData>(COMPRESS_QUEUE, { key: id })).at(-1);
  if (!last) return 'none';
  // The copy may have landed between the check above and the job's completion, so look once more before calling it the original.
  if (last.state === 'completed') return (await stored(id)) ? 'ready' : 'original';
  return last.state === 'failed' || last.state === 'cancelled' ? 'failed' : 'working';
}

/** The caller's session and the video, or the refusal: only who may download the video may compress it (readableAsset), and only a result video within the size cap. */
async function allowed(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return { error: g.error };
  const { id } = await params;
  const found = await readableAsset(g.session, id);
  if (found.error) return { error: found.error };
  if (!found.asset.mime.startsWith('video/') || found.asset.kind !== 'output') return { error: Response.json({ error: 'Chỉ nén được video kết quả.' }, { status: 400 }) };
  if (found.asset.bytes > COMPRESS_MAX_BYTES) return { error: Response.json({ error: `Video nặng hơn ${COMPRESS_MAX_BYTES / 1024 / 1024} MB nên không nén được.` }, { status: 400 }) };
  return { id, userId: g.session.user.id };
}

/** The status a caller polls, with a download link (the original's token rules) once the compressed copy is ready. */
const reply = (id: string, userId: string, status: State) =>
  Response.json(status === 'ready' ? { status, downloadUrl: `/api/assets/${id}/download?t=${signDownloadToken(id, userId)}&variant=compressed` } : { status });

/** `ready`, `working`, `original` (the copy was not enough smaller: download the original), `failed`, or `none` before any request. */
export async function GET(request: Request, ctx: RouteContext) {
  const a = await allowed(request, ctx);
  if (a.error) return a.error;
  return reply(a.id, a.userId, await stateOf(a.id));
}

/** Asks the worker to compress the video once; a repeat while it runs, after it finished, or from another member queues nothing new (a failed one is asked again). */
export async function POST(request: Request, ctx: RouteContext) {
  const a = await allowed(request, ctx);
  if (a.error) return a.error;
  let status = await stateOf(a.id);
  if (status === 'none' || status === 'failed') {
    // The queue's exclusive policy keeps one queued or active job per asset, so a racing second send queues nothing.
    await (await boss()).send(COMPRESS_QUEUE, { assetId: a.id } satisfies CompressJobData, { singletonKey: a.id });
    status = 'working';
  }
  return reply(a.id, a.userId, status);
}
