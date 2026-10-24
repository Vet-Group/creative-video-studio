// Bake-off runner (plan B.4): 2 models x 10 images at 9:16, the thrift duration and resolution, the safe preset.
//   tsx scripts/bakeoff/run.ts --set canary|half-1|half-2|extra [--models id,id] [--images 1,2,3] [--preset id] [--root dir] [--inputs file]
// FAL_KEY and REPLICATE_API_TOKEN come from the environment. Sets: canary = image 1; half-1 = images 1-5 (image 1 is polled, not
// resubmitted); half-2 = images 6-10 (pass --models with the models still able to pass); extra = at most 5 images of one model with a
// preset other than the safe one, round "extra". The logic is in runStage so tests drive it on the mock adapter, never a real provider.
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { BAKEOFF_MODELS, estimateUsd, validateRequest, type ModelConfig } from '@cvs/core/models';
import { BAKEOFF_PRESET, PRESETS } from '@cvs/core/presets';
import { ImageReadError, isFundingRefusal, ProviderHttpError } from '@cvs/core/providers/http';
import { createFalProvider } from '@cvs/core/providers/fal';
import { createReplicateProvider } from '@cvs/core/providers/replicate';
import type { VideoProvider } from '@cvs/core/providers';
import { defaultRoot, isMain } from './common.ts';
import { imageUrl, loadInputs, localReadImage, type Inputs } from './inputs.ts';
import {
  appendLine, defaultImages, keyId, latest, parseSet, readLines, roundOf, spend, type JobKey, type JobLine, type JobStatus, type SetName,
} from './jobs.ts';

// Lowered from $40 by the owner on 2026-10-24: the canary, the 20 bake-off clips and the server smoke clip fit (about $19.30 at 5 s).
export const CAP_USD = 20;
/** The funding gate keeps this much fal balance beyond the stage's estimated fal cost. */
export const MARGIN_USD = 2;

export interface RunDeps {
  outDir: string;
  inputs: Inputs;
  models: ModelConfig[];
  providers: Partial<Record<ModelConfig['provider'], VideoProvider>>;
  /** The fal balance in USD; the real one reads /v1/account/billing?expand=credits. */
  falBalance: () => Promise<number>;
  download: (url: string, dest: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now?: () => Date;
  capUsd?: number;
  marginUsd?: number;
  pollMs?: number;
  maxPolls?: number;
}

export interface StageOptions {
  set: SetName;
  /** Model ids; default all. Half 2 passes only the models still able to pass. */
  models?: string[];
  /** Image numbers; only for the extra set. */
  images?: number[];
  presetId?: string;
}

export interface StageResult {
  set: SetName;
  outcome:
    | 'complete'
    | 'stuck: not funded'
    | 'stopped: cap'
    | 'stopped: rate limited'
    | 'stopped: image unreadable'
    | 'stopped: auth'
    | 'stopped: provider error';
  reason?: string;
  counts: Record<string, number>;
  /** failed + unknown + timeout: jobs that ended without a clip. A refusal for credit is not one. */
  renderFailures: number;
  spentUsd: number;
  spentByProvider: Record<string, number>;
  /** The last fal balance read during the stage; null when none was read. */
  falBalanceUsd: number | null;
}

const FINAL: JobStatus[] = ['succeeded', 'failed', 'unknown', 'refused'];
const THRIFT_RATIO = '9:16';

interface Planned {
  key: JobKey;
  model: ModelConfig;
  durationSec: number;
  estimateUsd: number;
}

function plan(deps: RunDeps, opts: StageOptions): { jobs: Planned[]; prompt: string } {
  if (opts.models && new Set(opts.models).size !== opts.models.length) throw new Error('--models repeats a model');
  if (opts.images && new Set(opts.images).size !== opts.images.length) throw new Error('--images repeats an image');
  const models = opts.models ? opts.models.map((id) => deps.models.find((m) => m.id === id) ?? fail(`unknown model ${id}`)) : deps.models;
  if (!models.length) throw new Error('no model selected');
  let images: number[];
  let prompt = BAKEOFF_PRESET.prompt;
  if (opts.set === 'extra') {
    images = opts.images ?? [];
    if (!images.length || images.length > 5) throw new Error('extra needs 1 to 5 --images');
    if (models.length !== 1) throw new Error('extra runs one model');
    const p = PRESETS.find((x) => x.id === opts.presetId);
    if (!p || p.id === BAKEOFF_PRESET.id) throw new Error('extra needs --preset naming a preset other than the safe one');
    prompt = p.prompt;
  } else {
    if (opts.images || opts.presetId) throw new Error(`--images and --preset apply only to the extra set`);
    images = defaultImages(opts.set);
  }
  for (const n of images) if (!Number.isInteger(n) || n < 1 || n > deps.inputs.images.length) throw new Error(`image ${n} is not in inputs.json`);
  const jobs: Planned[] = [];
  for (const image of images) {
    for (const model of models) {
      const durationSec = model.thrift?.durationSec ?? fail(`${model.id} has no thrift settings`);
      if (model.thrift!.resolution !== model.outputResolution) fail(`${model.id}: thrift resolution differs from the resolution the adapter sends`);
      const bad = validateRequest(model, { ratio: THRIFT_RATIO, durationSec, imageCount: 1 });
      if (bad) fail(`${model.id}: ${bad}`);
      jobs.push({ key: { image, model: model.id, round: roundOf(opts.set) }, model, durationSec, estimateUsd: Number(estimateUsd(model.usdPerSecond, durationSec)) });
    }
  }
  // One job per key: a duplicate would be submitted twice before the log could show the first.
  if (new Set(jobs.map((j) => keyId(j.key))).size !== jobs.length) throw new Error('the plan has duplicate job keys');
  return { jobs, prompt };
}

function fail(msg: string): never {
  throw new Error(msg);
}

const clipName = (k: JobKey): string => `clips/image${String(k.image).padStart(2, '0')}-${k.model}-${k.round}.mp4`;

/**
 * Only one run may spend at a time: the lock is created exclusively and removed when the stage ends, however it ends.
 * After a killed run the lock stays: the owner or conductor deletes out/run.lock once they have confirmed that no run.ts is alive.
 */
export async function runStage(deps: RunDeps, opts: StageOptions): Promise<StageResult> {
  mkdirSync(deps.outDir, { recursive: true });
  const lockPath = join(deps.outDir, 'run.lock');
  let fd: number;
  try {
    fd = openSync(lockPath, 'wx');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('another run.ts holds out/run.lock (delete the file only if that run is dead)');
    throw e;
  }
  try {
    writeSync(fd, `${JSON.stringify({ pid: process.pid, at: (deps.now ?? (() => new Date()))().toISOString() })}\n`);
    return await runLocked(deps, opts);
  } finally {
    closeSync(fd);
    rmSync(lockPath, { force: true });
  }
}

async function runLocked(deps: RunDeps, opts: StageOptions): Promise<StageResult> {
  const cap = deps.capUsd ?? CAP_USD;
  const margin = deps.marginUsd ?? MARGIN_USD;
  const now = deps.now ?? (() => new Date());
  const { jobs, prompt } = plan(deps, opts);
  const line = (p: Planned, l: Omit<JobLine, 'at' | 'image' | 'model' | 'round' | 'provider' | 'estimateUsd' | 'set'>): void =>
    appendLine(deps.outDir, { ...l, ...p.key, at: now().toISOString(), provider: p.model.provider, estimateUsd: p.estimateUsd, set: opts.set });
  const current = (p: Planned): JobLine | undefined => latest(readLines(deps.outDir)).get(keyId(p.key));
  let outcome: StageResult['outcome'] = 'complete';
  let reason: string | undefined;

  // A key stuck at `submitting` with no id may or may not have been accepted: it becomes `unknown`, its estimate stays counted.
  for (const p of jobs) if (current(p)?.status === 'submitting') line(p, { status: 'unknown', error: 'the run stopped before the provider answered' });

  // Keys that never reached a provider (or were refused for credit) may be submitted again; everything else is already in the log.
  const submittable = (s: JobStatus | undefined): boolean => s === undefined || s === 'not_funded' || s === 'not_attempted';
  const refusals = (p: Planned): number => readLines(deps.outDir).filter((l) => keyId(l) === keyId(p.key) && l.status === 'not_funded').length;
  let lastBalance: number | null = null;
  const toSubmit = jobs.filter((p) => submittable(current(p)?.status));
  if (toSubmit.length) {
    const falCost = toSubmit.filter((p) => p.model.provider === 'fal').reduce((a, p) => a + p.estimateUsd, 0);
    try {
      lastBalance = await deps.falBalance();
    } catch (e) {
      outcome = 'stuck: not funded';
      reason = `the fal balance could not be read: ${(e as Error).message}`;
    }
    if (lastBalance !== null && !(lastBalance >= falCost + margin)) {
      outcome = 'stuck: not funded';
      reason = `fal balance $${lastBalance} is not a number at or above the stage's fal cost $${falCost.toFixed(2)} plus $${margin.toFixed(2)}`;
    }
    if (lastBalance !== null && outcome === 'complete') {
      const baseline = readBaseline(deps.outDir) ?? writeBaseline(deps.outDir, lastBalance, now());
      for (const p of toSubmit) {
        let have: number;
        try {
          have = await deps.falBalance();
        } catch (e) {
          outcome = 'stuck: not funded';
          reason = `the fal balance could not be read: ${(e as Error).message}`;
          break;
        }
        lastBalance = have;
        const s = spend(readLines(deps.outDir));
        // The larger of the job log and the balance fall since preflight (fal) plus the Replicate log; a top-up only lowers the fall.
        // Written so that a NaN anywhere stops the stage instead of passing the check.
        const spent = Math.max(s.total, baseline - have + (s.byProvider.replicate ?? 0));
        if (!(spent + p.estimateUsd <= cap + 1e-9)) {
          outcome = 'stopped: cap';
          reason = `spent $${spent} plus $${p.estimateUsd.toFixed(2)} for ${keyId(p.key)} would pass the $${cap} cap, or the amounts are not numbers`;
          break;
        }
        const provider = deps.providers[p.model.provider] ?? fail(`no provider for ${p.model.provider}`);
        // The key may have changed since the plan was read; submit only a key nobody has submitted.
        if (!submittable(current(p)?.status)) continue;
        line(p, { status: 'submitting' });
        try {
          const { providerJobId } = await provider.submit({ model: p.model, prompt, imageUrls: [imageUrl(deps.inputs, p.key.image)], ratio: THRIFT_RATIO, durationSec: p.durationSec });
          line(p, { status: 'submitted', providerJobId });
        } catch (e) {
          const msg = (e as Error).message;
          const http = e instanceof ProviderHttpError ? e : null;
          // A 429 is a rate limit whatever its body says, so it is checked before the credit test.
          if (http?.status === 429) {
            line(p, { status: 'not_attempted', error: msg });
            outcome = 'stopped: rate limited';
            reason = `the provider answered 429 for ${keyId(p.key)}`;
            break;
          }
          if (isFundingRefusal(e)) {
            line(p, { status: 'not_funded', error: msg });
            // One more submit is allowed after a top-up; a second refusal ends the key as refused, which is still no render failure.
            if (refusals(p) >= 2) line(p, { status: 'refused', error: 'refused for credit twice' });
            outcome = 'stuck: not funded';
            reason = `the provider refused ${keyId(p.key)} for lack of credit`;
            break;
          }
          if (e instanceof ImageReadError) {
            line(p, { status: 'not_attempted', error: msg });
            outcome = 'stopped: image unreadable';
            reason = msg;
            break;
          }
          // A 401 or 403 that is not about credit says the key or account is wrong; nothing was run, so stop without a failure.
          if (http && (http.status === 401 || http.status === 403)) {
            line(p, { status: 'not_attempted', error: msg });
            outcome = 'stopped: auth';
            reason = `the provider answered ${http.status} for ${keyId(p.key)}`;
            break;
          }
          // Any other 4xx means the provider rejected this job. A 5xx or a network error may have created it, so the key is never
          // resubmitted and, because the provider is misbehaving, the stage stops.
          if (http && http.status < 500) {
            line(p, { status: 'failed', error: msg });
            continue;
          }
          line(p, { status: 'unknown', error: msg });
          outcome = 'stopped: provider error';
          reason = `submit of ${keyId(p.key)} ended without an answer: ${msg}`;
          break;
        }
      }
    }
  }

  // Poll every key that has a provider id and is not final; no retries.
  const pending = (): Planned[] => jobs.filter((p) => {
    const c = current(p);
    return !!c?.providerJobId && !FINAL.includes(c.status);
  });
  for (let i = 0; i < (deps.maxPolls ?? 360) && pending().length; i++) {
    if (i) await deps.sleep(deps.pollMs ?? 10_000);
    for (const p of pending()) {
      const providerJobId = current(p)!.providerJobId!;
      try {
        const st = await deps.providers[p.model.provider]!.status({ providerJobId, model: p.model });
        if (st.state === 'succeeded') {
          await deps.download(st.outputUrl, join(deps.outDir, clipName(p.key)));
          line(p, { status: 'succeeded', providerJobId, costUsd: st.costUsd, costSource: st.costSource, clip: clipName(p.key) });
        } else if (st.state === 'failed' || st.state === 'canceled') {
          line(p, { status: 'failed', providerJobId, costUsd: st.costUsd, costSource: st.costSource, error: st.error });
        }
      } catch {
        // A poll or download error leaves the job pending; the next round, or the next run, asks again.
      }
    }
  }
  for (const p of pending()) line(p, { status: 'timeout', providerJobId: current(p)!.providerJobId!, error: 'still unfinished when polling stopped' });

  const counts: Record<string, number> = {};
  for (const p of jobs) {
    const s = current(p)?.status;
    const k = submittable(s) ? 'notSubmitted' : s!;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const renderFailures = (counts.failed ?? 0) + (counts.unknown ?? 0) + (counts.timeout ?? 0);
  const total = spend(readLines(deps.outDir));
  return {
    set: opts.set, outcome, ...(reason ? { reason } : {}), counts, renderFailures, spentUsd: total.total, spentByProvider: total.byProvider, falBalanceUsd: lastBalance,
  };
}

/** The fal balance when the first paid stage began; later balance falls are measured from it. A baseline that is not a finite number stops the run. */
function readBaseline(outDir: string): number | null {
  let text: string;
  try {
    text = readFileSync(join(outDir, 'baseline.json'), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  const v = (JSON.parse(text) as { falBalanceUsd?: unknown }).falBalanceUsd;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('out/baseline.json has no finite falBalanceUsd; fix or delete it before spending anything');
  return v;
}

function writeBaseline(outDir: string, falBalanceUsd: number, at: Date): number {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'baseline.json'), `${JSON.stringify({ at: at.toISOString(), falBalanceUsd })}\n`);
  return falBalanceUsd;
}

/**
 * shortcut: the response shape of /v1/account/billing?expand=credits is not in the readable docs, so this assumes
 * { credits: { current_balance: <usd> } }; B.5a checks it against the live API and fixes the path if it differs.
 */
export function parseFalBalance(body: unknown): number {
  const v = (body as { credits?: { current_balance?: unknown } } | null)?.credits?.current_balance;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('the billing response has no credits.current_balance number');
  return v;
}

async function realDeps(root: string, inputsPath: string, ids: string[]): Promise<RunDeps> {
  const { inputs, dir } = loadInputs(inputsPath);
  const readImage = localReadImage(dir);
  const need = new Set(BAKEOFF_MODELS.filter((m) => ids.includes(m.id)).map((m) => m.provider));
  const key = (name: string): string => process.env[name] || fail(`${name} is not set`);
  const providers: RunDeps['providers'] = {};
  if (need.has('fal')) providers.fal = createFalProvider({ apiKey: key('FAL_KEY'), readImage });
  if (need.has('replicate')) providers.replicate = createReplicateProvider({ apiToken: key('REPLICATE_API_TOKEN'), readImage });
  return {
    outDir: join(root, 'out'),
    inputs,
    models: BAKEOFF_MODELS,
    providers,
    falBalance: async () => {
      const res = await fetch('https://api.fal.ai/v1/account/billing?expand=credits', { headers: { Authorization: `Key ${key('FAL_KEY')}` }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`fal billing: HTTP ${res.status}`);
      return parseFalBalance(await res.json());
    },
    download: async (url, dest) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`clip download: HTTP ${res.status}`);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { set: { type: 'string' }, models: { type: 'string' }, images: { type: 'string' }, preset: { type: 'string' }, root: { type: 'string' }, inputs: { type: 'string' } },
  });
  const root = values.root ?? defaultRoot();
  const ids = values.models ? values.models.split(',') : BAKEOFF_MODELS.map((m) => m.id);
  const deps = await realDeps(root, values.inputs ?? join(root, 'inputs', 'inputs.json'), ids);
  const result = await runStage(deps, {
    set: parseSet(values.set),
    models: ids,
    ...(values.images ? { images: values.images.split(',').map(Number) } : {}),
    ...(values.preset ? { presetId: values.preset } : {}),
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.outcome === 'complete' ? 0 : 3);
}
