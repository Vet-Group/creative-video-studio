import { COMPRESS_QUEUE, type CompressJobData, compressedKey } from '@cvs/core/queue';
import { readableAsset, type RouteContext } from '@/lib/assets';
import { signDownloadToken } from '@/lib/download-token';
import { boss } from '@/lib/queue';
import { guard } from '@/lib/session';
import { headObject } from '@/lib/storage';

type State = 'ready' | 'working' | 'original' | 'failed' | 'none';

/** Where a video's compression stands: the stored copy is the truth; else the worker's latest job for it (done without a copy means it was not enough smaller). */
async function stateOf(id: string): Promise<State> {
  if (await headObject(compressedKey(id)).then(() => true, () => false)) return 'ready';
  const last = (await (await boss()).findJobs<CompressJobData>(COMPRESS_QUEUE, { key: id })).at(-1);
  if (!last) return 'none';
  if (last.state === 'completed') return 'original';
  return last.state === 'failed' || last.state === 'cancelled' ? 'failed' : 'working';
}

/** The caller's session and the video, or the refusal: only who may download the video may compress it (readableAsset), and an image has no compression. */
async function allowed(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return { error: g.error };
  const { id } = await params;
  const found = await readableAsset(g.session, id);
  if (found.error) return { error: found.error };
  if (!found.asset.mime.startsWith('video/')) return { error: Response.json({ error: 'only a video can be compressed' }, { status: 400 }) };
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
