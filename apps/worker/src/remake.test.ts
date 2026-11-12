// Runs against a disposable database on the compose Postgres (`pnpm services:up`). No network, S3 or paid call: both fal
// calls and the object store are injected; ffmpeg runs for real on tiny clips made here.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ProviderStatus } from '@cvs/core/providers';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { requireFfmpeg } from './media';
import { closeStaleRemakes, PaidCallError, type RemakeSeams, reaRemakeEnabled, runRemake, settleFal } from './remake';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const run = promisify(execFile);
const testDb = await createTestDatabase();
// createTestDatabase loads the checkout's .env, which may hold a real fal key: a test that forgot a seam must fail, never pay.
delete process.env.FAL_KEY;
delete process.env.FAL_KEY_NEXT;
const pool = createPool(testDb.url, 2);
let dir = '';
let sourceVideo = new Uint8Array();
let clipVideo = new Uint8Array();
const PRODUCT = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const analysis = {
  durationS: 2, shotCount: 2, format: 'product showcase', hook: 'h', summary: 's',
  shots: [
    { index: 1, start: 0, end: 1, role: 'hook', prompt: 'A model turns to the camera.' },
    { index: 2, start: 1, end: 2, role: 'mood', prompt: 'A close-up of the shirt.' },
  ],
};

const stored: Record<string, Uint8Array> = {};
let calls: string[] = [];
const seams = (over: Partial<RemakeSeams> = {}): RemakeSeams => ({
  read: async (key) => (key === 'sources/ref.mp4' ? sourceVideo : PRODUCT),
  write: async (key, body) => void (stored[key] = body),
  edit: async (frame, product, prompt) => {
    calls.push(`edit ${product.contentType} ${prompt.slice(0, 19)}`);
    return { image: frame, costUsd: 0.0398 };
  },
  animate: async (_image, prompt, seconds) => {
    calls.push(`animate ${seconds}s ${prompt}`);
    return { video: clipVideo, costUsd: 0.108 };
  },
  ...over,
});

let seq = 0;
async function queued(shots: number[], product = 'prod'): Promise<string> {
  const id = `rm-${++seq}`;
  await pool.query(`insert into remakes (id, user_id, team_id, store_id, analysis_id, product_asset_id, shots) values ($1, 'u1', 'team-unassigned', null, 'an1', $2, $3)`, [id, product, JSON.stringify(shots)]);
  return id;
}
const row = async (id: string) => (await pool.query('select status, result, output_asset_id, cost_usd::text as cost_usd, error from remakes where id = $1', [id])).rows[0];
const ledger = async (id: string) =>
  (await pool.query(`select ref, kind, usd::text as usd, user_id, team_id, provider, model, is_final from cost_entries where ref like $1 order by ref`, [`llm:remake:${id}:%`])).rows;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cvs-remake-test-'));
  const make = async (file: string, seconds: number, color: string) => {
    await run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:size=128x224:rate=24`, '-t', String(seconds), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file]);
    return new Uint8Array(await readFile(file));
  };
  sourceVideo = await make(join(dir, 'source.mp4'), 2, 'blue');
  clipVideo = await make(join(dir, 'clip.mp4'), 1, 'green');
  await pool.query(`insert into users (id, email, name) values ('u1', 'u1@example.test', 'u1')`);
  await pool.query(`insert into analyses (id, user_id, team_id, source_key, status, result) values ('an1', 'u1', 'team-unassigned', 'sources/ref.mp4', 'succeeded', $1)`, [JSON.stringify(analysis)]);
  await pool.query(`insert into assets (id, owner_id, kind, s3_key, filename, mime, bytes) values ('prod', 'u1', 'input', 's3/prod', 'shirt.png', 'image/png', 4), ('gone', 'u1', 'input', 's3/gone', 'old.png', 'image/png', 4)`);
  await pool.query(`update assets set deleted_at = now() where id = 'gone'`);
});
afterAll(async () => {
  await pool.end();
  await testDb.drop();
  await rm(dir, { recursive: true, force: true });
});

test('remakes every chosen shot, joins the clips and books each paid call to the ledger', async () => {
  calls = [];
  const id = await queued([1, 2]);
  await runRemake(pool, id, seams());
  const r = await row(id);
  expect(r.status).toBe('succeeded');
  expect(r.error).toBeNull();
  expect(r.cost_usd).toBe('0.295600'); // 2 x (0.0398 + 0.108)
  expect(r.result.shots.map((s: { index: number; status: string }) => [s.index, s.status])).toEqual([[1, 'succeeded'], [2, 'succeeded']]);
  // The product image goes to the edit, the shot's own English prompt to the animate step, 5 s each.
  expect(calls).toEqual(['edit image/png Replace the product', 'animate 5s A model turns to the camera. Keep the product exactly as it appears in the image.', 'edit image/png Replace the product', 'animate 5s A close-up of the shirt. Keep the product exactly as it appears in the image.']);
  // The joined video and each shot's clip are the member's output assets, stored under their own keys.
  const ids = [r.output_asset_id, ...r.result.shots.map((s: { clipAssetId: string }) => s.clipAssetId)];
  const assets = (await pool.query(`select id, owner_id, kind, mime, s3_key, width, height from assets where id = any($1::text[])`, [ids])).rows;
  expect(assets).toHaveLength(3);
  for (const a of assets) expect([a.owner_id, a.kind, a.mime, a.s3_key, a.width, a.height]).toEqual(['u1', 'output', 'video/mp4', `assets/${a.id}`, 128, 224]);
  for (const a of assets) expect(stored[a.s3_key]).toBeDefined();
  expect(await ledger(id)).toEqual([
    { ref: `llm:remake:${id}:1:edit`, kind: 'llm', usd: '0.0398', user_id: 'u1', team_id: 'team-unassigned', provider: 'fal', model: 'fal-ai/nano-banana/edit', is_final: true },
    { ref: `llm:remake:${id}:1:video`, kind: 'llm', usd: '0.1080', user_id: 'u1', team_id: 'team-unassigned', provider: 'fal', model: 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video', is_final: true },
    { ref: `llm:remake:${id}:2:edit`, kind: 'llm', usd: '0.0398', user_id: 'u1', team_id: 'team-unassigned', provider: 'fal', model: 'fal-ai/nano-banana/edit', is_final: true },
    { ref: `llm:remake:${id}:2:video`, kind: 'llm', usd: '0.1080', user_id: 'u1', team_id: 'team-unassigned', provider: 'fal', model: 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video', is_final: true },
  ]);
});

test('a shot whose paid call fails still books what fal billed, and the remake delivers the other shots as partial', async () => {
  const id = await queued([1, 2]);
  await runRemake(
    pool,
    id,
    seams({
      animate: async (_image, prompt) => {
        if (prompt.startsWith('A close-up')) throw new PaidCallError('content policy', 0.108);
        return { video: clipVideo, costUsd: 0.108 };
      },
    }),
  );
  const r = await row(id);
  expect(r.status).toBe('partial');
  expect(r.output_asset_id).not.toBeNull(); // the one clip, joined on its own
  expect(r.error).toBe('content policy');
  expect(r.result.shots[1]).toMatchObject({ index: 2, status: 'failed', costUsd: 0.1478, error: 'content policy' });
  expect(r.cost_usd).toBe('0.295600');
  expect((await ledger(id)).map((l: { ref: string }) => l.ref)).toEqual([`llm:remake:${id}:1:edit`, `llm:remake:${id}:1:video`, `llm:remake:${id}:2:edit`, `llm:remake:${id}:2:video`]);
});

test('fails without a paid call when nothing could be made, and books nothing for a call fal never took', async () => {
  calls = [];
  const gone = await queued([1], 'gone');
  await runRemake(pool, gone, seams());
  expect(await row(gone)).toMatchObject({ status: 'failed', error: 'the product image is no longer available', cost_usd: '0.000000' });
  expect(calls).toEqual([]);

  const refused = await queued([1]);
  await runRemake(pool, refused, seams({ edit: async () => Promise.reject(new Error('fal submit: HTTP 422')) }));
  expect(await row(refused)).toMatchObject({ status: 'failed', output_asset_id: null, error: 'fal submit: HTTP 422', cost_usd: '0.000000' });
  expect(await ledger(refused)).toEqual([]);
});

test('a shot missing from the analysis fails alone; more shots than the cap fail before any paid call', async () => {
  const missing = await queued([2, 7]);
  await runRemake(pool, missing, seams());
  const m = await row(missing);
  expect(m.status).toBe('partial');
  expect(m.result.shots[1]).toMatchObject({ index: 7, status: 'failed', error: 'shot 7 is not in the analysis', costUsd: 0 });

  calls = [];
  const many = await queued([1, 2, 3, 4, 5, 6, 7]);
  await runRemake(pool, many, seams());
  expect(await row(many)).toMatchObject({ status: 'failed', error: 'at most 6 shots per remake' });
  expect(calls).toEqual([]);
});

test('does nothing on a repeated run once the remake is no longer queued', async () => {
  const id = await queued([1]);
  calls = [];
  await runRemake(pool, id, seams());
  await runRemake(pool, id, seams());
  expect(calls.filter((c) => c.startsWith('edit'))).toHaveLength(1);
  expect(await ledger(id)).toHaveLength(2);
});

test('closes remakes a stopped worker left open: partial when a shot made a clip, failed otherwise; recent ones stay', async () => {
  const half = await queued([1, 2]);
  const none = await queued([1]);
  const lost = await queued([1]);
  const recent = await queued([1]);
  await pool.query(`update remakes set status = 'running', started_at = now() - interval '3 hours', result = $2 where id = $1`, [half, JSON.stringify({ shots: [{ index: 1, status: 'succeeded', clipAssetId: 'x', costUsd: 0.1478 }] })]);
  await pool.query(`update remakes set status = 'running', started_at = now() - interval '3 hours' where id = $1`, [none]);
  await pool.query(`update remakes set created_at = now() - interval '3 hours' where id = $1`, [lost]);
  await pool.query(`update remakes set status = 'running', started_at = now() - interval '5 minutes' where id = $1`, [recent]);
  expect(await closeStaleRemakes(pool)).toBe(3);
  expect(await row(half)).toMatchObject({ status: 'partial', error: 'the worker stopped before the remake finished' });
  expect((await row(none)).status).toBe('failed');
  expect((await row(lost)).status).toBe('failed');
  expect((await row(recent)).status).toBe('running');
});

test('the feature flag is off unless explicitly set', () => {
  expect(reaRemakeEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  expect(reaRemakeEnabled({ REA_REMAKE_ENABLED: '1' } as NodeJS.ProcessEnv)).toBe(true);
});

test('without a fal key the real calls refuse before any request, so nothing is booked', async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  try {
    const id = await queued([1]);
    await runRemake(pool, id, { read: seams().read, write: seams().write });
    expect(await row(id)).toMatchObject({ status: 'failed', error: 'FAL_KEY is not set', cost_usd: '0.000000' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await ledger(id)).toEqual([]);
  } finally {
    vi.unstubAllGlobals();
  }
});

describe('settleFal: every outcome after fal took the request carries its cost', () => {
  const ok = (body = new Uint8Array([1, 2])) => (async () => new Response(body)) as unknown as typeof fetch;
  const statuses = (...s: (ProviderStatus | Error)[]) => {
    let i = 0;
    return async () => {
      const v = s[Math.min(i++, s.length - 1)]!;
      if (v instanceof Error) throw v;
      return v;
    };
  };
  const fast = { pollMs: 1 };
  const won = { state: 'succeeded' as const, outputUrl: 'https://cdn/out', costUsd: 0.108, costSource: 'estimate' as const };
  const paidError = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof PaidCallError ? [e.message, e.costUsd] : ['not paid', (e as Error).message]));

  test('a success downloads the output at its cost, after polling past a queue wait and a failed poll', async () => {
    const out = await settleFal(statuses({ state: 'queued' }, new Error('HTTP 429'), { state: 'running' }, won), 0.5, { ...fast, fetch: ok() });
    expect(out).toEqual({ bytes: new Uint8Array([1, 2]), costUsd: 0.108 });
  });

  test('a failed request, a lost download and a request past the deadline each carry a cost', async () => {
    expect(await paidError(settleFal(statuses({ state: 'failed', error: 'content policy', costUsd: 0.108, costSource: 'estimate' }), 0.5, fast))).toEqual(['content policy', 0.108]);
    expect(await paidError(settleFal(statuses({ state: 'failed', error: 'input rejected', costUsd: 0, costSource: 'estimate' }), 0.5, fast))).toEqual(['input rejected', 0]); // a 4xx fal refused: not billed
    const lost = (async () => new Response('gone', { status: 404 })) as unknown as typeof fetch;
    expect(await paidError(settleFal(statuses(won), 0.5, { ...fast, fetch: lost }))).toEqual(['could not download the fal output: HTTP 404', 0.108]);
    expect(await paidError(settleFal(statuses({ state: 'running' }), 0.5, { ...fast, deadlineMs: 0 }))).toEqual(['fal did not finish within 0 minutes', 0.5]); // booked at the estimate
  });
});
