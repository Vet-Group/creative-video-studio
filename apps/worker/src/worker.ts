// The video worker (plan M.2): a pg-boss consumer that admits jobs against the 2-per-user and 5-global limits, submits them to
// the provider once, and a reconcile loop that is the only code polling providers and finishing jobs.
// The jobs table is the source of truth: rows survive restarts, pg-boss state does not.
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import { close24h, lateBill, type LedgerPool, release, settle, withTransaction } from '@cvs/core/ledger';
import type { ImageModelConfig, ModelConfig } from '@cvs/core/models';
import type { ImageProvider, ImageProviderJob, ImageSubmitRequest, ProviderJob, ProviderStatus, SubmitRequest, VideoProvider } from '@cvs/core/providers';
import { PURGE_CRON, PURGE_QUEUE, VIDEO_QUEUE, VIDEO_QUEUE_OPTIONS, type VideoJobData, videoSendOptions } from '@cvs/core/queue';
import { insertAssets } from '@cvs/db/assets';
import { createDb, type createPool } from '@cvs/db/client';
import { type Job, PgBoss } from 'pg-boss';
import { extractPoster, probeSize, sniffImage } from './media';
import { purgeDeletedClips } from './purge';
import { deleteObject, putObject } from './storage';

export interface WorkerOptions {
  /** How long a job waits before it asks for a slot again. */
  admissionSleepMs: number;
  /** How often a handler re-reads its job while the provider runs it. */
  waitPollMs: number;
  reconcileEveryMs: number;
  heartbeatEveryMs: number;
  /** A worker without a beat for this long is gone, and its submitting jobs are lost. */
  heartbeatStaleMs: number;
  /** A job not finished this long after it started running is timed out. */
  runTimeoutMs: number;
  /** A queued job without a live pg-boss job is sent again after this long. */
  resendAfterMs: number;
  perUserLimit: number;
  globalLimit: number;
  pollingIntervalSeconds: number;
}

export const DEFAULT_OPTIONS: WorkerOptions = {
  admissionSleepMs: 5_000,
  waitPollMs: 2_000,
  reconcileEveryMs: 15_000,
  heartbeatEveryMs: 10_000,
  heartbeatStaleMs: 60_000,
  runTimeoutMs: 10 * 60_000,
  resendAfterMs: 30_000,
  perUserLimit: 2,
  globalLimit: 5,
  pollingIntervalSeconds: 2,
};

export interface WorkerDeps {
  pool: ReturnType<typeof createPool>;
  connectionString: string;
  /** Adapters by provider name; a job whose model is of kind image uses `imageProviders`. */
  providers: Partial<Record<string, VideoProvider>>;
  imageProviders?: Partial<Record<string, ImageProvider>>;
  options?: Partial<WorkerOptions>;
}

export interface RunningWorker {
  id: string;
  /** One reconcile pass now (or the one already running). */
  reconcile(): Promise<void>;
  stop(): Promise<void>;
}

const log = (what: string, e: unknown) => console.error(`worker: ${what}:`, e instanceof Error ? e.message : e);

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'));
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    p.then(resolve, reject);
  });
}

async function download(url: string, to: string, provider: string): Promise<void> {
  if (url.startsWith('file:')) {
    if (provider !== 'mock') throw new Error('only the mock provider may return a file URL');
    return copyFile(fileURLToPath(url), to);
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as WebReadableStream), createWriteStream(to));
}

export async function startWorker(deps: WorkerDeps): Promise<RunningWorker> {
  const { pool, providers } = deps;
  const imageProviders = deps.imageProviders ?? {};
  const o: WorkerOptions = { ...DEFAULT_OPTIONS, ...deps.options };
  const db = createDb(pool);
  const id = `worker-${randomUUID()}`;
  const stopping = new AbortController();
  /** Jobs this process is submitting right now. */
  const submitting = new Set<string>();

  const boss = new PgBoss({ connectionString: deps.connectionString, max: 4 });
  boss.on('error', (e) => log('pg-boss', e));

  async function loadModel(modelId: string): Promise<ModelConfig> {
    const { rows } = await pool.query('select * from model_configs where id = $1', [modelId]);
    const r = rows[0];
    if (!r || r.usd_per_second == null || r.max_images == null || r.output_resolution == null) throw new Error(`model ${modelId} has no price or limits`);
    return {
      id: r.id, provider: r.provider, endpoint: r.endpoint, label: r.label, ratios: r.ratios, durationsSec: r.durations_sec, maxImages: r.max_images,
      outputResolution: r.output_resolution, usdPerSecond: Number(r.usd_per_second), billedAmountField: r.billed_amount_field, sources: r.sources,
    };
  }

  async function loadImageModel(modelId: string): Promise<ImageModelConfig> {
    const { rows } = await pool.query('select * from model_configs where id = $1', [modelId]);
    const r = rows[0];
    if (!r || r.kind !== 'image' || r.image_prices == null || r.max_images == null) throw new Error(`model ${modelId} has no image prices or limits`);
    return { id: r.id, provider: r.provider, endpoint: r.endpoint, label: r.label, ratios: r.ratios, maxImages: r.max_images, imagePrices: r.image_prices, features: r.features };
  }

  /** The status and cancel calls of a job that has a provider id: the model's kind picks the image or the video adapter. Undefined without an adapter. */
  async function adapterFor(row: { provider: string; provider_job_id: string; model: string; kind: string; params: Record<string, string> }) {
    if (row.kind === 'image') {
      const provider = imageProviders[row.provider];
      if (!provider) return undefined;
      const job: ImageProviderJob = { providerJobId: row.provider_job_id, model: await loadImageModel(row.model), resolution: row.params.resolution! };
      return { status: (): Promise<ProviderStatus> => provider.status(job), cancel: () => provider.cancel(job) };
    }
    const provider = providers[row.provider];
    if (!provider) return undefined;
    const job: ProviderJob = { providerJobId: row.provider_job_id, model: await loadModel(row.model) };
    return { status: (): Promise<ProviderStatus> => provider.status(job), cancel: () => provider.cancel(job) };
  }

  // ---- admission and submit (the pg-boss handler) ----

  /** In one short transaction under an advisory lock: queued -> submitting when the user and the app are under their limits. */
  async function admit(jobId: string): Promise<'claimed' | 'wait' | 'gone'> {
    // In the set before the row can read as submitting, so failLostSubmits never takes a job that is only about to be submitted.
    let added = false;
    const claimed = await withTransaction(pool, async (tx) => {
      await tx.query(`select pg_advisory_xact_lock(hashtext('video-admission'))`);
      const job = (await tx.query('select status, user_id from jobs where id = $1', [jobId])).rows[0];
      if (job?.status !== 'queued') return 'gone';
      const n = (await tx.query(`select (count(*) filter (where user_id = $1))::int as mine, count(*)::int as total from jobs where status in ('submitting', 'running')`, [job.user_id])).rows[0];
      if (n.mine >= o.perUserLimit || n.total >= o.globalLimit) return 'wait';
      added = true;
      submitting.add(jobId);
      const { rowCount } = await tx.query(`update jobs set status = 'submitting', claimed_by = $2 where id = $1 and status = 'queued'`, [jobId, id]);
      return rowCount ? 'claimed' : 'gone';
    }).catch((e) => {
      if (added) submitting.delete(jobId);
      throw e;
    });
    if (added && claimed !== 'claimed') submitting.delete(jobId);
    return claimed;
  }

  /** Calls the provider once. A failure before the call is a clean release; once the call is made, any failure may have started a billed job. */
  async function submit(jobId: string, signal: AbortSignal): Promise<void> {
    submitting.add(jobId);
    try {
      const job = (
        await pool.query(
          'select j.provider, j.model, j.prompt, j.aspect, j.duration_s, j.params, j.input_asset_ids, m.kind from jobs j join model_configs m on m.id = j.model where j.id = $1',
          [jobId],
        )
      ).rows[0];
      const prepared = await (async () => {
        // The adapters upload the images themselves (B.2); until then the URL only names the asset.
        const imageUrls = (job.input_asset_ids as string[]).map((a) => `asset://${a}`);
        if (job.kind === 'image') {
          const provider = imageProviders[job.provider];
          if (!provider) throw new Error(`no adapter for provider ${job.provider}`);
          const request: ImageSubmitRequest = {
            model: await loadImageModel(job.model), prompt: job.prompt, imageUrls, ratio: job.aspect, resolution: job.params.resolution, quality: job.params.quality,
          };
          return { send: () => provider.submit(request) };
        }
        const provider = providers[job.provider];
        if (!provider) throw new Error(`no adapter for provider ${job.provider}`);
        const request: SubmitRequest = { model: await loadModel(job.model), prompt: job.prompt, imageUrls, ratio: job.aspect, durationSec: job.duration_s };
        return { send: () => provider.submit(request) };
      })().catch(async (e) => {
        await release(pool, jobId, e instanceof Error ? e.message : String(e));
      });
      if (!prepared) return;
      let providerJobId: string;
      try {
        ({ providerJobId } = await abortable(prepared.send(), signal));
      } catch (e) {
        // Shutting down mid-call: the row stays submitting and the next worker turns it into failed_unknown.
        if (signal.aborted) return;
        await pool.query(`update jobs set status = 'failed_unknown', error = $2, finished_at = now() where id = $1 and status = 'submitting'`, [jobId, `submit failed: ${e instanceof Error ? e.message : e}`]);
        return;
      }
      // The id is saved whatever the row says now (even failed_unknown), so the provider's late result can still be billed.
      await pool.query(
        `update jobs set provider_job_id = $2, status = case when status = 'submitting' then 'running' else status end,
                started_at = case when status = 'submitting' then now() else started_at end where id = $1`,
        [jobId, providerJobId],
      );
    } finally {
      submitting.delete(jobId);
    }
  }

  async function handle(job: Job<VideoJobData>): Promise<void> {
    const { jobId } = job.data;
    const signal = AbortSignal.any([job.signal, stopping.signal]);
    for (;;) {
      if (signal.aborted) return;
      const admission = await admit(jobId);
      if (admission === 'gone') return; // already handled: a duplicate pg-boss job does nothing
      if (admission === 'claimed') break;
      await sleep(o.admissionSleepMs, signal);
    }
    // Only a shutdown may cut a submit short: pg-boss's expiry covers the admission wait too, and an aborted submit loses a billed provider job.
    await submit(jobId, stopping.signal);
    // Stay active until the job is final, so pg-boss's own limits cover the time the provider runs it.
    while (!signal.aborted) {
      const status = (await pool.query('select status from jobs where id = $1', [jobId])).rows[0]?.status;
      if (status !== 'submitting' && status !== 'running') return;
      await sleep(o.waitPollMs, signal);
    }
  }

  // ---- reconcile ----

  /** Copies the output into MinIO, checks it is at least 720p, cuts the poster and settles the job. A failure that may pass leaves the job running for the next pass. */
  async function deliver(job: { id: string; user_id: string; provider: string; kind: string }, outputUrl: string, costUsd: number): Promise<void> {
    if (job.kind === 'image') return deliverImage(job, outputUrl, costUsd);
    const dir = await mkdtemp(join(tmpdir(), 'cvs-deliver-'));
    const outputId = randomUUID();
    const posterId = randomUUID();
    const keys: string[] = [];
    try {
      const video = join(dir, 'output.mp4');
      await download(outputUrl, video, job.provider);
      const { width, height } = await probeSize(video);
      if (Math.min(width, height) < 720) {
        await settle(pool, job.id, { status: 'failed', costUsd, billed: true, error: `the output is ${width}x${height}, below 720p` });
        return;
      }
      const poster = join(dir, 'poster.jpg');
      await extractPoster(video, poster);
      const [videoBytes, posterBytes] = await Promise.all([readFile(video), readFile(poster)]);
      keys.push(`assets/${outputId}`, `assets/${posterId}`);
      await putObject(keys[0]!, videoBytes, 'video/mp4');
      await putObject(keys[1]!, posterBytes, 'image/jpeg');
      const name = job.id.slice(0, 8);
      await insertAssets(db, [
        { id: outputId, ownerId: job.user_id, kind: 'output', s3Key: keys[0]!, filename: `video-${name}.mp4`, mime: 'video/mp4', bytes: videoBytes.length, width, height },
        { id: posterId, ownerId: job.user_id, kind: 'output', s3Key: keys[1]!, filename: `poster-${name}.jpg`, mime: 'image/jpeg', bytes: posterBytes.length },
      ]);
      if (await settle(pool, job.id, { status: 'succeeded', costUsd, outputAssetId: outputId, posterAssetId: posterId })) return;
      throw new Error('the job was settled by someone else');
    } catch (e) {
      await pool.query('delete from assets where id = any($1::text[])', [[outputId, posterId]]).catch((err) => log('cleanup', err));
      await Promise.allSettled(keys.map(deleteObject));
      throw e;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** An image is stored as it came (its type read from its bytes) and needs no poster: the Library shows the image itself. */
  async function deliverImage(job: { id: string; user_id: string; provider: string }, outputUrl: string, costUsd: number): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'cvs-deliver-'));
    const outputId = randomUUID();
    const key = `assets/${outputId}`;
    try {
      const file = join(dir, 'output');
      await download(outputUrl, file, job.provider);
      const bytes = await readFile(file);
      const type = sniffImage(bytes);
      if (!type) {
        await settle(pool, job.id, { status: 'failed', costUsd, billed: true, error: 'the output is not a PNG, JPEG or WebP image' });
        return;
      }
      const { width, height } = await probeSize(file);
      await putObject(key, bytes, type.mime);
      await insertAssets(db, [{ id: outputId, ownerId: job.user_id, kind: 'output', s3Key: key, filename: `image-${job.id.slice(0, 8)}.${type.ext}`, mime: type.mime, bytes: bytes.length, width, height }]);
      if (await settle(pool, job.id, { status: 'succeeded', costUsd, outputAssetId: outputId, posterAssetId: null })) return;
      throw new Error('the job was settled by someone else');
    } catch (e) {
      await pool.query('delete from assets where id = $1', [outputId]).catch((err) => log('cleanup', err));
      await deleteObject(key).catch((err) => log('cleanup', err));
      throw e;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async function resendQueued(): Promise<void> {
    const { rows } = await pool.query(`select id, user_id from jobs where status = 'queued' and created_at < now() - ($1::float8 * interval '1 millisecond')`, [o.resendAfterMs]);
    for (const r of rows) {
      const sent = await boss.findJobs<VideoJobData>(VIDEO_QUEUE, { key: r.id });
      if (sent.some((j) => j.state === 'created' || j.state === 'retry' || j.state === 'active')) continue;
      await boss.send(VIDEO_QUEUE, { jobId: r.id }, videoSendOptions(r.user_id, r.id));
    }
  }

  /** A submit nobody is making any more (its worker is gone, or this worker lost it to an error): the provider may have started the job, so it keeps its estimate (failed_unknown). */
  async function failLostSubmits(): Promise<void> {
    // Under the admission lock, and the set is read only once it is held: admit adds a job to the set before its commit, so every row this
    // update can see as submitting from this worker is already in the set, and an admit still running waits for the lock behind the update.
    await withTransaction(pool, async (tx) => {
      await tx.query(`select pg_advisory_xact_lock(hashtext('video-admission'))`);
      await tx.query(
        `update jobs set status = 'failed_unknown', error = 'the worker stopped while submitting; the provider may have started the job', finished_at = now()
          where status = 'submitting' and provider_job_id is null and not (id = any($1::text[]))
            and (claimed_by = $3
              or not exists (select 1 from worker_heartbeat h where h.worker_id = jobs.claimed_by and h.beat_at > now() - ($2::float8 * interval '1 millisecond')))`,
        [[...submitting], o.heartbeatStaleMs, id],
      );
    });
  }

  async function pollRunning(): Promise<void> {
    const { rows } = await pool.query(
      `select j.id, j.user_id, j.provider, j.provider_job_id, j.model, j.params, m.kind, (now() - j.started_at > ($1::float8 * interval '1 millisecond')) as expired
         from jobs j join model_configs m on m.id = j.model where j.status = 'running'`,
      [o.runTimeoutMs],
    );
    for (const row of rows) {
      try {
        const adapter = await adapterFor(row);
        // Without an adapter the job can only time out.
        const status = adapter ? await adapter.status() : { state: 'running' as const };
        if (status.state === 'succeeded') await deliver(row, status.outputUrl, status.costUsd);
        else if (status.state === 'failed' || status.state === 'canceled') await settle(pool, row.id, { status: 'failed', costUsd: status.costUsd, error: status.error });
        else if (row.expired && (await timeOut(row.id)) && adapter) await adapter.cancel().catch((e) => log(`cancel ${row.id}`, e));
      } catch (e) {
        log(`running job ${row.id}`, e);
        // A delivery or status call that keeps failing must not keep the job running past its limit; lateBill or close24h finalize it from timed_out.
        if (row.expired) await timeOut(row.id).catch((err) => log(`time out ${row.id}`, err));
      }
    }
  }

  /** The estimate stays counted until the provider's final state is known. False when the job is no longer running. */
  async function timeOut(jobId: string): Promise<boolean> {
    const { rowCount } = await pool.query(`update jobs set status = 'timed_out', error = 'timed out', finished_at = now() where id = $1 and status = 'running'`, [jobId]);
    return !!rowCount;
  }

  /** Timed-out and lost jobs: bill them when the provider reports a final state (the late result is not delivered), else close them after 24 h. */
  async function pollUnresolved(): Promise<void> {
    const { rows } = await pool.query(
      `select j.id, j.provider, j.provider_job_id, j.model, j.params, m.kind from jobs j join model_configs m on m.id = j.model where j.status in ('timed_out', 'failed_unknown')
          and not exists (select 1 from job_costs c where c.job_id = j.id and c.is_final)`,
    );
    for (const row of rows) {
      try {
        const adapter = row.provider_job_id ? await adapterFor(row) : undefined;
        if (adapter) {
          const status = await adapter.status();
          if (status.state === 'succeeded' || status.state === 'failed' || status.state === 'canceled') {
            await lateBill(pool, row.id, status.costUsd, status.state === 'succeeded');
            continue;
          }
        }
        await close24h(pool, row.id);
      } catch (e) {
        log(`unresolved job ${row.id}`, e);
      }
    }
  }

  let reconciling: Promise<void> | undefined;
  const reconcile = () =>
    (reconciling ??= (async () => {
      for (const [what, step] of [['resend queued jobs', resendQueued], ['fail lost submits', failLostSubmits], ['poll running jobs', pollRunning], ['poll unresolved jobs', pollUnresolved]] as const) {
        await step().catch((e) => log(what, e));
      }
    })().finally(() => {
      reconciling = undefined;
    }));

  const beat = () =>
    pool.query(`insert into worker_heartbeat (worker_id) values ($1) on conflict (worker_id) do update set beat_at = now()`, [id]).catch((e) => log('heartbeat', e));

  await boss.start();
  await boss.createQueue(VIDEO_QUEUE, VIDEO_QUEUE_OPTIONS);
  // pg-boss sends the purge once per tick however many workers run.
  await boss.createQueue(PURGE_QUEUE);
  await boss.schedule(PURGE_QUEUE, PURGE_CRON, null, { tz: 'Asia/Ho_Chi_Minh' });
  await boss.work(PURGE_QUEUE, async () => {
    await purgeDeletedClips(pool, deleteObject, log);
  });
  await beat();
  await boss.work<VideoJobData>(VIDEO_QUEUE, { localConcurrency: 5, groupConcurrency: 2, pollingIntervalSeconds: o.pollingIntervalSeconds }, async (jobs) => {
    await Promise.all(jobs.map((job) => handle(job).catch((e) => log(`job ${job.data.jobId}`, e))));
  });

  const heartbeat = setInterval(beat, o.heartbeatEveryMs);
  let reconcileTimer: NodeJS.Timeout | undefined;
  const loop = async () => {
    await reconcile();
    if (!stopping.signal.aborted) reconcileTimer = setTimeout(loop, o.reconcileEveryMs);
  };
  reconcileTimer = setTimeout(loop, 0);

  return {
    id,
    reconcile,
    async stop() {
      stopping.abort();
      clearInterval(heartbeat);
      clearTimeout(reconcileTimer);
      await reconciling;
      await boss.stop({ graceful: true, timeout: 5_000 });
    },
  };
}
