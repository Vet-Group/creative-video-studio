// Reference-video analysis: shells out to the rea-video CLI on this worker, parses its breakdown.json
// into the Analysis the UI shows, and stores both the derived Analysis and the raw breakdown.json (so
// the later Smart Remake stage can re-parse richer fields without a re-run). Gated by REA_ANALYZE_ENABLED
// at the worker subscription and inert when off; the hard seams (decompose, object store, VLM env) are
// injected so the path is unit-tested without a real binary, network, or S3.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { parseBreakdown } from '@cvs/core/analysis/breakdown';
import { byteplusReaVlm, pickReaVlm, reaVlmEnv } from '@cvs/core/providers/rea-vlm';
import { getObject, putObject } from './storage';
import type { WorkerDeps } from './worker';

const run = promisify(execFile);

// rea-video does not report VLM token usage, and seed-2-0-lite is cheap; the real spend is the
// generation the user runs afterward. shortcut: flat estimate, upgrade when rea-video surfaces usage.
const ANALYZE_COST_USD = 0.02;

type Pool = WorkerDeps['pool'];

export interface AnalyzeSeams {
  /** Runs `rea-video decompose <video> -o <outDir>` with REA_VLM_* in its environment. */
  decompose?: (videoPath: string, outDir: string, env: Record<string, string>) => Promise<void>;
  read?: (key: string) => Promise<Uint8Array>;
  write?: (key: string, body: Uint8Array, contentType: string) => Promise<void>;
  /** Resolves the REA_VLM_* environment; defaults to BytePlus from BYTEPLUS_ARK_API_KEY. */
  vlmEnv?: () => Promise<{ env: Record<string, string>; provider: string; model: string }>;
}

/** The feature switch for this worker. Default OFF: the queue is not even subscribed when unset. */
export const reaAnalyzeEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => env.REA_ANALYZE_ENABLED === '1';

const realDecompose = async (video: string, outDir: string, env: Record<string, string>): Promise<void> => {
  await run(process.env.REA_VIDEO_BIN || 'rea-video', ['decompose', video, '-o', outDir], { env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024 });
};

const defaultVlmEnv = async (): Promise<{ env: Record<string, string>; provider: string; model: string }> => {
  const key = process.env.BYTEPLUS_ARK_API_KEY;
  if (!key) throw new Error('rea-analyze: no VLM key (BYTEPLUS_ARK_API_KEY)');
  const vlm = pickReaVlm({ byteplus: byteplusReaVlm(key), byteplusReachable: true });
  return { env: reaVlmEnv(vlm), provider: 'byteplus', model: vlm.model };
};

/** Claims a queued analysis row, runs rea-video over its source video, and stores the result. Safe to
 * call more than once for the same id: only a `queued` row is claimed. */
export async function runReaAnalyze(pool: Pool, analysisId: string, seams: AnalyzeSeams = {}): Promise<void> {
  const decompose = seams.decompose ?? realDecompose;
  const read = seams.read ?? getObject;
  const write = seams.write ?? putObject;
  const vlmEnv = seams.vlmEnv ?? defaultVlmEnv;

  const row = (await pool.query('select id, source_key, status from analyses where id = $1', [analysisId])).rows[0];
  if (!row || row.status !== 'queued') return;
  const claimed = (await pool.query(`update analyses set status = 'running', started_at = now() where id = $1 and status = 'queued'`, [analysisId])).rowCount;
  if (!claimed) return; // another worker claimed it first

  const dir = await mkdtemp(join(tmpdir(), 'cvs-analyze-'));
  try {
    const video = join(dir, 'source.mp4');
    await writeFile(video, await read(row.source_key));
    const out = join(dir, 'out');
    const { env, provider, model } = await vlmEnv();
    await decompose(video, out, env);
    const rawBytes = await readFile(join(out, 'breakdown.json'));
    const analysis = parseBreakdown(JSON.parse(rawBytes.toString('utf8')));
    const rawKey = `analyses/${analysisId}/breakdown.json`;
    await write(rawKey, rawBytes, 'application/json');
    await pool.query(
      `update analyses set status = 'succeeded', result = $2, raw_key = $3, provider = $4, model = $5, cost_usd = $6, finished_at = now() where id = $1`,
      [analysisId, JSON.stringify(analysis), rawKey, provider, model, String(ANALYZE_COST_USD)],
    );
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 2000);
    await pool.query(`update analyses set status = 'failed', error = $2, finished_at = now() where id = $1`, [analysisId, msg]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
