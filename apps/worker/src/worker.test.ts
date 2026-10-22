// The worker against a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`), with the mock provider.
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { DeleteBucketCommand, DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { reserve, withTransaction } from '@cvs/core/ledger';
import type { VideoProvider } from '@cvs/core/providers';
import { VIDEO_QUEUE, VIDEO_QUEUE_OPTIONS, videoSendOptions } from '@cvs/core/queue';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { PgBoss } from 'pg-boss';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { requireFfmpeg } from './media';
import { createMockProvider, MOCK_FAIL } from './mock-provider';
import { bucketName, ensureBucket, s3 } from './storage';
import { type RunningWorker, startWorker, type WorkerOptions } from './worker';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const testDb = await createTestDatabase();
process.env.S3_BUCKET = `cvs-test-${randomBytes(6).toString('hex')}`;
const pool = createPool(testDb.url, 10);
const boss = new PgBoss({ connectionString: testDb.url, max: 3 });
const mockDir = join(tmpdir(), `cvs-mock-${randomBytes(6).toString('hex')}`);

const FAST: Partial<WorkerOptions> = { admissionSleepMs: 100, waitPollMs: 100, reconcileEveryMs: 200, heartbeatEveryMs: 200, resendAfterMs: 0, pollingIntervalSeconds: 0.5 };
const workers: RunningWorker[] = [];
const run = promisify(execFile);

beforeAll(async () => {
  await ensureBucket();
  await boss.start();
  await boss.createQueue(VIDEO_QUEUE, VIDEO_QUEUE_OPTIONS);
  for (const u of ['u1', 'u2', 'u3']) await pool.query(`insert into users (id, email, name) values ($1, $1 || '@example.test', $1)`, [u]);
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
     values ('mock-sample', 'mock', 'mock', 'Mock', '{9:16,1:1}', '{5,10}', 4, '720p', 0.1, '{}', true)`,
  );
});

afterEach(async () => {
  await Promise.all(workers.splice(0).map((w) => w.stop()));
});

afterAll(async () => {
  const Bucket = bucketName();
  const { Contents = [] } = await s3().send(new ListObjectsV2Command({ Bucket }));
  if (Contents.length > 0) await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: Contents.flatMap(({ Key }) => (Key ? [{ Key }] : [])) } }));
  await s3().send(new DeleteBucketCommand({ Bucket }));
  await boss.stop({ graceful: false });
  await pool.end();
  await testDb.drop();
  await rm(mockDir, { recursive: true, force: true });
});

async function waitFor<T>(what: string, fn: () => Promise<T | undefined | false>, ms = 45_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** A queued job with its estimate booked (not yet sent to pg-boss). */
async function newJob(userId: string, o: { prompt?: string; estimate?: string; isMock?: boolean; provider?: string } = {}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, is_mock) values ($1, $2, 'team-unassigned', 'mock-sample', $4, $3, '9:16', 5, '{}', $5)`,
    [id, userId, o.prompt ?? 'a product', o.provider ?? 'mock', o.isMock ?? false],
  );
  await withTransaction(pool, (tx) => reserve(tx, id, o.estimate ?? '1.5000'));
  return id;
}

const send = (jobId: string, userId: string, group = userId) => boss.send(VIDEO_QUEUE, { jobId }, { ...videoSendOptions(userId, jobId), group: { id: group } });
const job = async (id: string) => (await pool.query('select * from jobs where id = $1', [id])).rows[0];
const status = async (id: string) => (await job(id)).status as string;
const costs = async (id: string) => (await pool.query(`select kind, usd::text as usd, is_final from cost_entries where job_id = $1 order by id`, [id])).rows;
const total = async (id: string) => (await pool.query(`select usd::text, is_final from job_costs where job_id = $1`, [id])).rows[0];

/** The mock provider, counting submits. */
function counting(runMs: number, wrap?: (inner: VideoProvider) => VideoProvider) {
  const inner = createMockProvider({ runMs, dir: mockDir });
  const base: VideoProvider = { ...inner, async submit(req) { counting.submits++; return inner.submit(req); } };
  return wrap ? wrap(base) : base;
}
counting.submits = 0;

async function start(provider: VideoProvider, options: Partial<WorkerOptions> = {}): Promise<RunningWorker> {
  const w = await startWorker({ pool, connectionString: testDb.url, providers: { mock: provider }, options: { ...FAST, ...options } });
  workers.push(w);
  return w;
}

describe('the mock lifecycle', () => {
  test('runs a job from queued to succeeded, with the output and poster in MinIO and nothing billed', async () => {
    counting.submits = 0;
    const id = await newJob('u1');
    const worker = await start(counting(1_500));
    await send(id, 'u1');

    const seen = new Set<string>();
    await waitFor('the job to succeed', async () => {
      seen.add(await status(id));
      return seen.has('succeeded');
    });
    expect(seen).toContain('running');

    const j = await job(id);
    expect(j.provider_job_id).toMatch(/^mock:/);
    expect(j.claimed_by).toBe(worker.id);
    expect(j.started_at).not.toBeNull();
    expect(j.finished_at).not.toBeNull();
    const assets = (await pool.query(`select id, kind, mime, bytes, width, height, s3_key, owner_id from assets where id in ($1, $2) order by mime desc`, [j.output_asset_id, j.poster_asset_id])).rows;
    expect(assets.map((a) => [a.id, a.kind, a.mime, a.owner_id])).toEqual([
      [j.output_asset_id, 'output', 'video/mp4', 'u1'],
      [j.poster_asset_id, 'output', 'image/jpeg', 'u1'],
    ]);
    expect(Math.min(assets[0].width, assets[0].height)).toBeGreaterThanOrEqual(720);
    for (const a of assets) {
      const head = await s3().send(new HeadObjectCommand({ Bucket: bucketName(), Key: a.s3_key }));
      expect(head.ContentLength).toBe(a.bytes);
      expect(a.bytes).toBeGreaterThan(0);
    }
    expect(counting.submits).toBe(1);
    expect((await costs(id)).map((c) => c.kind)).toEqual(['estimate', 'actual_adjustment']);
    expect(await total(id)).toEqual({ usd: '1.5000', is_final: true }); // a non-mock job keeps the larger of the estimate and the cost
    expect((await pool.query('select count(*)::int as n from worker_heartbeat where worker_id = $1', [worker.id])).rows[0].n).toBe(1);
  });

  test('releases the estimate when the provider fails the job without billing', async () => {
    const id = await newJob('u1', { prompt: `a product ${MOCK_FAIL}` });
    await start(counting(300));
    await send(id, 'u1');
    await waitFor('the job to fail', async () => (await status(id)) === 'failed');
    expect((await job(id)).error).toBe('mock provider failure');
    expect((await costs(id)).map((c) => [c.kind, c.usd])).toEqual([['estimate', '1.5000'], ['release', '-1.5000']]);
    expect(await total(id)).toEqual({ usd: '0.0000', is_final: true });
  });

  test('times a job out after the run limit, keeps its estimate, and settles it when the provider finishes', async () => {
    const id = await newJob('u1');
    await start(counting(2_500), { runTimeoutMs: 600 });
    await send(id, 'u1');
    await waitFor('the job to time out', async () => (await status(id)) === 'timed_out');
    expect(await total(id)).toEqual({ usd: '1.5000', is_final: false });
    await waitFor('the late result', async () => (await total(id)).is_final);
    expect(await status(id)).toBe('timed_out');
    expect(await total(id)).toEqual({ usd: '1.5000', is_final: true }); // a late success with no reported cost keeps the estimate, as settle does
    expect((await job(id)).output_asset_id).toBeNull(); // a late result is not delivered
  });

  test('books 0 USD for a mock job, from the estimate to the settlement', async () => {
    const id = await newJob('u1', { isMock: true, estimate: '1.5000' });
    await start(counting(300));
    await send(id, 'u1');
    await waitFor('the job to succeed', async () => (await status(id)) === 'succeeded');
    expect((await costs(id)).map((c) => [c.kind, c.usd])).toEqual([['estimate', '0.0000'], ['actual_adjustment', '0.0000']]);
    expect(await total(id)).toEqual({ usd: '0.0000', is_final: true });
  });

  test('fails a sub-720p output but keeps the estimate of a non-mock job, because the provider rendered and billed it', async () => {
    const small = join(mockDir, `${randomUUID()}-small.mp4`);
    await mkdir(mockDir, { recursive: true });
    await run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=24', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', small]);
    const id = await newJob('u1', { estimate: '1.5000' });
    await start(counting(300, (inner) => ({ ...inner, status: async (pj) => ((await inner.status(pj)).state === 'running' ? { state: 'running' } : { state: 'succeeded', outputUrl: pathToFileURL(small).href, costUsd: 0, costSource: 'estimate' }) })));
    await send(id, 'u1');
    await waitFor('the job to fail', async () => (await status(id)) === 'failed');
    expect((await job(id)).error).toMatch(/320x240, below 720p/);
    expect((await job(id)).output_asset_id).toBeNull();
    expect((await costs(id)).map((c) => [c.kind, c.usd])).toEqual([['estimate', '1.5000'], ['actual_adjustment', '0.0000']]); // not a release of -1.5000
    expect(await total(id)).toEqual({ usd: '1.5000', is_final: true });
  });

  test('times out a job whose delivery keeps failing, frees its slot and settles it from timed_out', async () => {
    const id = await newJob('u2');
    const broken = counting(300, (inner) => ({ ...inner, status: async () => ({ state: 'succeeded', outputUrl: 'http://127.0.0.1:9/gone.mp4', costUsd: 0, costSource: 'estimate' }) }));
    await start(broken, { runTimeoutMs: 600 });
    await send(id, 'u2');
    await waitFor('the job to time out', async () => (await status(id)) === 'timed_out');
    expect((await pool.query(`select count(*)::int as n from jobs where user_id = 'u2' and status in ('submitting', 'running')`)).rows[0].n).toBe(0);
    await waitFor('the late bill', async () => (await total(id)).is_final);
    expect(await total(id)).toEqual({ usd: '1.5000', is_final: true });
    expect((await job(id)).output_asset_id).toBeNull();
  });

  test('times out a running job whose provider has no adapter', async () => {
    const id = await newJob('u2', { provider: 'fal' });
    await pool.query(`update jobs set status = 'running', provider_job_id = 'fal:1', started_at = now() - interval '1 hour', claimed_by = 'gone' where id = $1`, [id]);
    await start(counting(300), { runTimeoutMs: 60_000 });
    await waitFor('the job to time out', async () => (await status(id)) === 'timed_out');
    expect(await total(id)).toEqual({ usd: '1.5000', is_final: false });
  });
});

describe('a submit that pg-boss expiry or an error would orphan', () => {
  test('is not aborted by the pg-boss expiry of the handler', async () => {
    counting.submits = 0;
    const id = await newJob('u1');
    // The provider takes 3 s to accept the job; pg-boss expires the handler after 1 s.
    const slow = counting(300, (inner) => ({ ...inner, submit: async (req) => { await new Promise((r) => setTimeout(r, 3_000)); return inner.submit(req); } }));
    await start(slow);
    await boss.send(VIDEO_QUEUE, { jobId: id }, { ...videoSendOptions('u1', id), expireInSeconds: 1 });
    await waitFor('the job to succeed', async () => (await status(id)) === 'succeeded');
    expect(counting.submits).toBe(1);
    expect((await job(id)).provider_job_id).toMatch(/^mock:/);
  });

  test('turns a submitting row of this worker that no submit holds into failed_unknown, keeping the estimate', async () => {
    const id = await newJob('u3', { estimate: '2.5000' });
    const w = await start(counting(300));
    await pool.query(`update jobs set status = 'submitting', claimed_by = $2 where id = $1`, [id, w.id]);
    await waitFor('failed_unknown', async () => {
      await w.reconcile();
      return (await status(id)) === 'failed_unknown';
    });
    expect(await total(id)).toEqual({ usd: '2.5000', is_final: false });
  });

  test('does not mark a job admitted while the lost-submit check is waiting for its turn', async () => {
    counting.submits = 0;
    const id = await newJob('u1');
    // The lost-submit UPDATE is held back, as when the pool is busy; the job is admitted in the meantime.
    let reached!: () => void;
    let open!: () => void;
    const hit = new Promise<void>((r) => { reached = r; });
    const opened = new Promise<void>((r) => { open = r; });
    const hold = async (sql: unknown) => {
      if (typeof sql === 'string' && sql.includes('the worker stopped while submitting')) {
        reached();
        await opened;
      }
    };
    const bind = (t: object, p: string | symbol) => {
      const v = Reflect.get(t, p, t);
      return typeof v === 'function' ? v.bind(t) : v;
    };
    const slowPool = new Proxy(pool, {
      get(t, p) {
        if (p === 'query') return async (sql: unknown, ...a: unknown[]) => { await hold(sql); return (t.query as (...x: unknown[]) => unknown)(sql, ...a); };
        if (p === 'connect') {
          return async () => {
            const c = await t.connect();
            return new Proxy(c, { get: (ct, cp) => (cp === 'query' ? async (sql: unknown, ...a: unknown[]) => { await hold(sql); return (ct.query as (...x: unknown[]) => unknown)(sql, ...a); } : bind(ct, cp)) });
          };
        }
        return bind(t, p);
      },
    });
    const slowSubmit = counting(300, (inner) => ({ ...inner, submit: async (req) => { await new Promise((r) => setTimeout(r, 2_000)); return inner.submit(req); } }));
    workers.push(await startWorker({ pool: slowPool, connectionString: testDb.url, providers: { mock: slowSubmit }, options: FAST }));
    await hit;
    await send(id, 'u1');
    await new Promise((r) => setTimeout(r, 700));
    open();
    const seen = new Set<string>();
    await waitFor('the job to succeed', async () => {
      seen.add(await status(id));
      return seen.has('succeeded');
    });
    expect(seen).not.toContain('failed_unknown');
    expect(counting.submits).toBe(1);
  });

  test('saves the provider job id even when the row was already marked failed_unknown, so it can be billed late', async () => {
    counting.submits = 0;
    const id = await newJob('u1');
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const held = counting(300, (inner) => ({ ...inner, submit: async (req) => { const out = await inner.submit(req); await gate; return out; } }));
    await start(held);
    await send(id, 'u1');
    await waitFor('the submit', async () => counting.submits === 1 && (await status(id)) === 'submitting');
    await pool.query(`update jobs set status = 'failed_unknown', error = 'lost', finished_at = now() where id = $1`, [id]);
    release();
    await waitFor('the provider job id', async () => (await job(id)).provider_job_id);
    expect(await status(id)).toBe('failed_unknown');
    await waitFor('the late bill', async () => (await total(id)).is_final);
    expect(await total(id)).toEqual({ usd: '1.5000', is_final: true });
  });
});

describe('admission', () => {
  test('keeps at most 2 jobs per user and 3 in all running, even when pg-boss would let more through', async () => {
    const users = ['u1', 'u1', 'u1', 'u2', 'u2'];
    const ids = await Promise.all(users.map((u) => newJob(u)));
    await start(counting(1_200), { perUserLimit: 2, globalLimit: 3 });
    // Each job goes in its own pg-boss group, so only the table check limits them.
    await Promise.all(ids.map((id, i) => send(id, users[i]!, id)));

    let maxUser = 0;
    let maxAll = 0;
    await waitFor('every job to succeed', async () => {
      const { rows } = await pool.query(`select user_id, count(*)::int as n from jobs where status in ('submitting', 'running') group by user_id`);
      maxUser = Math.max(maxUser, ...rows.map((r) => r.n));
      maxAll = Math.max(maxAll, rows.reduce((s, r) => s + r.n, 0));
      const done = await pool.query(`select count(*)::int as n from jobs where id = any($1::text[]) and status = 'succeeded'`, [ids]);
      return done.rows[0].n === ids.length;
    });
    expect(maxUser).toBe(2);
    expect(maxAll).toBe(3);
  });
});

describe('restarts', () => {
  test('a new worker resumes a running job and finishes it, without submitting again', async () => {
    counting.submits = 0;
    const id = await newJob('u2');
    const provider = counting(2_000);
    const first = await start(provider);
    await send(id, 'u2');
    await waitFor('the job to run', async () => (await status(id)) === 'running');
    await first.stop();
    expect(await status(id)).toBe('running');

    await start(provider);
    await waitFor('the job to succeed', async () => (await status(id)) === 'succeeded');
    expect(counting.submits).toBe(1);
    expect((await job(id)).output_asset_id).not.toBeNull();
  });

  test('a crash between submit and saving the id ends as failed_unknown and keeps the estimate', async () => {
    counting.submits = 0;
    const id = await newJob('u3', { estimate: '2.5000' });
    // The provider takes the job, but the process dies before it can save the id.
    const lost = counting(500, (inner) => ({ ...inner, submit: async (req) => { await inner.submit(req); return new Promise<never>(() => undefined); } }));
    const first = await start(lost);
    await send(id, 'u3');
    await waitFor('the submit', async () => counting.submits === 1 && (await status(id)) === 'submitting');
    await first.stop();
    expect((await job(id)).claimed_by).toBe(first.id);
    expect(await status(id)).toBe('submitting');

    await start(counting(500), { heartbeatStaleMs: 600 });
    await waitFor('failed_unknown', async () => (await status(id)) === 'failed_unknown');
    expect(counting.submits).toBe(1); // the second worker never submits it again
    expect(await total(id)).toEqual({ usd: '2.5000', is_final: false });
  });

  test('re-sends a queued job whose pg-boss job was deleted, and runs it exactly once', async () => {
    counting.submits = 0;
    const id = await newJob('u1');
    const pgbossId = await send(id, 'u1');
    await boss.deleteJob(VIDEO_QUEUE, pgbossId!);
    await start(counting(300));
    await waitFor('the job to succeed', async () => (await status(id)) === 'succeeded');
    expect(counting.submits).toBe(1);
    expect((await costs(id)).map((c) => c.kind)).toEqual(['estimate', 'actual_adjustment']);
  });

  test('re-sends a queued job whose pg-boss job died with its worker before submitting, and runs it exactly once', async () => {
    counting.submits = 0;
    const id = await newJob('u2');
    await send(id, 'u2');
    // A worker took the pg-boss job and died holding it; pg-boss later fails it (expiry).
    const [held] = await boss.fetch(VIDEO_QUEUE);
    expect(held?.data).toEqual({ jobId: id });
    await boss.fail(VIDEO_QUEUE, held!.id);
    expect(await status(id)).toBe('queued');

    await start(counting(300));
    await waitFor('the job to succeed', async () => (await status(id)) === 'succeeded');
    expect(counting.submits).toBe(1);
  });

  test('runs a job once even when pg-boss holds two jobs for it', async () => {
    counting.submits = 0;
    const id = await newJob('u3');
    await send(id, 'u3');
    await send(id, 'u3');
    await start(counting(300));
    await waitFor('the job to succeed', async () => (await status(id)) === 'succeeded');
    await new Promise((r) => setTimeout(r, 1_000));
    expect(counting.submits).toBe(1);
    expect((await costs(id)).map((c) => c.kind)).toEqual(['estimate', 'actual_adjustment']);
  });
});
