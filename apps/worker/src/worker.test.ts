// The worker against a disposable database and bucket on the compose Postgres and MinIO (`pnpm services:up`), with the mock provider.
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { DeleteBucketCommand, DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { Enhancer } from '@cvs/core/enhance';
import { reserve, withTransaction } from '@cvs/core/ledger';
import { ImageReadError } from '@cvs/core/providers/http';
import type { ImageProvider, ImageSubmitRequest, SubmitRequest, VideoProvider } from '@cvs/core/providers';
import { VIDEO_QUEUE, VIDEO_QUEUE_OPTIONS, videoSendOptions } from '@cvs/core/queue';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { PgBoss } from 'pg-boss';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { closestRatio, requireFfmpeg } from './media';
import { createMockImageProvider, createMockProvider, MOCK_FAIL } from './mock-provider';
import { bucketName, ensureBucket, putObject, s3 } from './storage';
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
  await pool.query(
    `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, image_prices, sources, enabled)
     values ('mock-image', 'mock', 'mock', 'Mock image', 'image', '{image,try_on}', '{auto,1:1,3:4}', '{}', 4, '{"1K": "0.1500", "2K": "0.3000"}', '{}', true)`,
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
async function newJob(userId: string, o: { prompt?: string; estimate?: string; isMock?: boolean; provider?: string; model?: string } = {}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, is_mock) values ($1, $2, 'team-unassigned', $6, $4, $3, '9:16', 5, '{}', $5)`,
    [id, userId, o.prompt ?? 'a product', o.provider ?? 'mock', o.isMock ?? false, o.model ?? 'mock-sample'],
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

  test("a 480p row's output passes at its own 480p floor and still fails below it", async () => {
    await pool.query(
      `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled)
       values ('mock-480p', 'mock', 'mock', 'Mock 480p', '{9:16,1:1}', '{5,10}', 4, '480p', 0.05, '{}', true) on conflict do nothing`,
    );
    const clip = async (size: string) => {
      const file = join(mockDir, `${randomUUID()}-small.mp4`);
      await mkdir(mockDir, { recursive: true });
      await run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=24`, '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
      return pathToFileURL(file).href;
    };
    let output = await clip('480x854');
    await start(counting(300, (inner) => ({ ...inner, status: async (pj) => ((await inner.status(pj)).state === 'running' ? { state: 'running' } : { state: 'succeeded', outputUrl: output, costUsd: 0, costSource: 'estimate' }) })));
    const draft = await newJob('u1', { model: 'mock-480p' });
    await send(draft, 'u1');
    await waitFor('the 480p job to succeed', async () => (await status(draft)) === 'succeeded');
    output = await clip('320x240');
    const tiny = await newJob('u2', { model: 'mock-480p' });
    await send(tiny, 'u2');
    await waitFor('the 240p job to fail', async () => (await status(tiny)) === 'failed');
    expect((await job(tiny)).error).toMatch(/320x240, below 480p/);
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

describe('Enhance', () => {
  /** The mock adapter, recording the prompts it was sent; the jobs are not flagged is_mock, which Enhance skips. */
  async function startWithEnhance(enhance: Enhancer) {
    const prompts: string[] = [];
    const inner = createMockProvider({ runMs: 200, dir: mockDir });
    const w = await startWorker({ pool, connectionString: testDb.url, providers: { mock: { ...inner, submit: (req) => (prompts.push(req.prompt), inner.submit(req)) } }, enhance, options: FAST });
    workers.push(w);
    return prompts;
  }
  const enhanced = async (id: string) => (await pool.query(`update jobs set enhance = true where id = $1`, [id]), id);

  test('sends the rewritten brief, cut to the model’s prompt limit, saves it with its cost and keeps the member’s prompt', async () => {
    const asked: [string, string, number][] = [];
    const prompts = await startWithEnhance(async (p, kind, max) => (asked.push([p, kind, max]), { prompt: `A detailed brief for ${p}.`, costUsd: 0.0004 }));
    const id = await enhanced(await newJob('u1', { prompt: 'push in' }));
    await send(id, 'u1');
    await waitFor('the job to succeed', async () => (await status(id)) === 'succeeded'); // finished, so it holds no slot of the later tests
    expect(asked).toEqual([['push in', 'video', 2000]]); // the default limit of a model whose schema states none
    expect(prompts).toEqual(['A detailed brief for push in.']);
    const j = await job(id);
    expect([j.prompt, j.enhanced_prompt, Number(j.enhance_cost_usd)]).toEqual(['push in', 'A detailed brief for push in.', 0.0004]);
  });

  test('falls back to the member’s prompt when the LLM fails, and never calls it with Enhance off', async () => {
    let calls = 0;
    const prompts = await startWithEnhance(async () => {
      calls++;
      throw new Error('rate limited');
    });
    const failed = await enhanced(await newJob('u2', { prompt: 'slow orbit' }));
    const off = await newJob('u3', { prompt: 'as written' });
    await send(failed, 'u2');
    await send(off, 'u3');
    await waitFor('both jobs to succeed', async () => (await Promise.all([failed, off].map(status))).every((s) => s === 'succeeded'));
    expect(prompts.sort()).toEqual(['as written', 'slow orbit']);
    expect(calls).toBe(1);
    expect((await job(failed)).enhanced_prompt).toBeNull();
  });
});

describe('native audio', () => {
  test("a job's params.audio 'on' reaches the adapter with the endpoint's audio price; without it the job stays silent at the stored price", async () => {
    const requests: SubmitRequest[] = [];
    await start(counting(300, (inner) => ({ ...inner, submit: async (req) => (requests.push(req), inner.submit(req)) })));
    const loud = await newJob('u1');
    await pool.query(`update jobs set params = '{"format":"advanced","audio":"on"}' where id = $1`, [loud]);
    const quiet = await newJob('u2');
    await send(loud, 'u1');
    await send(quiet, 'u2');
    await waitFor('both submits', async () => requests.length === 2);
    const seen = requests.map((r) => [r.audio, r.model.usdPerSecond]).sort();
    expect(seen).toEqual([[false, 0.1], [true, 0]]); // the mock endpoint's audio price is 0 (AUDIO_USD_PER_SECOND)
    await waitFor('both jobs to finish', async () => (await status(loud)) === 'succeeded' && (await status(quiet)) === 'succeeded');
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

describe('image jobs', () => {
  /** A queued image job with its estimate booked; the estimate is the price of its resolution. */
  async function newImageJob(userId: string, o: { prompt?: string; ratio?: string; resolution?: string; isMock?: boolean; quality?: string } = {}): Promise<string> {
    const id = randomUUID();
    const resolution = o.resolution ?? '1K';
    await pool.query(
      `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, params, input_asset_ids, is_mock)
       values ($1, $2, 'team-unassigned', 'image', 'mock-image', 'mock', $3, $4, 0, $5, '{}', $6)`,
      [id, userId, o.prompt ?? 'a product', o.ratio ?? '3:4', JSON.stringify({ resolution, ...(o.quality && { quality: o.quality }) }), o.isMock ?? false],
    );
    await withTransaction(pool, (tx) => reserve(tx, id, resolution === '2K' ? '0.3000' : '0.1500'));
    return id;
  }

  async function startImages(image: ImageProvider, options: Partial<WorkerOptions> = {}): Promise<RunningWorker> {
    const w = await startWorker({ pool, connectionString: testDb.url, providers: { mock: counting(300) }, imageProviders: { mock: image }, options: { ...FAST, ...options } });
    workers.push(w);
    return w;
  }

  /** The mock image provider, recording what it was asked and, like the fal adapter, reporting the model price as the cost. */
  function recording(requests: ImageSubmitRequest[], output?: (inner: string) => Promise<string>): ImageProvider {
    const inner = createMockImageProvider({ runMs: 300, dir: mockDir });
    return {
      ...inner,
      async submit(req) {
        requests.push(req);
        return inner.submit(req);
      },
      async status(job) {
        const st = await inner.status(job);
        if (st.state !== 'succeeded') return st;
        return { ...st, outputUrl: output ? await output(st.outputUrl) : st.outputUrl, costUsd: Number(job.model.imagePrices[job.resolution]) };
      },
    };
  }

  test('runs a mock image job: a PNG output in MinIO, no poster, nothing billed', async () => {
    const id = await newImageJob('u1', { isMock: true, ratio: '3:4' });
    await startImages(createMockImageProvider({ runMs: 300, dir: mockDir }));
    await send(id, 'u1');
    await waitFor('the job to succeed', async () => (await status(id)) === 'succeeded');

    const j = await job(id);
    expect(j.poster_asset_id).toBeNull();
    const a = (await pool.query(`select kind, mime, filename, bytes, width, height, s3_key, owner_id from assets where id = $1`, [j.output_asset_id])).rows[0];
    expect(a).toMatchObject({ kind: 'output', mime: 'image/png', owner_id: 'u1', width: 192, height: 256 });
    expect(a.filename).toBe(`image-${id.slice(0, 8)}.png`);
    const head = await s3().send(new HeadObjectCommand({ Bucket: bucketName(), Key: a.s3_key }));
    expect([head.ContentLength, head.ContentType]).toEqual([a.bytes, 'image/png']);
    expect((await costs(id)).map((c) => [c.kind, c.usd])).toEqual([['estimate', '0.0000'], ['actual_adjustment', '0.0000']]);
  });

  test('sends the model, resolution, ratio and quality to the image adapter and books the per-image price', async () => {
    const requests: ImageSubmitRequest[] = [];
    const id = await newImageJob('u1', { resolution: '2K', ratio: 'auto', quality: 'low' });
    await startImages(recording(requests));
    await send(id, 'u1');
    await waitFor('the job to succeed', async () => (await status(id)) === 'succeeded');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ prompt: 'a product', ratio: 'auto', resolution: '2K', quality: 'low', model: { id: 'mock-image', imagePrices: { '1K': '0.1500', '2K': '0.3000' }, features: ['image', 'try_on'] } });
    expect(requests[0]!.imageUrls).toEqual([]);
    expect((await costs(id)).map((c) => [c.kind, c.usd])).toEqual([['estimate', '0.3000'], ['actual_adjustment', '0.0000']]);
    expect(await total(id)).toEqual({ usd: '0.3000', is_final: true });
  });

  // Reproduces a bug seen in the Try On bake-off of 2026-10-29 (plan A4): the Try On page sends ratio 'auto', the worker passes it on, and on 'auto'
  // Nano Banana Pro takes the ratio of the garment photo, not the person's, so a square Shopify mockup gave a square, reframed person (6 of 10 pairs).
  test.each([
    ['try_on', [[600, 800], [500, 500]], 0], // person, garment
    ['background_changer', [[600, 800], [1600, 900]], 0], // photo, reference background
    ['character_swap', [[500, 500], [600, 800]], 1], // new character, target
    ['jewelry_try_on', [[500, 500], [900, 400], [600, 800]], 2], // two pieces, wearer
  ] as const)("a %s job at 'auto' asks the image model for the ratio of the input it keeps, not 'auto'", async (feature, sizes, kept) => {
    const asset = async ([width, height]: readonly [number, number]) => {
      const id = randomUUID();
      await putObject(`assets/${id}`, await sharp({ create: { width, height, channels: 3, background: '#ccc' } }).png().toBuffer(), 'image/png');
      await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ($1, 'u1', 'input', $2, 'p.png', 'image/png', 1)`, [id, `assets/${id}`]);
      return id;
    };
    const inputs = [];
    for (const size of sizes) inputs.push(await asset(size));
    const id = randomUUID();
    await pool.query(
      `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, params, input_asset_ids)
       values ($1, 'u1', 'team-unassigned', $2, 'mock-image', 'mock', 'p', 'auto', 0, '{"resolution": "1K"}', $3)`,
      [id, feature, inputs],
    );
    await withTransaction(pool, (tx) => reserve(tx, id, '0.1500'));
    const requests: ImageSubmitRequest[] = [];
    await startImages(recording(requests));
    await send(id, 'u1');
    await waitFor('the job to succeed', async () => (await status(id)) === 'succeeded');
    expect(requests[0]!.imageUrls).toEqual(inputs.map((a) => `asset://${a}`));
    expect(requests[0]!.ratio, `input ${kept}`).toBe('3:4');
  });

  test('closestRatio picks the offered ratio nearest the upright photo, and auto when the model offers none', async () => {
    const photo = (width: number, height: number, orientation = 1) =>
      sharp({ create: { width, height, channels: 3, background: '#ccc' } }).withMetadata({ orientation }).jpeg().toBuffer();
    const ratios = ['auto', '1:1', '3:4', '4:3', '9:16', '16:9'];
    expect(await closestRatio(await photo(400, 600), ratios)).toBe('3:4'); // 2:3 is not offered
    expect(await closestRatio(await photo(1080, 1920), ratios)).toBe('9:16');
    expect(await closestRatio(await photo(1920, 1080, 6), ratios)).toBe('9:16'); // a phone photo stored landscape, shown portrait
    expect(await closestRatio(await photo(500, 500), ['auto'])).toBe('auto');
  });

  test('stores a JPEG under its own type and extension, whatever name the provider gave it', async () => {
    const jpg = join(mockDir, `${randomUUID()}.bin`);
    await mkdir(mockDir, { recursive: true });
    await run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=64x48', '-frames:v', '1', '-f', 'image2', '-c:v', 'mjpeg', jpg]);
    const id = await newImageJob('u1');
    await startImages(recording([], async () => pathToFileURL(jpg).href));
    await send(id, 'u1');
    await waitFor('the job to succeed', async () => (await status(id)) === 'succeeded');
    const a = (await pool.query(`select mime, filename, width, height from assets where id = (select output_asset_id from jobs where id = $1)`, [id])).rows[0];
    expect(a).toEqual({ mime: 'image/jpeg', filename: `image-${id.slice(0, 8)}.jpg`, width: 64, height: 48 });
  });

  test('fails an output that is not an image but keeps the estimate, because the provider billed it', async () => {
    const text = join(mockDir, `${randomUUID()}.png`);
    await mkdir(mockDir, { recursive: true });
    await writeFile(text, 'not an image');
    const id = await newImageJob('u1');
    await startImages(recording([], async () => pathToFileURL(text).href));
    await send(id, 'u1');
    await waitFor('the job to fail', async () => (await status(id)) === 'failed');
    expect((await job(id)).error).toBe('the output is not a PNG, JPEG or WebP image');
    expect((await job(id)).output_asset_id).toBeNull();
    expect(await total(id)).toEqual({ usd: '0.1500', is_final: true });
  });

  test('releases the estimate when the provider fails the image job without billing', async () => {
    const id = await newImageJob('u1', { prompt: `a product ${MOCK_FAIL}` });
    await startImages(createMockImageProvider({ runMs: 300, dir: mockDir }));
    await send(id, 'u1');
    await waitFor('the job to fail', async () => (await status(id)) === 'failed');
    expect(await total(id)).toEqual({ usd: '0.0000', is_final: true });
  });

  test('an input the adapter refuses before any call fails the job and releases its estimate, where any other submit error keeps it', async () => {
    const refusing: ImageProvider = {
      ...createMockImageProvider({ runMs: 300, dir: mockDir }),
      submit: async (req) => {
        throw req.prompt === 'refuse' ? new ImageReadError('the image (6001x4000) is larger than the 24 MP the Upscale price covers') : new Error('connection reset');
      },
    };
    const refused = await newImageJob('u1', { prompt: 'refuse' });
    await startImages(refusing);
    await send(refused, 'u1');
    await waitFor('the job to fail', async () => (await status(refused)) === 'failed');
    expect((await job(refused)).error).toMatch(/larger than the 24 MP/);
    expect(await total(refused)).toEqual({ usd: '0.0000', is_final: true });
    expect((await costs(refused)).map((c) => c.kind)).toEqual(['estimate', 'release']);

    const unknown = await newImageJob('u1');
    await send(unknown, 'u1');
    await waitFor('the job to end unknown', async () => (await status(unknown)) === 'failed_unknown');
    expect((await total(unknown)).is_final).toBe(false);
  });

  test('without an image adapter the job fails before any call and releases its estimate', async () => {
    const id = await newImageJob('u1');
    workers.push(await startWorker({ pool, connectionString: testDb.url, providers: { mock: counting(300) }, options: FAST }));
    await send(id, 'u1');
    await waitFor('the job to fail', async () => (await status(id)) === 'failed');
    expect((await job(id)).error).toBe('no adapter for provider mock');
    expect(await total(id)).toEqual({ usd: '0.0000', is_final: true });
  });
});

describe('the purge schedule', () => {
  test('is registered once a day at 03:00 Ho Chi Minh time, however many workers start', async () => {
    await start(counting(300));
    await start(counting(300));
    const purge = (await boss.getSchedules()).filter((s) => s.name === 'purge');
    expect(purge).toHaveLength(1);
    expect(purge[0]).toMatchObject({ cron: '0 3 * * *', timezone: 'Asia/Ho_Chi_Minh' });
  });
});
