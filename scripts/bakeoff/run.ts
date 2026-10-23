// Bake-off runner (plan B.4): 2 models x 10 images at 9:16, the thrift duration and resolution, the safe preset.
//   tsx scripts/bakeoff/run.ts --set canary|half-1|half-2|extra [--models id,id] [--images 1,2,3] [--preset id] [--root dir] [--inputs file]
// FAL_KEY and REPLICATE_API_TOKEN come from the environment. Sets: canary = image 1; half-1 = images 1-5 (image 1 is polled, not
// resubmitted); half-2 = images 6-10 (pass --models with the models still able to pass); extra = at most 5 images of one model with a
// preset other than the safe one, round "extra". The logic is in runStage so tests drive it on the mock adapter, never a real provider.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { BAKEOFF_MODELS, estimateUsd, validateRequest, type ModelConfig } from '@cvs/core/models';
import { BAKEOFF_PRESET, PRESETS } from '@cvs/core/presets';
import { isFundingRefusal, ProviderHttpError } from '@cvs/core/providers/http';
import { createFalProvider } from '@cvs/core/providers/fal';
import { createReplicateProvider } from '@cvs/core/providers/replicate';
import type { VideoProvider } from '@cvs/core/providers';
import { defaultRoot, isMain } from './common.ts';
import { imageUrl, loadInputs, localReadImage, type Inputs } from './inputs.ts';
import {
  appendLine, defaultImages, keyId, latest, parseSet, readLines, roundOf, spend, type JobKey, type JobLine, type JobStatus, type SetName,
} from './jobs.ts';

export const CAP_USD = 40;
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
  outcome: 'complete' | 'stuck: not funded' | 'stopped: cap';
  reason?: string;
  counts: Record<string, number>;
  /** failed + unknown + timeout: jobs that ended without a clip. A refusal for credit is not one. */
  renderFailures: number;
  spentUsd: number;
}

const FINAL: JobStatus[] = ['succeeded', 'failed', 'unknown'];
const THRIFT_RATIO = '9:16';

interface Planned {
  key: JobKey;
  model: ModelConfig;
  durationSec: number;
  estimateUsd: number;
}

function plan(deps: RunDeps, opts: StageOptions): { jobs: Planned[]; prompt: string } {
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
  return { jobs, prompt };
}

function fail(msg: string): never {
  throw new Error(msg);
}

const clipName = (k: JobKey): string => `clips/image${String(k.image).padStart(2, '0')}-${k.model}-${k.round}.mp4`;

export async function runStage(deps: RunDeps, opts: StageOptions): Promise<StageResult> {
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

  const toSubmit = jobs.filter((p) => {
    const s = current(p)?.status;
    return s === undefined || s === 'not_funded';
  });
  if (toSubmit.length) {
    const falCost = toSubmit.filter((p) => p.model.provider === 'fal').reduce((a, p) => a + p.estimateUsd, 0);
    let balance: number | null = null;
    try {
      balance = await deps.falBalance();
    } catch (e) {
      outcome = 'stuck: not funded';
      reason = `the fal balance could not be read: ${(e as Error).message}`;
    }
    if (balance !== null && balance < falCost + margin) {
      outcome = 'stuck: not funded';
      reason = `fal balance $${balance.toFixed(2)} is below the stage's fal cost $${falCost.toFixed(2)} plus $${margin.toFixed(2)}`;
    }
    if (balance !== null && outcome === 'complete') {
      const baseline = readBaseline(deps.outDir) ?? writeBaseline(deps.outDir, balance, now());
      for (const p of toSubmit) {
        const have = await deps.falBalance();
        const s = spend(readLines(deps.outDir));
        // The larger of the job log and the balance fall since preflight (fal) plus the Replicate log; a top-up only lowers the fall.
        const spent = Math.max(s.total, baseline - have + (s.byProvider.replicate ?? 0));
        if (spent + p.estimateUsd > cap + 1e-9) {
          outcome = 'stopped: cap';
          reason = `spent $${spent.toFixed(2)} plus $${p.estimateUsd.toFixed(2)} for ${keyId(p.key)} would pass the $${cap} cap`;
          break;
        }
        const provider = deps.providers[p.model.provider] ?? fail(`no provider for ${p.model.provider}`);
        line(p, { status: 'submitting' });
        try {
          const { providerJobId } = await provider.submit({ model: p.model, prompt, imageUrls: [imageUrl(deps.inputs, p.key.image)], ratio: THRIFT_RATIO, durationSec: p.durationSec });
          line(p, { status: 'submitted', providerJobId });
        } catch (e) {
          if (isFundingRefusal(e)) {
            line(p, { status: 'not_funded', error: (e as Error).message });
            outcome = 'stuck: not funded';
            reason = `the provider refused ${keyId(p.key)} for lack of credit`;
            break;
          }
          // A 4xx answer means the provider rejected the job. Anything else may have created it, so the key is never resubmitted.
          const rejected = e instanceof ProviderHttpError && e.status < 500;
          line(p, { status: rejected ? 'failed' : 'unknown', error: (e as Error).message });
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
    const k = s === undefined || s === 'not_funded' ? 'notSubmitted' : s;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const renderFailures = (counts.failed ?? 0) + (counts.unknown ?? 0) + (counts.timeout ?? 0);
  return { set: opts.set, outcome, ...(reason ? { reason } : {}), counts, renderFailures, spentUsd: spend(readLines(deps.outDir)).total };
}

/** The fal balance when the first paid stage began; later balance falls are measured from it. */
function readBaseline(outDir: string): number | null {
  try {
    return (JSON.parse(readFileSync(join(outDir, 'baseline.json'), 'utf8')) as { falBalanceUsd: number }).falBalanceUsd;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
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
