import { COMPRESS_MAX_BYTES, REFRAME_QUEUE, type ReframeJobData, reframedKey, reframeOf } from '@cvs/core/queue';
import { readableAsset, type RouteContext } from '@/lib/assets';
import { signDownloadToken } from '@/lib/download-token';
import { boss } from '@/lib/queue';
import { guard } from '@/lib/session';
import { headObject } from '@/lib/storage';

type State = 'ready' | 'working' | 'failed' | 'none';

/** Whether the reframed copy is stored; only a missing object is "no", so a storage error is an error and not "not reframed yet". */
async function stored(key: string): Promise<boolean> {
  try {
    await headObject(key);
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === 'NotFound') return false;
    throw e;
  }
}

/** Where one reframe stands: the stored copy is the truth; else the worker's latest job for it (done without a copy counts as failed, so it is asked again). */
async function stateOf(key: string): Promise<State> {
  if (await stored(key)) return 'ready';
  const last = (await (await boss()).findJobs<ReframeJobData>(REFRAME_QUEUE, { key })).at(-1);
  if (!last) return 'none';
  // The copy may have landed between the check above and the job's completion, so look once more.
  if (last.state === 'completed') return (await stored(key)) ? 'ready' : 'failed';
  return last.state === 'failed' || last.state === 'cancelled' ? 'failed' : 'working';
}

/**
 * The caller's session, the video and the shape asked for (`?ratio=9:16|4:5|1:1&fill=blur|black`), or the refusal: as for Compress, only who may download the
 * video may reframe it (readableAsset), and only a result video within the size cap.
 */
async function allowed(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return { error: g.error };
  const { id } = await params;
  const found = await readableAsset(g.session, g.workspaceId, id);
  if (found.error) return { error: found.error };
  if (!found.asset.mime.startsWith('video/') || found.asset.kind !== 'output') return { error: Response.json({ error: 'Chỉ đổi khung được video kết quả.' }, { status: 400 }) };
  if (found.asset.bytes > COMPRESS_MAX_BYTES) return { error: Response.json({ error: `Video nặng hơn ${COMPRESS_MAX_BYTES / 1024 / 1024} MB nên không đổi khung được.` }, { status: 400 }) };
  const query = new URL(request.url).searchParams;
  const shape = reframeOf(query.get('ratio'), query.get('fill'));
  if (!shape) return { error: Response.json({ error: 'Hãy chọn khung 9:16, 4:5 hoặc 1:1 và nền mờ hoặc nền đen.' }, { status: 400 }) };
  const job: ReframeJobData = { assetId: id, ...shape };
  return { job, key: reframedKey(id, shape.ratio, shape.fill), userId: g.session.user.id };
}

/** The status a caller polls, with a download link (the original's token rules) once the reframed copy is ready. */
const reply = ({ assetId, ratio, fill }: ReframeJobData, userId: string, status: State) =>
  Response.json(status === 'ready' ? { status, downloadUrl: `/api/assets/${assetId}/download?t=${signDownloadToken(assetId, userId)}&variant=reframed&ratio=${ratio}&fill=${fill}` } : { status });

/** `ready`, `working`, `failed`, or `none` before any request for this shape and fill. */
export async function GET(request: Request, ctx: RouteContext) {
  const a = await allowed(request, ctx);
  if (a.error) return a.error;
  return reply(a.job, a.userId, await stateOf(a.key));
}

/** Asks the worker to reframe the video once per shape and fill; a repeat while it runs, after it finished, or from another member queues nothing new (a failed one is asked again). */
export async function POST(request: Request, ctx: RouteContext) {
  const a = await allowed(request, ctx);
  if (a.error) return a.error;
  let status = await stateOf(a.key);
  if (status === 'none' || status === 'failed') {
    // The queue's exclusive policy keeps one queued or active job per key, so a racing second send queues nothing.
    await (await boss()).send(REFRAME_QUEUE, a.job, { singletonKey: a.key });
    status = 'working';
  }
  return reply(a.job, a.userId, status);
}
