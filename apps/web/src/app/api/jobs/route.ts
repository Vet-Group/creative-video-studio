import { reserve, withTransaction } from '@cvs/core/ledger';
import { type CapRefusal, checkCaps } from '@cvs/core/limits';
import { estimateUsd } from '@cvs/core/models';
import { VIDEO_QUEUE, videoSendOptions } from '@cvs/core/queue';
import { pool } from '@/lib/auth';
import { boss } from '@/lib/queue';
import { guard } from '@/lib/session';

const MAX_IMAGES = 4;
type Spec = { assetIds: string[]; modelId: string; presetId: string; ratio: string; durationSec: number; storeId: string | null };
const bad = (error: string) => Response.json({ error }, { status: 400 });
/** Member-facing text for a Run a cap refused. */
const CAP_MESSAGES: Record<CapRefusal, string> = {
  daily_clips: 'Bạn đã dùng hết số clip trong ngày hôm nay',
  monthly_usd: 'Đã hết ngân sách tháng của công ty',
};

/**
 * `?mine`: the "My jobs" tray. The caller's 20 latest jobs that are not deleted, newest first, and whether the worker is offline
 * (no heartbeat for 60 s). `retried` is true once the job has its one manual retry.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  if (!new URL(request.url).searchParams.has('mine')) return bad('only ?mine is supported');
  const [jobs, worker] = await Promise.all([
    pool.query(
      `select j.id, j.status, j.error, j.is_mock, j.aspect, j.duration_s, j.model, j.retry_of, j.output_asset_id, j.poster_asset_id, j.created_at, j.finished_at,
              exists (select 1 from jobs r where r.retry_of = j.id) as retried
         from jobs j where j.user_id = $1 and j.deleted_at is null order by j.created_at desc, j.id desc limit 20`,
      [g.session.user.id],
    ),
    pool.query(`select not exists (select 1 from worker_heartbeat where beat_at > now() - interval '60 seconds') as offline`),
  ]);
  return Response.json({
    workerOffline: worker.rows[0].offline,
    jobs: jobs.rows.map((r) => ({
      id: r.id, status: r.status, error: r.error, isMock: r.is_mock, ratio: r.aspect, durationSec: r.duration_s, modelId: r.model, retryOf: r.retry_of,
      retried: r.retried, outputAssetId: r.output_asset_id, posterAssetId: r.poster_asset_id, createdAt: r.created_at, finishedAt: r.finished_at,
    })),
  });
}

/**
 * Create a video job: 1-4 input images the caller may use (their own, or the inputs of a succeeded Library clip for Reuse), an enabled
 * model, a preset, the ratio and duration the model allows, and an optional visible store. The caps are checked and the job and its
 * `estimate` ledger row are written in one transaction (429 when a cap refuses, nothing sent); the pg-boss job is sent afterwards.
 * `retryOf` retries the caller's own failed job once: the inputs, model, preset, prompt, ratio, duration, team and store all come from the
 * original (the body may carry just `retryOf`), the estimate from the model's current price.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const { retryOf = null } = body ?? {};
  if (retryOf !== null && typeof retryOf !== 'string') return bad('retryOf must be a job id');
  const userId = g.session.user.id;

  // A retry takes everything from the original job, so only a new Run is validated against the body.
  let spec: Spec | null = null;
  if (retryOf === null) {
    const { assetIds, modelId, presetId, ratio, durationSec, storeId = null } = body ?? {};
    if (!Array.isArray(assetIds) || assetIds.length < 1 || assetIds.length > MAX_IMAGES || !assetIds.every((a) => typeof a === 'string') || new Set(assetIds).size !== assetIds.length) {
      return bad(`assetIds must list 1 to ${MAX_IMAGES} different asset ids`);
    }
    if (typeof modelId !== 'string' || typeof presetId !== 'string' || typeof ratio !== 'string' || !Number.isInteger(durationSec) || (storeId !== null && typeof storeId !== 'string')) {
      return bad('modelId, presetId, ratio, durationSec (a whole number) and an optional storeId are required');
    }
    const usable = await pool.query(
      `select a.id from assets a
        where a.id = any($1::text[]) and a.deleted_at is null and a.kind = 'input'
          and (a.owner_id = $2 or exists (select 1 from jobs j where a.id = any(j.input_asset_ids) and j.status = 'succeeded' and j.deleted_at is null and j.purged_at is null))`,
      [assetIds, userId],
    );
    if (usable.rowCount !== assetIds.length) return bad('one or more assets do not exist or cannot be used');
    spec = { assetIds, modelId, presetId, ratio, durationSec: durationSec as number, storeId: storeId as string | null };
  }

  const id = crypto.randomUUID();
  const refused = await withTransaction(pool, async (tx): Promise<Response | null> => {
    // One writer at a time, so two Runs cannot both take the last daily slot or the last dollars of the month.
    await tx.query(`select pg_advisory_xact_lock(hashtext('caps'))`);
    // The model, preset, store and assets are read under the lock, so one disabled or hidden meanwhile is refused.
    let s = spec;
    let original: { team_id: string; provider: string; prompt: string } | undefined;
    if (retryOf !== null) {
      const o = (await tx.query('select user_id, team_id, store_id, status, retry_of, input_asset_ids, model, provider, preset_id, prompt, aspect, duration_s from jobs where id = $1', [retryOf])).rows[0];
      if (!o) return Response.json({ error: 'the job to retry does not exist' }, { status: 404 });
      if (o.user_id !== userId) return Response.json({ error: 'only the owner of a job may retry it' }, { status: 403 });
      if (!['failed', 'timed_out', 'failed_unknown'].includes(o.status)) return Response.json({ error: 'only a failed job can be retried' }, { status: 409 });
      if (o.retry_of !== null || (await tx.query('select 1 from jobs where retry_of = $1', [retryOf])).rowCount) {
        return Response.json({ error: 'a job can be retried only once, and a retry cannot be retried' }, { status: 409 });
      }
      const live = await tx.query('select 1 from assets where id = any($1::text[]) and deleted_at is null', [o.input_asset_ids]);
      if (live.rowCount !== o.input_asset_ids.length) return bad('one or more assets of the job were deleted');
      s = { assetIds: o.input_asset_ids, modelId: o.model, presetId: o.preset_id, ratio: o.aspect, durationSec: o.duration_s, storeId: o.store_id };
      original = o;
    }
    const { assetIds, modelId, presetId, ratio, durationSec, storeId } = s!;
    const model = (await tx.query('select enabled, provider, ratios, durations_sec, max_images, usd_per_second from model_configs where id = $1', [modelId])).rows[0];
    if (!model?.enabled) return bad('the model does not exist or is not enabled');
    if (!model.ratios.includes(ratio) || !model.durations_sec.includes(durationSec) || assetIds.length > model.max_images) {
      return bad('the model does not allow this ratio, duration or number of images');
    }
    let prompt = original?.prompt;
    if (!original) {
      prompt = (await tx.query('select prompt from presets where id = $1 and enabled', [presetId])).rows[0]?.prompt;
      if (prompt === undefined) return bad('the preset does not exist or is not enabled');
      if (storeId !== null && (await tx.query('select 1 from stores where id = $1 and not hidden', [storeId])).rowCount === 0) {
        return bad('the store does not exist or is hidden');
      }
    }
    const provider = original?.provider ?? model.provider;
    const estimate = estimateUsd(model.usd_per_second, durationSec);
    // A mock job books 0 USD (see the ledger), so it adds nothing to the monthly cap.
    const cap = await checkCaps(tx, userId, provider === 'mock' ? '0' : estimate);
    if (cap) return Response.json({ error: CAP_MESSAGES[cap] }, { status: 429 });
    await tx.query(
      `insert into jobs (id, user_id, team_id, store_id, retry_of, model, provider, preset_id, prompt, aspect, duration_s, input_asset_ids, is_mock)
       values ($1, $2, coalesce($3, (select team_id from users where id = $2)), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [id, userId, original?.team_id ?? null, storeId, retryOf, modelId, provider, presetId, prompt, ratio, durationSec, assetIds, provider === 'mock'],
    );
    await reserve(tx, id, estimate);
    return null;
  });
  if (refused) return refused;
  // The row is already queued: if the send fails, the worker's reconcile loop sends it later.
  try {
    await (await boss()).send(VIDEO_QUEUE, { jobId: id }, videoSendOptions(userId, id));
  } catch (e) {
    console.error(`Could not send job ${id} to the queue:`, e);
  }
  return Response.json({ id, status: 'queued' }, { status: 201 });
}
