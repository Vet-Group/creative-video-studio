// Runs against a disposable database on the compose Postgres (`pnpm services:up`). No binary, network or
// S3: the decompose, object store and VLM env are all injected.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { type AnalyzeSeams, defaultVlmEnv, reaAnalyzeEnabled, runReaAnalyze } from './analyze';

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
  translate: async (a) => ({ vi: { format: 'giới thiệu sản phẩm', hook: 'câu mở đầu', summary: 'tóm tắt', shots: a.shots.map((_, i) => `cảnh ${i + 1}`) }, costUsd: null }),
  ...over,
});

let seq = 0;
async function queued(): Promise<string> {
  const id = `an-${++seq}`;
  await pool.query(`insert into analyses (id, user_id, team_id, source_key, status) values ($1, 'u1', 'team-unassigned', $2, 'queued')`, [id, `sources/${id}.mp4`]);
  return id;
}
const row = async (id: string) => (await pool.query('select status, result, raw_key, provider, model, cost_usd::text as cost_usd, error from analyses where id = $1', [id])).rows[0];

beforeAll(async () => {
  await pool.query(`insert into users (id, email, name) values ('u1', 'u1@example.test', 'u1')`);
});
afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

test('decomposes a queued analysis, storing the parsed result, the raw breakdown.json and a cost', async () => {
  const id = await queued();
  await runReaAnalyze(pool, id, seams());
  const r = await row(id);
  expect(r.status).toBe('succeeded');
  expect(r.result.format).toBe('product showcase');
  expect(r.result.shots[0].prompt).toContain('white t-shirt');
  expect(r.raw_key).toBe(`analyses/${id}/breakdown.json`);
  expect(stored[`analyses/${id}/breakdown.json`]).toBeDefined();
  expect(r.provider).toBe('byteplus');
  expect(r.model).toBe('seed-2-0-lite-260428');
  expect(r.cost_usd).toBe('0.02');
  const led = (await pool.query(`select kind, usd::text as usd, user_id, team_id, store_id, job_id, provider, model, is_final from cost_entries where ref = $1`, [`llm:analysis:${id}`])).rows;
  expect(led).toEqual([{ kind: 'llm', usd: '0.0200', user_id: 'u1', team_id: 'team-unassigned', store_id: null, job_id: null, provider: 'byteplus', model: 'seed-2-0-lite-260428', is_final: true }]); // recorded in the Admin Costs ledger
  expect(r.result.vi.hook).toBe('câu mở đầu'); // Vietnamese for display
  expect(r.result.vi.shots).toEqual(['cảnh 1']);
  expect(r.result.shots[0].prompt).toContain('white t-shirt'); // English prompt kept for Create
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
  try {
    const r = await defaultVlmEnv();
    expect(r.provider).toBe('byteplus');
    expect(r.env.REA_VLM_API_KEY).toBe('ark-test');
    expect(r.model).toBe('seed-2-0-lite-260428');
    expect(fetchSpy).not.toHaveBeenCalled(); // BytePlus is the default; no reachability probe when the fallback is off
  } finally {
    if (prev.key === undefined) delete process.env.BYTEPLUS_ARK_API_KEY;
    else process.env.BYTEPLUS_ARK_API_KEY = prev.key;
    if (prev.fb === undefined) delete process.env.REA_VLM_VERTEX_FALLBACK;
    else process.env.REA_VLM_VERTEX_FALLBACK = prev.fb;
    vi.unstubAllGlobals();
  }
});
