// Runs against a disposable database on the compose Postgres (`pnpm services:up`). No network, S3 or paid call: both fal
// calls and the object store are injected; ffmpeg runs for real on tiny clips made here.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ProviderStatus } from '@cvs/core/providers';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import ffprobe from 'ffprobe-static';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { bookLlm } from '@cvs/core/ledger';
import sharp from 'sharp';
import { probeSeconds, requireFfmpeg } from './media';
import { closeStaleRemakes, PaidCallError, type RemakeSeams, reaRemakeEnabled, runRemake, settleFal, takeOverRemakes } from './remake';

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
let sentClips: Uint8Array[] = [];
const seams = (over: Partial<RemakeSeams> = {}): RemakeSeams => ({
  read: async (key) => (key === 'sources/ref.mp4' ? sourceVideo : PRODUCT),
  write: async (key, body) => void (stored[key] = body),
  edit: async (clip, product, prompt, seconds) => {
    sentClips.push(clip);
    calls.push(`edit ${seconds}s ${product.contentType} ${prompt.split('for context: ')[1]}`);
    return { video: clipVideo, costUsd: 0.2 };
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
  clipVideo = await make(join(dir, 'clip.mp4'), 2, 'green'); // what the edit answers for a 1 s shot sent as 2 s
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

test('remakes every chosen shot from its own clip, joins the clips with a before/after, and books each paid call to the ledger', async () => {
  calls = [];
  sentClips = [];
  const id = await queued([1, 2]);
  await runRemake(pool, id, seams());
  const r = await row(id);
  expect(r.status).toBe('succeeded');
  expect(r.error).toBeNull();
  expect(r.cost_usd).toBe('0.400000'); // 2 shots x 2 s x $0.10
  expect(r.result.shots.map((s: { index: number; status: string }) => [s.index, s.status])).toEqual([[1, 'succeeded'], [2, 'succeeded']]);
  // The product image and the shot's own English description go to the edit; each 1 s shot is sent as the 2 s the edit takes at least.
  expect(calls).toEqual(['edit 2s image/png A model turns to the camera.', 'edit 2s image/png A close-up of the shirt.']);
  const sent = join(dir, 'sent.mp4');
  await writeFile(sent, sentClips[0]!);
  // Past 2 s even without its last frame, as fal measures it (it refused an exact 2 s cut as 1.958 s on prod).
  const probe = await run(ffprobe.path, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=r_frame_rate,nb_read_frames', '-of', 'csv=p=0', sent]);
  const [fps, frames] = probe.stdout.trim().split(',');
  const [num, den] = fps!.split('/').map(Number);
  expect((Number(frames) - 1) / (num! / den!)).toBeGreaterThanOrEqual(2);
  expect(await probeSeconds(sent)).toBeLessThanOrEqual(2.2);
  // The joined video, each shot's clip (cut back to the shot's 1 s) and the before/after are the member's output assets, under their own keys.
  const ids = [r.output_asset_id, ...r.result.shots.map((s: { clipAssetId: string }) => s.clipAssetId), r.result.compareAssetId];
  const assets = (await pool.query(`select id, owner_id, kind, mime, s3_key, width, height from assets where id = any($1::text[])`, [ids])).rows;
  expect(assets).toHaveLength(4);
  for (const a of assets) expect([a.owner_id, a.kind, a.mime, a.s3_key, a.height]).toEqual(['u1', 'output', 'video/mp4', `assets/${a.id}`, 224]);
  for (const a of assets) expect(stored[a.s3_key]).toBeDefined();
  expect(assets.find((a) => a.id === r.result.compareAssetId)!.width).toBe(256); // the source's shots beside their remakes
  const clip = join(dir, 'stored-clip.mp4');
  await writeFile(clip, stored[`assets/${r.result.shots[0].clipAssetId}`]!);
  expect(Math.abs((await probeSeconds(clip)) - 1)).toBeLessThanOrEqual(0.1);
  expect(await ledger(id)).toEqual([
    { ref: `llm:remake:${id}:1:video`, kind: 'llm', usd: '0.2000', user_id: 'u1', team_id: 'team-unassigned', provider: 'fal', model: 'fal-ai/wan/v2.7/edit-video', is_final: true },
    { ref: `llm:remake:${id}:2:video`, kind: 'llm', usd: '0.2000', user_id: 'u1', team_id: 'team-unassigned', provider: 'fal', model: 'fal-ai/wan/v2.7/edit-video', is_final: true },
  ]);
});

test('a shot whose paid call fails still books what fal billed, and the remake delivers the other shots as partial', async () => {
  const id = await queued([1, 2]);
  await runRemake(
    pool,
    id,
    seams({
      edit: async (_clip, _product, prompt) => {
        if (prompt.endsWith('A close-up of the shirt.')) throw new PaidCallError('content policy', 0.2);
        return { video: clipVideo, costUsd: 0.2 };
      },
    }),
  );
  const r = await row(id);
  expect(r.status).toBe('partial');
  expect(r.output_asset_id).not.toBeNull(); // the one clip, joined on its own
  expect(r.error).toBe('content policy');
  expect(r.result.shots[1]).toMatchObject({ index: 2, status: 'failed', costUsd: 0.2, error: 'content policy' });
  expect(r.cost_usd).toBe('0.400000');
  expect((await ledger(id)).map((l: { ref: string }) => l.ref)).toEqual([`llm:remake:${id}:1:video`, `llm:remake:${id}:2:video`]);
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

test('a shot that starts a merged scene is remade over the whole scene, and its clip is cut back to the scene’s length', async () => {
  const s = (index: number, start: number, end: number, prompt: string) => ({ index, start, end, role: 'proof', prompt });
  await pool.query(`insert into analyses (id, user_id, team_id, source_key, status, result) values ('an-merged', 'u1', 'team-unassigned', 'sources/ref.mp4', 'succeeded', $1)`, [
    JSON.stringify({ ...analysis, shots: [s(1, 0, 0.6, 'Pan.'), s(2, 0.6, 1.7, 'Pan.'), s(3, 1.7, 2, 'Spin.')] }),
  ]);
  await pool.query(`insert into remakes (id, user_id, team_id, analysis_id, product_asset_id, shots) values ('rm-merged', 'u1', 'team-unassigned', 'an-merged', 'prod', '[1]')`);
  calls = [];
  // The edit answers with the clip it was sent (2 s: the 1.7 s scene held on its last frame), so the stored clip shows what was cut.
  await runRemake(pool, 'rm-merged', seams({ edit: async (clip, _product, _prompt, seconds) => (calls.push(`edit ${seconds}s`), { video: clip, costUsd: 0.2 }) }));
  const r = await row('rm-merged');
  expect([r.status, calls]).toEqual(['succeeded', ['edit 2s']]);
  const clip = join(dir, 'merged-clip.mp4');
  await writeFile(clip, stored[`assets/${r.result.shots[0].clipAssetId}`]!);
  expect(Math.abs((await probeSeconds(clip)) - 1.7)).toBeLessThanOrEqual(0.1); // the scene, not shot 1's 0.6 s
});

test('a shot past the end of the source fails before any paid call', async () => {
  await pool.query(`insert into analyses (id, user_id, team_id, source_key, status, result) values ('an-late', 'u1', 'team-unassigned', 'sources/ref.mp4', 'succeeded', $1)`, [
    JSON.stringify({ ...analysis, shots: [{ index: 1, start: 10, end: 11, role: 'hook', prompt: 'Late.' }] }),
  ]);
  await pool.query(`insert into remakes (id, user_id, team_id, analysis_id, product_asset_id, shots) values ('rm-late', 'u1', 'team-unassigned', 'an-late', 'prod', '[1]')`);
  calls = [];
  await runRemake(pool, 'rm-late', seams());
  expect(await row('rm-late')).toMatchObject({ status: 'failed', output_asset_id: null, error: 'shot 1 is not in the video', cost_usd: '0.000000' });
  expect(calls).toEqual([]);
  expect(await ledger('rm-late')).toEqual([]);
});

test('does nothing on a repeated run once the remake is no longer queued', async () => {
  const id = await queued([1]);
  calls = [];
  await runRemake(pool, id, seams());
  await runRemake(pool, id, seams());
  expect(calls.filter((c) => c.startsWith('edit'))).toHaveLength(1);
  expect(await ledger(id)).toHaveLength(1);
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

// A restart: the fal queue and CDN are stubbed at `fetch`, so the real edit runs (upload, submit, poll, download) without a network or a paid call.
describe('a remake survives a worker restart: its fal requests are saved, polled again and never submitted twice', () => {
  const QUEUE_SUBMIT = 'https://queue.fal.run/fal-ai/wan/v2.7/edit-video';
  let png = new Uint8Array();
  beforeAll(async () => {
    png = new Uint8Array(await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).png().toBuffer());
  });
  const realRead =
    (clipKeys: string[] = []): RemakeSeams['read'] =>
    async (key) =>
      key === 'sources/ref.mp4' ? sourceVideo : clipKeys.includes(key) ? clipVideo : png;

  /**
   * fal as far as the remake sees it: every request id has the same output; `status` is what a poll answers; `onStatus` runs on every status poll;
   * `dropped` makes the status or the result call answer what fal answers for a request its start timeout dropped (504, X-Fal-Request-Timeout-Type: user).
   */
  function fakeFal(o: { onStatus?: () => Promise<void>; status?: string; dropped?: 'status' | 'result' } = {}) {
    const timedOut = () => new Response('', { status: 504, headers: { 'X-Fal-Request-Timeout-Type': 'user' } });
    const seen: { method: string; url: string; headers: Record<string, string> }[] = [];
    let n = 0;
    const fetchStub = vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      seen.push({ method, url, headers: (init.headers ?? {}) as Record<string, string> });
      if (url.includes('/storage/upload/initiate')) return Response.json({ upload_url: `https://up.test/${++n}`, file_url: `https://cdn.test/in-${n}` });
      if (url.startsWith('https://up.test/')) return new Response(null, { status: 200 });
      if (method === 'POST' && url === QUEUE_SUBMIT) return Response.json({ request_id: `req-${++n}` });
      if (url.endsWith('/status')) {
        await o.onStatus?.();
        return o.dropped === 'status' ? timedOut() : Response.json({ status: o.status ?? 'COMPLETED' });
      }
      if (url.startsWith('https://queue.fal.run/fal-ai/wan/requests/')) return o.dropped === 'result' ? timedOut() : Response.json({ video: { url: 'https://cdn.test/out.mp4' } });
      if (url === 'https://cdn.test/out.mp4') return new Response(clipVideo);
      throw new Error(`unexpected fetch ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchStub);
    process.env.FAL_KEY = 'test-key';
    return { seen, polls: () => seen.filter((c) => c.url.endsWith('/status')).length, submits: () => seen.filter((c) => c.method === 'POST' && c.url === QUEUE_SUBMIT), uploads: () => seen.filter((c) => c.url.includes('/storage/upload/initiate')) };
  }
  const restore = () => {
    vi.unstubAllGlobals();
    delete process.env.FAL_KEY;
  };

  /** A remake the worker `from` was running when it stopped: `fal` is what it had saved, `shots` the shots it had finished. */
  async function orphan(chosen: number[], state: { fal?: Record<string, unknown>; shots?: unknown[] }, from = 'worker-old'): Promise<string> {
    const id = await queued(chosen);
    await pool.query(`update remakes set status = 'running', started_at = now(), result = $2 where id = $1`, [id, JSON.stringify({ worker: from, ...state })]);
    return id;
  }
  const saved = (req: string, o: { account?: 'personal' | 'team'; ago?: number } = {}) => ({ providerJobId: `2:${req}`, account: o.account ?? ('personal' as const), submittedAt: Date.now() - (o.ago ?? 0) });
  /** What a started worker does: takes over the remakes of the workers that stopped and resumes each; returns their ids. */
  const resumeAll = async (worker: string, seam: Partial<RemakeSeams>): Promise<string[]> => {
    const taken = await takeOverRemakes(pool, worker, 60_000);
    for (const t of taken) await runRemake(pool, t.id, { ...seam, workerId: worker }, t.resume);
    return taken.map((t) => t.id).sort();
  };

  test('the request id is saved before the first poll, and the submit asks fal to drop a request that has not started when the poll gives up', async () => {
    const polled: unknown[] = [];
    const id = await queued([1]);
    const fal = fakeFal({ onStatus: async () => void polled.push((await row(id)).result) });
    try {
      await runRemake(pool, id, { read: realRead(), write: seams().write, workerId: 'worker-a' });
    } finally {
      restore();
    }
    expect((await row(id)).status).toBe('succeeded');
    expect(fal.submits()).toHaveLength(1);
    // The first poll already finds the request id (packed with its billed seconds) and the account it went to, under the shot's index.
    expect(polled[0]).toMatchObject({ worker: 'worker-a', fal: { 1: { providerJobId: '2:req-3', account: 'personal', submittedAt: expect.any(Number) } } });
    // 600 s is the poll deadline (CALL_DEADLINE_MS), so a request still queued then is dropped by fal instead of run and billed unseen.
    expect(fal.submits()[0]!.headers['X-Fal-Request-Start-Timeout']).toBe('600');
    expect(fal.submits()[0]!.headers.Authorization).toBe('Key test-key');
    // The finished remake's result no longer carries the worker or the request ids.
    expect((await row(id)).result).not.toHaveProperty('worker');
    expect((await row(id)).result).not.toHaveProperty('fal');
  });

  test('a fresh handler on a running remake polls the saved requests, downloads, books once per shot and concatenates, with no second submit', async () => {
    const id = await orphan([1, 2], { fal: { 1: saved('req-1'), 2: saved('req-2') }, shots: [] });
    // The old worker had booked shot 1 before it stopped: resuming must not book it again.
    await bookLlm(pool, { remake: id, step: '1:video' }, { costUsd: 0.4, provider: 'fal', model: 'fal-ai/wan/v2.7/edit-video' });
    const fal = fakeFal();
    try {
      expect(await resumeAll('worker-new', { read: realRead(), write: seams().write })).toEqual([id]);
    } finally {
      restore();
    }
    const r = await row(id);
    expect([r.status, r.error, r.cost_usd]).toEqual(['succeeded', null, '0.800000']);
    expect(r.output_asset_id).not.toBeNull();
    expect(r.result.shots.map((s: { index: number; status: string; costUsd: number }) => [s.index, s.status, s.costUsd])).toEqual([[1, 'succeeded', 0.4], [2, 'succeeded', 0.4]]);
    // Nothing was submitted or uploaded: both shots were polled by the ids the first worker saved.
    expect(fal.submits()).toEqual([]);
    expect(fal.uploads()).toEqual([]);
    expect(fal.seen.filter((c) => c.url.endsWith('/status')).map((c) => c.url)).toEqual([
      'https://queue.fal.run/fal-ai/wan/requests/req-1/status',
      'https://queue.fal.run/fal-ai/wan/requests/req-2/status',
    ]);
    expect((await ledger(id)).map((l: { ref: string; usd: string }) => [l.ref, l.usd])).toEqual([[`llm:remake:${id}:1:video`, '0.4000'], [`llm:remake:${id}:2:video`, '0.4000']]);
  });

  test('a shot finished before the restart is kept as it was, not paid for again; the rest are polled', async () => {
    const id = await orphan([1, 2], {
      fal: { 1: saved('req-1'), 2: saved('req-2') },
      shots: [{ index: 1, status: 'succeeded', clipAssetId: 'clip-done', costUsd: 0.4 }],
    });
    await bookLlm(pool, { remake: id, step: '1:video' }, { costUsd: 0.4, provider: 'fal', model: 'fal-ai/wan/v2.7/edit-video' });
    const fal = fakeFal();
    try {
      expect(await resumeAll('worker-new', { read: realRead(['assets/clip-done']), write: seams().write })).toEqual([id]);
    } finally {
      restore();
    }
    const r = await row(id);
    expect([r.status, r.cost_usd]).toEqual(['succeeded', '0.800000']);
    expect(r.result.shots[0].clipAssetId).toBe('clip-done');
    expect(fal.submits()).toEqual([]);
    expect(fal.seen.filter((c) => c.url.endsWith('/status')).map((c) => c.url)).toEqual(['https://queue.fal.run/fal-ai/wan/requests/req-2/status']);
    expect(await ledger(id)).toHaveLength(2);
  });

  test('only the first shot not yet recorded can have been submitted unsaved: it fails and is never submitted, the shots after it are submitted as usual', async () => {
    const lost = await orphan([1, 2], { shots: [] }); // shot 1 may have been submitted before its id was saved; shot 2 was never reached
    const fal = fakeFal();
    try {
      expect(await resumeAll('worker-new', { read: realRead(), write: seams().write })).toEqual([lost]);
    } finally {
      restore();
    }
    const l = await row(lost);
    expect(l.status).toBe('partial'); // shot 2 was made
    expect(l.error).toMatch(/^shot 1 has no saved fal request id .* it was not submitted again$/);
    expect(l.result.shots.map((s: { index: number; status: string }) => [s.index, s.status])).toEqual([[1, 'failed'], [2, 'succeeded']]);
    expect(fal.submits()).toHaveLength(1); // shot 2's, once
    expect((await ledger(lost)).map((x: { ref: string; usd: string }) => [x.ref, x.usd])).toEqual([[`llm:remake:${lost}:2:video`, '0.4000']]);
    expect(l.cost_usd).toBe('0.400000');
    // Its own request id was saved as it was submitted, so a second restart would poll it.
    await pool.query(`update remakes set status = 'failed' where id = $1`, [lost]);
  });

  test('a shot in flight with its id saved is polled, and the next shot, never reached, is submitted; a lone unrecorded shot fails with nothing paid', async () => {
    const half = await orphan([1, 2], { fal: { 1: saved('req-1') }, shots: [] });
    const none = await orphan([1], { shots: [] });
    const fal = fakeFal();
    try {
      expect(await resumeAll('worker-new', { read: realRead(), write: seams().write })).toEqual([half, none].sort());
    } finally {
      restore();
    }
    expect(await row(half)).toMatchObject({ status: 'succeeded', error: null, cost_usd: '0.800000' });
    expect(await row(none)).toMatchObject({ status: 'failed', output_asset_id: null, cost_usd: '0.000000' });
    expect((await row(none)).error).toMatch(/^shot 1 has no saved fal request id/);
    expect(fal.submits()).toHaveLength(1); // half's shot 2 only
    expect(await ledger(none)).toEqual([]);
    expect((await ledger(half)).map((x: { ref: string }) => x.ref)).toEqual([`llm:remake:${half}:1:video`, `llm:remake:${half}:2:video`]);
  });

  test('a request fal dropped on its start timeout (504, type user) is booked at $0 and fails the shot at once, on the status or the result call', async () => {
    for (const dropped of ['status', 'result'] as const) {
      const id = await orphan([1], { fal: { 1: saved('req-1') }, shots: [] });
      const fal = fakeFal({ dropped });
      const t0 = Date.now();
      try {
        expect(await resumeAll('worker-new', { read: realRead(), write: seams().write })).toEqual([id]);
      } finally {
        restore();
      }
      expect(await row(id)).toMatchObject({ status: 'failed', cost_usd: '0.000000', output_asset_id: null });
      expect((await row(id)).error).toMatch(/no runner started it before the start timeout/);
      expect(fal.polls()).toBe(1);
      expect(Date.now() - t0).toBeLessThan(10_000); // not polled until a deadline
      expect(await ledger(id)).toEqual([]);
    }
  });

  test('a resumed poll is capped at 10 minutes from the submit, not from the restart', async () => {
    const id = await orphan([1], { fal: { 1: saved('req-1', { ago: 11 * 60_000 }) }, shots: [] });
    const fal = fakeFal({ status: 'IN_PROGRESS' });
    try {
      await resumeAll('worker-new', { read: realRead(), write: seams().write });
    } finally {
      restore();
    }
    expect(fal.polls()).toBe(1); // one look, then given up at the estimate as past the deadline, with no 10 more minutes
    expect(await row(id)).toMatchObject({ status: 'failed', cost_usd: '0.400000' });
    expect((await ledger(id)).map((x: { usd: string }) => x.usd)).toEqual(['0.4000']);
  });

  test('the account saved is the one whose key submitted: a team label without FAL_KEY_NEXT is the personal account; a team request cannot be polled without the key', async () => {
    await pool.query(`update settings set fal_next_at = now() where id = 1`);
    try {
      // The settings say team, FAL_KEY_NEXT is unset: the request goes out with FAL_KEY. A row closed during the first poll keeps the saved ref to read back.
      const stopped = await queued([1]);
      const fal = fakeFal({ onStatus: async () => void (await pool.query(`update remakes set status = 'failed' where id = $1`, [stopped])) });
      try {
        await runRemake(pool, stopped, { read: realRead(), write: seams().write, workerId: 'worker-a' });
      } finally {
        restore();
      }
      expect(fal.submits()).toHaveLength(1);
      expect(fal.submits()[0]!.headers.Authorization).toBe('Key test-key');
      expect((await row(stopped)).result.fal[1].account).toBe('personal');
    } finally {
      await pool.query(`update settings set fal_next_at = null where id = 1`);
    }
    const id = await orphan([1], { fal: { 1: saved('req-1', { account: 'team' }) }, shots: [] });
    const fal = fakeFal();
    try {
      await resumeAll('worker-new', { read: realRead(), write: seams().write });
    } finally {
      restore();
    }
    expect(await row(id)).toMatchObject({ status: 'failed', cost_usd: '0.000000' });
    expect((await row(id)).error).toMatch(/FAL_KEY_NEXT is not set/);
    expect(fal.seen).toEqual([]);
  });

  test('the stale sweep leaves a remake whose worker is alive (a resume in progress)', async () => {
    const id = await orphan([1], { fal: { 1: saved('req-1') } }, 'worker-resuming');
    await pool.query(`update remakes set started_at = now() - interval '3 hours' where id = $1`, [id]);
    await pool.query(`insert into worker_heartbeat (worker_id) values ('worker-resuming') on conflict (worker_id) do update set beat_at = now()`);
    expect(await closeStaleRemakes(pool)).toBe(0);
    await pool.query(`delete from worker_heartbeat where worker_id = 'worker-resuming'`);
    expect(await closeStaleRemakes(pool)).toBe(1);
    expect((await row(id)).status).toBe('failed');
  });

  test('only a worker whose heartbeat stopped loses its remakes, to one taker; a superseded worker cannot write the remake any more', async () => {
    const live = await orphan([1], { fal: { 1: saved('req-1') } }, 'worker-live');
    const dead = await orphan([1], { fal: { 1: saved('req-1') } }, 'worker-dead');
    await pool.query(`insert into worker_heartbeat (worker_id) values ('worker-live') on conflict (worker_id) do update set beat_at = now()`);
    await pool.query(`delete from worker_heartbeat where worker_id = 'worker-dead'`);
    expect((await takeOverRemakes(pool, 'worker-new', 60_000)).map((t) => t.id)).toEqual([dead]);
    await pool.query(`insert into worker_heartbeat (worker_id) values ('worker-new') on conflict (worker_id) do update set beat_at = now()`);
    expect(await takeOverRemakes(pool, 'worker-other', 60_000)).toEqual([]); // the new owner is alive: taken once
    expect((await row(live)).status).toBe('running');
    // The old owner, still alive after all, is stopped at its next write: the remake is not its own any more.
    await runRemake(pool, dead, { workerId: 'worker-dead', read: realRead(), write: seams().write, edit: async () => ({ video: clipVideo, costUsd: 0.2 }) }, { worker: 'worker-dead', fal: { 1: saved('req-1') } });
    expect((await row(dead)).status).toBe('running');
    await pool.query(`update remakes set status = 'failed' where id = any($1::text[])`, [[live, dead]]);
  });
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
