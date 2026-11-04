// One-off round (owner-approved, 2026-11-04): spend the last Replicate credit on the Replicate twins of models CVS also serves on BytePlus and Vertex, so
// their scores can seed those twins before Replicate is removed. Generation only; a separate blind judge scores the outputs.
//   tsx scripts/bakeoff/replicate-round.ts video canary|all
//   tsx scripts/bakeoff/replicate-round.ts images canary|all
//   tsx scripts/bakeoff/replicate-round.ts blind --map <file outside cvs-bakeoff>
// REPLICATE_API_TOKEN comes from the environment. Everything lives in <root>/out/replicate-2026-11, one job log for video and images, so one cap covers both.
import { randomBytes } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelConfig } from '@cvs/core/models';
import { createReplicateProvider } from '@cvs/core/providers/replicate';
import { anonymise } from './anonymise.ts';
import { defaultRoot, ffmpeg, isMain } from './common.ts';
import { imageUrl, loadInputs, localReadImage } from './inputs.ts';
import { prepareBrief } from './judge.ts';
import { metricsForSet } from './metrics.ts';
import { blindImages, downloadTo, IMAGE_MODELS, runImages } from './replicate-images.ts';
import { runStage, type RunDeps } from './run.ts';

/** The whole Replicate prepaid credit (owner, 2026-11-04); auto-reload is off on the account, so a job past it is refused, not charged. */
export const CAP_USD = 20.75;
/** Under $5 of credit Replicate allows 6 creates a minute with a burst of 1. */
const SUBMIT_GAP_MS = 11_000;
export const SET = 'replicate-2026-11' as const;
/** The worker keeps every inlined input at or under this (apps/worker/src/real-providers.ts); Replicate reset a 3.8 MB body in the first bake-off. */
const MAX_INLINE_BYTES = 600_000;

const REPLICATE_PAGE = (endpoint: string): { url: string; readAt: string } => ({ url: `https://replicate.com/${endpoint}`, readAt: '2026-11-04' });
const video = (m: Pick<ModelConfig, 'id' | 'endpoint' | 'label' | 'maxImages' | 'usdPerSecond'> & { durationSec: number }): ModelConfig => ({
  ...m,
  provider: 'replicate',
  ratios: ['9:16'],
  durationsSec: [m.durationSec],
  outputResolution: '720p',
  billedAmountField: null,
  thrift: { durationSec: m.durationSec, resolution: '720p' },
  sources: { usdPerSecond: REPLICATE_PAGE(m.endpoint) },
});

/** The CVS rows, with the prices of migrations 0033 and 0040 and the seedance-2.5 row of models.ts, each re-read on replicate.com on 2026-11-04 (no audio). */
export const VIDEO_MODELS: ModelConfig[] = [
  video({ id: 'seedance-2.0-replicate', endpoint: 'bytedance/seedance-2.0', label: 'Seedance 2.0', maxImages: 9, usdPerSecond: 0.18, durationSec: 5 }),
  video({ id: 'veo-3.1-replicate', endpoint: 'google/veo-3.1', label: 'Google VEO 3.1 (Replicate)', maxImages: 1, usdPerSecond: 0.2, durationSec: 8 }),
  video({ id: 'seedance-2.5', endpoint: 'bytedance/seedance-2.5', label: 'Seedance 2.5', maxImages: 4, usdPerSecond: 0.2312, durationSec: 5 }),
];

// Image numbers of inputs.json: 1 3 5 long-sleeve and hoodie mockups (apparel), 2 glass, 4 dreamcatcher, 6 woven throw (blanket), 8 10 ornaments. Counts follow
// the cap: 10 + 4 + 3 clips cost $9.00 + $6.40 + $3.47, which leaves about $1.9 for the images.
export const VIDEO_JOBS: { image: number; model: string }[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((image) => ({ image, model: 'seedance-2.0-replicate' })),
  ...[1, 2, 6, 8].map((image) => ({ image, model: 'veo-3.1-replicate' })),
  ...[3, 6, 10].map((image) => ({ image, model: 'seedance-2.5' })),
];
export const IMAGE_PICKS = [1, 2, 3, 4, 5, 6, 8, 10];

/** The first job of each model, so one clip of each is checked (clip length, cost, silence) before the rest is paid for. */
export const canary = <T>(jobs: T[], modelOf: (j: T) => string): T[] => jobs.filter((j, i) => jobs.findIndex((k) => modelOf(k) === modelOf(j)) === i);

const fail = (msg: string): never => {
  throw new Error(msg);
};

if (isMain(import.meta.url)) {
  const [cmd, stage] = process.argv.slice(2);
  const root = defaultRoot();
  const outDir = join(root, 'out', SET);
  const apiToken = process.env.REPLICATE_API_TOKEN ?? fail('REPLICATE_API_TOKEN is not set');
  const { inputs, dir } = loadInputs(join(root, 'inputs', 'inputs.json'));
  const raw = localReadImage(dir);
  const readImage: typeof raw = async (url) => {
    const r = await raw(url);
    if (r.bytes.byteLength <= MAX_INLINE_BYTES) return r;
    const small = join(tmpdir(), `cvs-replicate-${randomBytes(4).toString('hex')}.jpg`);
    // shortcut: the worker's fitForInline (sharp) does this in production; scripts cannot import the worker's types. The inputs have no alpha channel.
    await ffmpeg(['-y', '-v', 'error', '-i', join(dir, url.slice('input:'.length)), '-vf', 'scale=1536:1536:force_original_aspect_ratio=decrease', '-q:v', '3', small]);
    try {
      return { bytes: readFileSync(small), contentType: 'image/jpeg' };
    } finally {
      rmSync(small, { force: true });
    }
  };
  if (cmd === 'video' && (stage === 'canary' || stage === 'all')) {
    const deps: RunDeps = {
      outDir,
      inputs,
      models: VIDEO_MODELS,
      providers: { replicate: createReplicateProvider({ apiToken, readImage }) },
      falBalance: async () => fail('no fal job in this round'),
      download: downloadTo,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      capUsd: CAP_USD,
      submitGapMs: SUBMIT_GAP_MS,
    };
    const result = await runStage(deps, { set: SET, jobs: stage === 'canary' ? canary(VIDEO_JOBS, (j) => j.model) : VIDEO_JOBS });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.outcome === 'complete' ? 0 : 3);
  } else if (cmd === 'images' && (stage === 'canary' || stage === 'all')) {
    const jobs = IMAGE_MODELS.flatMap((model) => IMAGE_PICKS.map((image) => ({ model, image })));
    const result = await runImages(
      { outDir, fetch, apiToken, readImage, imageUrl: (n) => imageUrl(inputs, n), download: downloadTo, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), capUsd: CAP_USD, submitGapMs: SUBMIT_GAP_MS },
      stage === 'canary' ? canary(jobs, (j) => j.model.id) : jobs,
    );
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.outcome === 'complete' ? 0 : 3);
  } else if (cmd === 'blind') {
    const mapPath = process.argv[process.argv.indexOf('--map') + 1] ?? fail('--map is required');
    // Each blind clip keeps its own model's length: cutting Veo's 8 s to 5 s would hide the end of the clip from the judge.
    const secs = (id: string): number => VIDEO_MODELS.find((m) => m.id === id)!.thrift!.durationSec;
    const map = await anonymise({ root, set: SET, mapPath, inputs, inputsDir: dir, outDir, durationSec: secs });
    await metricsForSet(root, SET);
    console.log(`${Object.keys(map.clips).length} clips; brief ${prepareBrief(root, SET)}`);
    const images = await blindImages({
      root, outDir, mapPath: mapPath.replace(/\.json$/, '-images.json'), inputsDir: dir, sourceFile: (n) => inputs.images[n - 1]!.file,
      rubricPath: join(dirname(fileURLToPath(import.meta.url)), 'rubric-image.md'),
    });
    console.log(`${Object.keys(images).length} images`);
  } else {
    console.log('usage: replicate-round.ts video|images canary|all   |   blind --map <file outside the cvs-bakeoff folder>');
    process.exit(2);
  }
}
