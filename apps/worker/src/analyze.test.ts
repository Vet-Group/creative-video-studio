// Runs against a disposable database on the compose Postgres (`pnpm services:up`). No binary, network or
// S3: the decompose, object store and VLM env are all injected.
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { ANALYSIS_PROMPTS_SYSTEM } from '@cvs/core/analysis/prompts';
import { ANALYZE_QUEUE_OPTIONS } from '@cvs/core/queue';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { type AnalyzeSeams, backfillScenePrompts, closeStaleAnalyses, defaultVlmEnv, hasScenePrompts, planScenePrompts, reaAnalyzeEnabled, runReaAnalyze, scenePromptsEstimateUsd } from './analyze';

// rea-video never runs here: the one test without a decompose seam reads the options the real one hands execFile, which fails as a killed run would.
const execFile = vi.hoisted(() => vi.fn((_file: string, _args: string[], _opts: object, done: (e: Error) => void) => done(new Error('Command failed: rea-video decompose'))));
vi.mock('node:child_process', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:child_process')>()), execFile }));
// The object store, for the one test without a read seam.
const storage = vi.hoisted(() => ({ getObject: vi.fn(), downloadObject: vi.fn(async () => undefined) }));
vi.mock('./storage', async (importOriginal) => ({ ...(await importOriginal<typeof import('./storage')>()), ...storage }));

const testDb = await createTestDatabase();
const pool = createPool(testDb.url, 2);

const sample = {
  summary: { duration: 11.4, shots: 1 },
  whole_video_vlm: { summary: 'A model wearing a plain white t-shirt in a clean studio.', format: 'product showcase', hook: 'Clean apparel presentation.' },
  shots: [{ index: 1, start: 0, end: 11.4, narrative: { role: 'mood', point: 'Model posing to showcase a plain white t-shirt.' } }],
};

const stored: Record<string, Uint8Array> = {};
const seams = (over: Partial<AnalyzeSeams> = {}): AnalyzeSeams => ({
  decompose: async (_video, outDir) => {
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'breakdown.json'), JSON.stringify(sample));
  },
  read: async () => new Uint8Array([0, 0, 0]),
  write: async (key, body) => void (stored[key] = body),
  vlmEnv: async () => ({ env: { REA_VLM_MODEL: 'seed-2-0-lite-260428' }, provider: 'byteplus', model: 'seed-2-0-lite-260428' }),
  // Never the default writer or translator here: the test database loads the repo's .env, keys included.
  writePrompts: async (a) => ({ prompts: a.shots.map((_, i) => `Medium shot ${i + 1}; the model turns to show the product.`), costUsd: null }),
  translate: async (a) => ({ vi: { format: 'giới thiệu sản phẩm', hook: 'câu mở đầu', summary: 'tóm tắt', shots: a.shots.map((_, i) => `cảnh ${i + 1}`) }, costUsd: null }),
  ...over,
});

let seq = 0;
async function queued(): Promise<string> {
  const id = `an-${++seq}`;
  await pool.query(`insert into analyses (id, user_id, team_id, source_key, status, workspace_id) values ($1, 'u1', 'team-unassigned', $2, 'queued', 'ws_vet')`, [id, `sources/${id}.mp4`]);
  return id;
}
const row = async (id: string) => (await pool.query('select status, result, raw_key, provider, model, cost_usd::text as cost_usd, error from analyses where id = $1', [id])).rows[0];

beforeAll(async () => {
  await pool.query(`insert into users (id, email, name) values ('u1', 'u1@example.test', 'u1')`);
});
afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

test('decomposes a queued analysis, storing the parsed result, the raw breakdown.json and a cost', async () => {
  const id = await queued();
  await runReaAnalyze(pool, id, seams());
  const r = await row(id);
  expect(r.status).toBe('succeeded');
  expect(r.result.format).toBe('product showcase');
  expect(r.raw_key).toBe(`analyses/${id}/breakdown.json`);
  expect(stored[`analyses/${id}/breakdown.json`]).toBeDefined();
  expect(r.provider).toBe('byteplus');
  expect(r.model).toBe('seed-2-0-lite-260428');
  expect(r.cost_usd).toBe('0.02');
  const led = (await pool.query(`select kind, usd::text as usd, user_id, team_id, store_id, job_id, provider, model, is_final from cost_entries where ref = $1`, [`llm:analysis:${id}`])).rows;
  expect(led).toEqual([{ kind: 'llm', usd: '0.0200', user_id: 'u1', team_id: 'team-unassigned', store_id: null, job_id: null, provider: 'byteplus', model: 'seed-2-0-lite-260428', is_final: true }]); // recorded in the Admin Costs ledger
  expect(r.result.vi.hook).toBe('câu mở đầu'); // Vietnamese for display
  expect(r.result.vi.shots).toEqual(['cảnh 1']);
  expect(r.result.shots[0].prompt).toBe('Medium shot 1; the model turns to show the product.'); // the detailed English prompt for Create
  expect(r.result.shots[0].point).toBe('Model posing to showcase a plain white t-shirt.'); // rea-video's beat, kept apart
});

test('writes the scene prompts from the raw breakdown before the translation reads them, and adds their cost', async () => {
  const id = await queued();
  let translated: string[] = [];
  await runReaAnalyze(
    pool,
    id,
    seams({
      writePrompts: async (_a, raw) => ({ prompts: [(raw as typeof sample).shots[0]!.narrative.role === 'mood' ? 'Close-up; the product turns.' : 'wrong raw'], costUsd: 0.01 }),
      translate: async (a) => ((translated = a.shots.map((s) => s.prompt)), { vi: { format: 'f', hook: 'h', summary: 's', shots: ['c1'] }, costUsd: 0.03 }),
    }),
  );
  const r = await row(id);
  expect(translated).toEqual(['Close-up; the product turns.']);
  expect(r.result.shots[0].prompt).toBe('Close-up; the product turns.');
  expect(r.cost_usd).toBe('0.06'); // 0.02 analyze + 0.01 prompts + 0.03 translate
});

test('keeps the short point as the prompt, logged, when the prompt writer fails, and still translates', async () => {
  const id = await queued();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    await runReaAnalyze(
      pool,
      id,
      seams({
        writePrompts: async () => {
          throw new Error('analyze prompts: the answer is not English');
        },
      }),
    );
    expect(warn).toHaveBeenCalledWith(`worker: analysis ${id}: scene prompts failed, keeping the short points: analyze prompts: the answer is not English`);
  } finally {
    warn.mockRestore();
  }
  const r = await row(id);
  expect(r.status).toBe('succeeded');
  expect(r.result.shots[0]).toMatchObject({ point: 'Model posing to showcase a plain white t-shirt.', prompt: 'Model posing to showcase a plain white t-shirt.' });
  expect(r.result.vi.shots).toEqual(['cảnh 1']);
  expect(r.cost_usd).toBe('0.02');
});

test('adds the translation cost to the stored cost, and stays English-only when the translator fails', async () => {
  const paid = await queued();
  await runReaAnalyze(pool, paid, seams({ translate: async () => ({ vi: { format: 'f', hook: 'h', summary: 's', shots: ['c1'] }, costUsd: 0.03 }) }));
  const rp = await row(paid);
  expect(rp.cost_usd).toBe('0.05'); // 0.02 analyze + 0.03 translate, no float dust
  expect(rp.result.vi.summary).toBe('s');

  const noVi = await queued();
  await runReaAnalyze(
    pool,
    noVi,
    seams({
      translate: async () => {
        throw new Error('translate boom');
      },
    }),
  );
  const rn = await row(noVi);
  expect(rn.status).toBe('succeeded');
  expect(rn.result.vi).toBeUndefined();
  expect(rn.cost_usd).toBe('0.02');
});

test('the default translator reads its key when an analysis runs, not when the module was imported', async () => {
  // The worker loads .env lazily (databaseUrl()), after this module is evaluated: a key that appears later must still be used.
  const saved = { openAi: process.env.OPENAI_API_KEY, fal: process.env.FAL_KEY };
  delete process.env.OPENAI_API_KEY;
  process.env.FAL_KEY = 'test-fal-key';
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ output: JSON.stringify({ format: 'f', hook: 'mở đầu', summary: 's', shots: ['c1'] }) }), { status: 200 }));
  try {
    const id = await queued();
    await runReaAnalyze(pool, id, { ...seams(), translate: undefined });
    expect((await row(id)).result.vi.hook).toBe('mở đầu');
  } finally {
    vi.unstubAllGlobals();
    if (saved.openAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved.openAi;
    if (saved.fal === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = saved.fal;
  }
});

test('streams the source video to disk without reading it into memory, under the queue job signal', async () => {
  const id = await queued();
  const expiry = new AbortController();
  await runReaAnalyze(pool, id, seams({ read: undefined }), expiry.signal);
  expect(storage.getObject).not.toHaveBeenCalled();
  expect(storage.downloadObject).toHaveBeenCalledWith(`sources/${id}.mp4`, expect.stringMatching(/source\.mp4$/), expiry.signal);
  expect((await row(id)).status).toBe('succeeded');
});

test('does nothing on a repeated run once the analysis is no longer queued', async () => {
  const id = await queued();
  let calls = 0;
  const counting = (): Partial<AnalyzeSeams> => ({
    decompose: async (_v, outDir) => {
      calls++;
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, 'breakdown.json'), JSON.stringify(sample));
    },
  });
  await runReaAnalyze(pool, id, seams(counting()));
  await runReaAnalyze(pool, id, seams(counting()));
  expect(calls).toBe(1);
  expect((await row(id)).status).toBe('succeeded');
});

test('records a failure when decompose throws, without leaving the row running', async () => {
  const id = await queued();
  await runReaAnalyze(
    pool,
    id,
    seams({
      decompose: async () => {
        throw new Error('rea-video boom');
      },
    }),
  );
  const r = await row(id);
  expect(r.status).toBe('failed');
  expect(r.error).toContain('rea-video boom');
});

test('the feature flag is off unless explicitly set', () => {
  expect(reaAnalyzeEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  expect(reaAnalyzeEnabled({ REA_ANALYZE_ENABLED: '1' } as NodeJS.ProcessEnv)).toBe(true);
});

test('defaultVlmEnv uses BytePlus from the key and never probes when the Vertex fallback is off', async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  const prev = { key: process.env.BYTEPLUS_ARK_API_KEY, fb: process.env.REA_VLM_VERTEX_FALLBACK };
  process.env.BYTEPLUS_ARK_API_KEY = 'ark-test';
  delete process.env.REA_VLM_VERTEX_FALLBACK;
  const active = vi.fn(async () => 'vx');
  try {
    const r = await defaultVlmEnv(active);
    expect(active).not.toHaveBeenCalled(); // the guard's active account is read only when the fallback may be used
    expect(r.provider).toBe('byteplus');
    expect(r.env.REA_VLM_API_KEY).toBe('ark-test');
    expect(r.model).toBe('seed-2-0-lite-260428');
    expect(r.env).not.toHaveProperty('REA_VLM_REASONING_EFFORT');
    expect(fetchSpy).not.toHaveBeenCalled(); // BytePlus is the default; no reachability probe when the fallback is off
  } finally {
    if (prev.key === undefined) delete process.env.BYTEPLUS_ARK_API_KEY;
    else process.env.BYTEPLUS_ARK_API_KEY = prev.key;
    if (prev.fb === undefined) delete process.env.REA_VLM_VERTEX_FALLBACK;
    else process.env.REA_VLM_VERTEX_FALLBACK = prev.fb;
    vi.unstubAllGlobals();
  }
});

test('the Vertex fallback calls the global endpoint even when GOOGLE_CLOUD_LOCATION names a region', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cvs-vlm-'));
  const file = join(dir, 'key.json');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  await writeFile(file, JSON.stringify({ client_email: 'sa@test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), project_id: 'vx' }));
  const fetchSpy = vi.fn(async () => Response.json({ access_token: 'vx-token', expires_in: 3600 }));
  vi.stubGlobal('fetch', fetchSpy);
  const keys = ['BYTEPLUS_ARK_API_KEY', 'REA_VLM_VERTEX_FALLBACK', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_APPLICATION_CREDENTIALS_NEXT', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION'] as const;
  const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, { REA_VLM_VERTEX_FALLBACK: '1', GOOGLE_APPLICATION_CREDENTIALS: file, GOOGLE_CLOUD_LOCATION: 'us-central1' });
  try {
    const r = await defaultVlmEnv(async () => 'vx');
    expect(r.provider).toBe('vertex');
    expect(r.env.REA_VLM_BASE_URL).toBe('https://aiplatform.googleapis.com/v1beta1/projects/vx/locations/global/endpoints/openapi');
    expect(r.env.REA_VLM_API_KEY).toBe('vx-token');
    expect(r.model).toBe('google/gemini-3.5-flash');
    expect(r.env.REA_VLM_REASONING_EFFORT).toBe('low');
    // The credits guard ended the account (no active project, or another one): no Vertex token is minted and there is no VLM.
    const minted = fetchSpy.mock.calls.length;
    await expect(defaultVlmEnv(async () => null)).rejects.toThrow(/no VLM provider/);
    await expect(defaultVlmEnv(async () => 'other-project')).rejects.toThrow(/no VLM provider/);
    expect(fetchSpy.mock.calls.length).toBe(minted);
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    vi.unstubAllGlobals();
    await rm(dir, { recursive: true, force: true });
  }
});

test('the backfill plan: rows whose shots all keep a point are done unless forced, and the estimate follows their shots and scenes', () => {
  const old = { result: { shots: [{ prompt: 'Beat A.' }, { prompt: 'Beat A.' }, { prompt: 'Beat B.' }] } };
  const done = { result: { shots: [{ point: 'Beat A.', prompt: 'Wide shot; the model walks in.' }] } };
  const empty = { result: { shots: [] } };
  expect([old, done, empty].map((r) => hasScenePrompts(r.result))).toEqual([false, true, true]);
  expect(hasScenePrompts(null)).toBe(false);
  expect(planScenePrompts([old, done, empty], false)).toEqual({ todo: [old], estimateUsd: scenePromptsEstimateUsd(3, 2) });
  expect(planScenePrompts([old, done, empty], true).todo).toEqual([old, done, empty]);
  expect(scenePromptsEstimateUsd(10, 8)).toBeGreaterThan(0.001);
  expect(scenePromptsEstimateUsd(10, 8)).toBeLessThan(0.01); // gpt-6-luna; about $0.003 for a 10-shot clip
});

test('the backfill rewrites only the result of the old analyses from their stored breakdown.json, books the calls, and skips them next time', async () => {
  const breakdown = (point: string) => ({ ...sample, shots: [{ ...sample.shots[0]!, narrative: { role: 'mood', point } }] });
  const objects: Record<string, Uint8Array> = {};
  const old = async (id: string, point: string, shared = false) => {
    objects[`analyses/${id}/breakdown.json`] = new TextEncoder().encode(JSON.stringify(breakdown(point)));
    const result = { durationS: 11.4, shotCount: 1, format: 'product showcase', hook: 'h', summary: 's', shots: [{ index: 1, start: 0, end: 11.4, role: 'mood', prompt: point }], vi: { format: 'f', hook: 'h', summary: 's', shots: ['cũ'] } };
    await pool.query(
      `insert into analyses (id, user_id, team_id, source_key, status, result, raw_key, provider, model, cost_usd, finished_at, shared_title, shared_at, workspace_id)
       values ($1, 'u1', 'team-unassigned', $2, 'succeeded', $3, $4, 'byteplus', 'seed', 0.02, '2026-11-13T00:00:00Z', $5, $6, 'ws_vet')`,
      [id, `sources/${id}.mp4`, JSON.stringify(result), `analyses/${id}/breakdown.json`, shared ? 'Áo thun' : null, shared ? '2026-11-14T00:00:00Z' : null],
    );
  };
  await old('bf-old', 'Model posing to showcase a plain white t-shirt.', true); // a shared reference video is backfilled too
  await old('bf-bad', 'A broken beat.');
  await pool.query(`insert into analyses (id, user_id, team_id, source_key, status, workspace_id) values ('bf-queued', 'u1', 'team-unassigned', 'sources/q.mp4', 'queued', 'ws_vet')`);

  const asked: string[] = [];
  const chat = async (system: string, user: string) => {
    const body = JSON.parse(user);
    if (system === ANALYSIS_PROMPTS_SYSTEM) {
      asked.push(body.scenes[0].beat);
      return body.scenes[0].beat === 'A broken beat.' ? { text: '{"prompts":["中景"]}', costUsd: 0.001 } : { text: '{"prompts":["Medium shot; the model turns to show the product."]}', costUsd: 0.004 };
    }
    return { text: JSON.stringify({ format: 'f', hook: 'h', summary: 's', shots: body.shots.map(() => 'cảnh mới') }), costUsd: 0.002 };
  };
  const seams = { read: async (key: string) => objects[key]!, llm: { chat, provider: 'openai', model: 'gpt-6-luna' } };
  const lines: string[] = [];
  const log = (line: string) => void lines.push(line);
  const before = (await pool.query(`select * from analyses where id = 'bf-old'`)).rows[0];

  const dry = await backfillScenePrompts(pool, { apply: false, force: false }, seams, log);
  expect(dry).toMatchObject({ todo: 2, updated: 0, failed: 0 });
  expect(asked).toEqual([]); // a dry run calls no model
  expect(lines.at(-1)).toContain('2 to rewrite, about $');

  const run = await backfillScenePrompts(pool, { apply: true, force: false }, seams, log);
  expect(run).toMatchObject({ todo: 2, updated: 1, failed: 1 });
  const after = (await pool.query(`select * from analyses where id = 'bf-old'`)).rows[0];
  expect(after.result.shots[0]).toEqual({ index: 1, start: 0, end: 11.4, role: 'mood', point: 'Model posing to showcase a plain white t-shirt.', prompt: 'Medium shot; the model turns to show the product.' });
  expect(after.result.vi.shots).toEqual(['cảnh mới']);
  expect({ ...after, result: null }).toEqual({ ...before, result: null }); // every other field as it was
  const led = (await pool.query(`select ref, usd::text as usd, provider, model from cost_entries where ref like 'llm:analysis:bf-old:%'`)).rows;
  expect(led).toEqual([{ ref: expect.stringMatching(/^llm:analysis:bf-old:prompts-\d+$/), usd: '0.0060', provider: 'openai', model: 'gpt-6-luna' }]);
  expect((await pool.query(`select result from analyses where id = 'bf-bad'`)).rows[0].result.shots[0]).toEqual({ index: 1, start: 0, end: 11.4, role: 'mood', prompt: 'A broken beat.' }); // left for the next run
  expect(lines).toContain('bf-bad: left as it was');

  asked.length = 0;
  expect(await backfillScenePrompts(pool, { apply: true, force: false }, seams, log)).toMatchObject({ todo: 1 });
  expect(asked).toEqual(['A broken beat.']); // the done analysis is skipped
});

test("runs rea-video with the queue job's signal and a timeout inside the queue's expiry, so a hung run is killed and the analysis ends failed", async () => {
  const id = await queued();
  const expiry = new AbortController();
  await runReaAnalyze(pool, id, seams({ decompose: undefined }), expiry.signal);
  expect(execFile).toHaveBeenCalledOnce();
  const opts = execFile.mock.calls[0]![2] as { signal?: AbortSignal; timeout?: number; killSignal?: string };
  expect(opts.signal).toBe(expiry.signal);
  expect(opts.killSignal).toBe('SIGKILL');
  expect(opts.timeout).toBeGreaterThan(0);
  expect(opts.timeout).toBeLessThan(ANALYZE_QUEUE_OPTIONS.expireInSeconds * 1000);
  expect(execFile.mock.calls[0]![1]).toEqual(expect.arrayContaining(['--no-stems', '--no-speakers', '--no-moments', '--no-packaging'])); // the passes nothing here reads stay off
  expect((await row(id)).status).toBe('failed');
});

test('closes an analysis a stopped worker left running, so the member can delete it, and leaves one that may still run', async () => {
  await pool.query(
    `insert into analyses (id, user_id, team_id, source_key, status, started_at, workspace_id) values
       ('an-stale', 'u1', 'team-unassigned', 'sources/stale.mp4', 'running', now() - interval '40 minutes', 'ws_vet'),
       ('an-busy', 'u1', 'team-unassigned', 'sources/busy.mp4', 'running', now() - interval '5 minutes', 'ws_vet')`,
  );
  expect(await closeStaleAnalyses(pool)).toBe(1);
  const stale = (await pool.query(`select status, error, finished_at from analyses where id = 'an-stale'`)).rows[0];
  expect([stale.status, stale.error]).toEqual(['failed', 'the worker stopped before the analysis finished']); // DELETE /api/analyses/[id] takes a failed row
  expect(stale.finished_at).not.toBeNull();
  expect((await row('an-busy')).status).toBe('running');
});

test("a run that outlives the sweep still ends succeeded, without the sweep's error", async () => {
  const id = await queued();
  const swept = seams({ decompose: async (video, out, env) => (await closeStaleAnalyses(pool, 0), seams().decompose!(video, out, env)) });
  await runReaAnalyze(pool, id, swept);
  expect(await row(id)).toMatchObject({ status: 'succeeded', error: null });
});
