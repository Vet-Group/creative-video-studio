// Reference-video analysis: shells out to the rea-video CLI on this worker, parses its breakdown.json
// into the Analysis the UI shows (with a detailed prompt per scene and a Vietnamese reading, analysisFromBreakdown), and
// stores both the derived Analysis and the raw breakdown.json (so later stages, such as Smart Remake and the scene prompts
// backfill, can re-parse richer fields without a re-run). Gated by REA_ANALYZE_ENABLED
// at the worker subscription and inert when off; the hard seams (decompose, object store, VLM env) are
// injected so the path is unit-tested without a real binary, network, or S3.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ANALYZE_COST_USD, type Analysis, type AnalysisVi, mergeShots, parseBreakdown } from '@cvs/core/analysis/breakdown';
import { createAnalysisPromptWriter, writeScenePrompts } from '@cvs/core/analysis/prompts';
import { analysisChat, type Chat, createAnalysisTranslator, translateAnalysisVi } from '@cvs/core/analysis/translate';
import { OPENAI_PRICES } from '@cvs/core/enhance';
import { bookLlm, withTransaction } from '@cvs/core/ledger';
import { byteplusReaVlm, pickReaVlm, reaVlmEnv, vertexReaVlm } from '@cvs/core/providers/rea-vlm';
import { serviceAccountToken } from '@cvs/core/providers/vertex';
import { vertexAccounts } from '@cvs/core/providers/vertex-accounts';
import { ANALYZE_QUEUE_OPTIONS } from '@cvs/core/queue';
import { downloadObject, getObject, putObject } from './storage';
import type { WorkerDeps } from './worker';

const run = promisify(execFile);

type Pool = WorkerDeps['pool'];

export interface AnalyzeSeams {
  /** Runs `rea-video decompose <video> -o <outDir>` with REA_VLM_* in its environment; `signal` (the queue job's, aborted at its expiry) stops it. */
  decompose?: (videoPath: string, outDir: string, env: Record<string, string>, signal?: AbortSignal) => Promise<void>;
  read?: (key: string) => Promise<Uint8Array>;
  write?: (key: string, body: Uint8Array, contentType: string) => Promise<void>;
  /** Resolves the REA_VLM_* environment; defaults to BytePlus from BYTEPLUS_ARK_API_KEY. */
  vlmEnv?: () => Promise<{ env: Record<string, string>; provider: string; model: string }>;
  /** Rewrites each scene's point into a detailed English prompt, one per stored shot; defaults to gpt-6-luna/fal, best-effort. */
  writePrompts?: (a: Analysis, raw: unknown) => Promise<{ prompts: string[]; costUsd: number | null }>;
  /** Translates the parsed analysis to Vietnamese for display; defaults to gpt-6-luna/fal, best-effort. */
  translate?: (a: Analysis) => Promise<{ vi: AnalysisVi; costUsd: number | null }>;
}

/** The feature switch for this worker. Default OFF: the queue is not even subscribed when unset. */
export const reaAnalyzeEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => env.REA_ANALYZE_ENABLED === '1';

// --vlm: per-shot VLM judgement (prompts the UI shows), and from rea-video ac47077 on also a survey of the cuts first: the VLM
//   drops the detector's false cuts and merges dissolves into one change (--no-survey would skip it; a failed survey keeps the
//   detector's cuts); --lang en: English report/summary/prompts (the UI
// localizes only the format label, and the provider prompts must be English). Not relying on host rea-video
// prefs keeps the invocation self-contained.
// --workers 3: run the per-shot VLM calls 3 at a time (rea-video's default). On ac47077, 5 workers kept a 57s/720p clip at ~1.3 GB;
//   c11f1bd needs more per worker: on prod (57.7s clip, 2026-11-26) 5 workers peaked at 1.8 GB / 6:55, 5 + --no-packaging at
//   1.6 GB / 6:25, and 3 + --no-packaging at 1.3 GB / 8:03, the only one leaving room for Node under the worker's 2G MemoryMax
//   (deploy/linux/cvs-worker.service).
// --max-vlm-shots 40: bound the VLM spend and time on a pathologically long video (default 60); the busiest real
//   clip measured was 27 shots, and rea-video spends the budget on the least-certain shots first.
// --no-stems --no-speakers: ac47077 separates vocals/music and diarizes speakers by default, which nothing here reads; the
//   stems pass alone was OOM-killed at 2G on prod (50s/720p clip, 2026-11-19). Without both: 898 MB peak / 4.5 min, survey on.
//   The flags are unknown to earlier rea-video, so the host's install must be ac47077 or later.
// --no-moments: from c11f1bd, --vlm also hunts "special moments" (magic reveals, twists, goofs) by default, 3-5 more VLM calls that
//   nothing here reads. --no-packaging: skips c11f1bd's editing layer (subtitle timeline, styled text, stickers, sound-effect
//   cue points), which nothing here reads either.
//   Both are unknown to ac47077, so the host's install must be c11f1bd or later.
// Killed a minute before the queue's expiry (at once when the job's signal aborts), so a hung rea-video cannot hold the one analysis slot.
const DECOMPOSE_TIMEOUT_MS = ANALYZE_QUEUE_OPTIONS.expireInSeconds * 1000 - 60_000;
const realDecompose = async (video: string, outDir: string, env: Record<string, string>, signal?: AbortSignal): Promise<void> => {
  await run(
    process.env.REA_VIDEO_BIN || 'rea-video',
    ['decompose', video, '-o', outDir, '--vlm', '--lang', 'en', '--workers', '3', '--max-vlm-shots', '40', '--no-stems', '--no-speakers', '--no-moments', '--no-packaging'],
    { env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024, timeout: DECOMPOSE_TIMEOUT_MS, killSignal: 'SIGKILL', signal },
  );
};

// A liveness probe: any HTTP answer (even 401) means Ark is reachable; only a network error or timeout reads as down.
const byteplusReachable = async (baseUrl: string): Promise<boolean> => {
  try {
    await fetch(`${baseUrl}/models`, { method: 'GET', signal: AbortSignal.timeout(4000) });
    return true;
  } catch {
    return false;
  }
};

// BytePlus Ark is the VLM by default. The Vertex fallback is wired but off unless REA_VLM_VERTEX_FALLBACK=1 and a Vertex
// service account is configured; even then it is used only when BytePlus is unreachable, and only on the account the credits
// guard keeps active (settings.vertex_active_project), so it stops with the other Vertex calls when the credits end. So the
// common path makes no probe.
export const defaultVlmEnv = async (activeProject: () => Promise<string | null>): Promise<{ env: Record<string, string>; provider: string; model: string }> => {
  const key = process.env.BYTEPLUS_ARK_API_KEY;
  const byteplus = key ? byteplusReaVlm(key) : undefined;
  const accounts = process.env.REA_VLM_VERTEX_FALLBACK === '1' ? vertexAccounts(process.env) : [];

  const reachable = byteplus && accounts.length ? await byteplusReachable(byteplus.baseUrl) : true;
  // Read the active account and mint a Vertex token only when the fallback may actually be used (BytePlus absent or unreachable).
  const active = accounts.length && (!byteplus || !reachable) ? await activeProject() : null;
  const account = accounts.find((a) => a.project === active);
  const token = account ? await serviceAccountToken(account.key)() : undefined;
  const vlm = pickReaVlm({
    byteplus,
    // Always global: the Vertex VLM model is served there only, whatever region GOOGLE_CLOUD_LOCATION sets for the other Vertex calls.
    vertex: account && token ? () => vertexReaVlm({ project: account.project, location: 'global', token }) : undefined,
    byteplusReachable: reachable,
  });
  return { env: reaVlmEnv(vlm), provider: byteplus && vlm.baseUrl === byteplus.baseUrl ? 'byteplus' : 'vertex', model: vlm.model };
};

// gpt-6-luna when OPENAI_API_KEY is set, else fal on FAL_KEY; undefined (no translation) when neither is configured.
// Built per run, not at import: the worker loads .env lazily (databaseUrl()), after this module is evaluated, so an import-time
// read saw no key and every analysis stayed English-only.
const defaultTranslate = () => createAnalysisTranslator({ openAiKey: process.env.OPENAI_API_KEY, falKey: process.env.FAL_KEY });
const defaultWritePrompts = () => createAnalysisPromptWriter({ openAiKey: process.env.OPENAI_API_KEY, falKey: process.env.FAL_KEY });

/**
 * The stored result of a breakdown.json: parsed, each scene's detailed prompt written over its point, then the Vietnamese reading of those prompts,
 * with the calls' cost. Both calls are best-effort: a failed writer leaves the points as the prompts, a failed translation leaves the result
 * English-only; each failure is logged. `prompts` says whether the writer's prompts are in.
 */
export async function analysisFromBreakdown(
  raw: unknown,
  llm: Pick<AnalyzeSeams, 'writePrompts' | 'translate'>,
  log: (line: string) => void = console.warn,
): Promise<{ analysis: Analysis; costUsd: number; prompts: boolean }> {
  const analysis = parseBreakdown(raw);
  let costUsd = 0;
  let prompts = false;
  if (llm.writePrompts) {
    try {
      const w = await llm.writePrompts(analysis, raw);
      analysis.shots.forEach((s, i) => (s.prompt = w.prompts[i] ?? s.prompt));
      if (w.costUsd) costUsd += w.costUsd;
      prompts = true;
    } catch (e) {
      log(`scene prompts failed, keeping the short points: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (llm.translate) {
    try {
      const t = await llm.translate(analysis);
      analysis.vi = t.vi;
      if (t.costUsd) costUsd += t.costUsd;
    } catch (e) {
      log(`translation failed, keeping the analysis English-only: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { analysis, costUsd, prompts };
}

/** Claims a queued analysis row, runs rea-video over its source video, and stores the result. Safe to
 * call more than once for the same id: only a `queued` row is claimed. */
export async function runReaAnalyze(pool: Pool, analysisId: string, seams: AnalyzeSeams = {}, signal?: AbortSignal): Promise<void> {
  const decompose = seams.decompose ?? realDecompose;
  const write = seams.write ?? putObject;
  const vlmEnv =
    seams.vlmEnv ?? (() => defaultVlmEnv(async () => ((await pool.query('select vertex_active_project from settings where id = 1')).rows[0]?.vertex_active_project as string | null) ?? null));
  const translate = seams.translate ?? defaultTranslate();
  const writePrompts = seams.writePrompts ?? defaultWritePrompts();

  const row = (await pool.query('select id, source_key, status from analyses where id = $1', [analysisId])).rows[0];
  if (!row || row.status !== 'queued') return;
  const claimed = (await pool.query(`update analyses set status = 'running', started_at = now() where id = $1 and status = 'queued'`, [analysisId])).rowCount;
  if (!claimed) return; // another worker claimed it first

  const dir = await mkdtemp(join(tmpdir(), 'cvs-analyze-'));
  try {
    const video = join(dir, 'source.mp4');
    // Streamed to disk: the source can be 500 MB, which in memory would share the worker's 2G with rea-video.
    if (seams.read) await writeFile(video, await seams.read(row.source_key));
    else await downloadObject(row.source_key, video, signal);
    const out = join(dir, 'out');
    const { env, provider, model } = await vlmEnv();
    await decompose(video, out, env, signal);
    const rawBytes = await readFile(join(out, 'breakdown.json'));
    // Best-effort prompts and Vietnamese display: a failed or missing LLM leaves the points and English only, still succeeded.
    const { analysis, costUsd } = await analysisFromBreakdown(JSON.parse(rawBytes.toString('utf8')), { writePrompts, translate }, (line) => console.warn(`worker: analysis ${analysisId}: ${line}`));
    const cost = ANALYZE_COST_USD + costUsd;
    const rawKey = `analyses/${analysisId}/breakdown.json`;
    await write(rawKey, rawBytes, 'application/json');
    // Close the row and book its cost to the member's team and store in one transaction, so the Admin Costs ledger always
    // matches a succeeded analysis. bookLlm is idempotent (ref llm:analysis:<id>); staff are not charged, the cost is only recorded.
    await withTransaction(pool, async (tx) => {
      await tx.query(
        // error = null: a run that outlived closeStaleAnalyses still wins, without the sweep's error.
        `update analyses set status = 'succeeded', result = $2, raw_key = $3, provider = $4, model = $5, cost_usd = $6, error = null, finished_at = now() where id = $1`,
        [analysisId, JSON.stringify(analysis), rawKey, provider, model, String(Number(cost.toFixed(6)))],
      );
      await bookLlm(tx, { analysis: analysisId }, { costUsd: cost, provider, model });
    });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 2000);
    await pool.query(`update analyses set status = 'failed', error = $2, finished_at = now() where id = $1`, [analysisId, msg]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Longer than any analysis runs: the queue's expiry and a margin. */
const STALE_AFTER_MS = ANALYZE_QUEUE_OPTIONS.expireInSeconds * 1000 + 5 * 60_000;

/**
 * Closes the analyses a stopped worker left running: the queue never retries one and its expiry does not write the row, and a running row cannot be
 * deleted. Failed, the member can remove it and analyse again. Returns how many it closed.
 */
export async function closeStaleAnalyses(pool: Pool, staleAfterMs = STALE_AFTER_MS): Promise<number> {
  const { rowCount } = await pool.query(
    `update analyses set status = 'failed', error = coalesce(error, 'the worker stopped before the analysis finished'), finished_at = now()
      where status = 'running' and coalesce(started_at, created_at) < now() - ($1::float8 * interval '1 millisecond')`,
    [staleAfterMs],
  );
  return rowCount ?? 0;
}

/**
 * A rough cost of one analysis' two calls at gpt-6-luna prices (fal's Gemini answers cost about four times more). The sample breakdown.json's one shot
 * sends the writer about 1,260 characters (250 of them Chinese), some 500 tokens; a 120-word prompt is about 200 tokens with its JSON, and its Vietnamese
 * reading about 300. The two system prompts and the video's header add some 600 tokens.
 */
export const scenePromptsEstimateUsd = (shots: number, scenes: number): number =>
  ((600 + 500 * shots + 200 * scenes) * OPENAI_PRICES.input + 500 * scenes * OPENAI_PRICES.output) / 1e6;

/** Whether a stored result already has the scene prompts: every shot keeps its point apart (a result from before has only `prompt`, the point). */
export const hasScenePrompts = (result: unknown): boolean => {
  const shots = (result as Partial<Analysis> | null)?.shots;
  return Array.isArray(shots) && shots.every((s) => typeof s?.point === 'string');
};

/** The backfill's plan: the rows to rewrite (every row with `force`) and their estimated cost. */
export function planScenePrompts<R extends { result: unknown }>(rows: R[], force: boolean): { todo: R[]; estimateUsd: number } {
  const todo = rows.filter((r) => force || !hasScenePrompts(r.result));
  const estimateUsd = todo.reduce((sum, r) => {
    const a = r.result as Analysis | null;
    return Array.isArray(a?.shots) ? sum + scenePromptsEstimateUsd(a.shots.length, mergeShots(a).shots.length) : sum;
  }, 0);
  return { todo, estimateUsd };
}

/**
 * One-off: the detailed scene prompts, and the Vietnamese reading of them, for the analyses that finished before the worker wrote them (the shared
 * reference videos too), re-parsed from each stored breakdown.json without running rea-video again. A dry run by default; `apply` rewrites `result`
 * only and books the calls' cost on the analysis as the worker does, under a step of its own so a forced re-run books its own spend. A row whose writer
 * or translation failed keeps its old result, so the next run retries it; `force` also redoes the rows that already have the prompts.
 * shortcut: like every analysis cost, the calls are booked on the analysis' own ICT day, so a run in a later month books an older analysis' calls to its
 * month; fine while the analyses are from the month the backfill runs in, book on the run's day if that ever matters.
 */
export async function backfillScenePrompts(
  pool: Pool,
  o: { apply: boolean; force: boolean },
  seams: { read?: AnalyzeSeams['read']; llm?: { chat: Chat; provider: string; model: string } } = {},
  log: (line: string) => void = console.log,
): Promise<{ found: number; todo: number; updated: number; failed: number }> {
  const { rows } = await pool.query(`select id, raw_key, result from analyses where status = 'succeeded' and raw_key is not null order by created_at, id`);
  const { todo, estimateUsd } = planScenePrompts(rows as { id: string; raw_key: string; result: unknown }[], o.force);
  log(`${rows.length} analyses, ${todo.length} to rewrite, about $${estimateUsd.toFixed(4)} at gpt-6-luna prices${o.apply ? '' : ' (dry run; pass --apply to write them, plus --force to redo the ones that have the prompts)'}`);
  if (!o.apply || todo.length === 0) return { found: rows.length, todo: todo.length, updated: 0, failed: 0 };
  const llm = seams.llm ?? analysisChat({ openAiKey: process.env.OPENAI_API_KEY, falKey: process.env.FAL_KEY }, 'analyze backfill');
  if (!llm) throw new Error('OPENAI_API_KEY or FAL_KEY must be set to write the prompts');
  const read = seams.read ?? getObject;
  const step = `prompts-${Date.now()}`;
  let updated = 0;
  let failed = 0;
  for (const r of todo) {
    try {
      const raw = JSON.parse(Buffer.from(await read(r.raw_key)).toString('utf8'));
      const calls = { writePrompts: (a: Analysis, b: unknown) => writeScenePrompts(a, b, llm.chat), translate: (a: Analysis) => translateAnalysisVi(a, llm.chat) };
      const { analysis, costUsd, prompts } = await analysisFromBreakdown(raw, calls, (line) => log(`${r.id}: ${line}`));
      const ok = prompts && analysis.vi !== undefined;
      await withTransaction(pool, async (tx) => {
        if (ok) await tx.query(`update analyses set result = $2 where id = $1 and status = 'succeeded'`, [r.id, JSON.stringify(analysis)]);
        await bookLlm(tx, { analysis: r.id, step }, { costUsd, provider: llm.provider, model: llm.model });
      });
      if (ok) updated++;
      else {
        failed++;
        log(`${r.id}: left as it was`);
      }
    } catch (e) {
      failed++;
      log(`${r.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  log(`rewrote ${updated} of ${todo.length} analyses, ${failed} failed`);
  return { found: rows.length, todo: todo.length, updated, failed };
}
