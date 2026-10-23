// Every test runs on the mock adapter or a fake fetch: no real provider is called and no provider key is read (plan, Credit thrift).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BAKEOFF_MODELS } from '@cvs/core/models';
import { BAKEOFF_PRESET, PRESETS } from '@cvs/core/presets';
import { createFalProvider } from '@cvs/core/providers/fal';
import { ProviderHttpError } from '@cvs/core/providers/http';
import { createMockVideoProvider } from '@cvs/core/providers/mock';
import type { SubmitRequest, VideoProvider } from '@cvs/core/providers';
import { describe, expect, test } from 'vitest';
import { imageUrl, loadInputs, localReadImage, parseInputs, type Inputs } from './inputs.ts';
import { appendLine, JOBS_FILE, readLines, spend, type JobLine } from './jobs.ts';
import { parseFalBalance, runStage, type RunDeps, type StageOptions } from './run.ts';

const KLING = BAKEOFF_MODELS[0]!;
const SEEDANCE = BAKEOFF_MODELS[1]!;
const tmp = (): string => mkdtempSync(join(tmpdir(), 'cvs-bakeoff-test-'));

const sampleInputs = (): Inputs => ({
  images: Array.from({ length: 10 }, (_, i) => ({ file: `img${i + 1}.jpg`, category: (i % 2 ? 'product' : 'mockup') as 'product' | 'mockup', sourceKey: `key${i + 1}` })),
});

interface Rig {
  deps: RunDeps;
  outDir: string;
  /** "model:image" for every submit call. */
  submits: string[];
  prompts: string[];
  balance: { usd: number };
}

/** A rig of two mock providers (one per real provider name) that records every submit. */
function rig(over: { fal?: (inner: VideoProvider) => VideoProvider; replicate?: (inner: VideoProvider) => VideoProvider } & Partial<RunDeps> = {}): Rig {
  const outDir = join(tmp(), 'out');
  const submits: string[] = [];
  const prompts: string[] = [];
  const record = (inner: VideoProvider): VideoProvider => ({
    ...inner,
    submit: async (req: SubmitRequest) => {
      submits.push(`${req.model.id}:${req.imageUrls[0]}`);
      prompts.push(req.prompt);
      return inner.submit(req);
    },
  });
  const balance = { usd: 100 };
  let t = 0;
  const { fal, replicate, ...deps } = over;
  const falP = record(createMockVideoProvider());
  const repP = record(createMockVideoProvider());
  return {
    outDir,
    submits,
    prompts,
    balance,
    deps: {
      outDir,
      inputs: sampleInputs(),
      models: BAKEOFF_MODELS,
      providers: { fal: fal ? fal(falP) : falP, replicate: replicate ? replicate(repP) : repP },
      falBalance: async () => balance.usd,
      download: async (_url, dest) => {
        mkdirSync(join(dest, '..'), { recursive: true });
        writeFileSync(dest, 'clip');
      },
      sleep: async () => {},
      now: () => new Date(Date.UTC(2026, 9, 23, 0, 0, 0, t++)),
      ...deps,
    },
  };
}

const line = (over: Partial<JobLine>): JobLine => ({
  at: '2026-10-22T00:00:00.000Z', provider: 'fal', status: 'succeeded', image: 1, model: KLING.id, round: 'bakeoff', estimateUsd: 0.56, ...over,
});

const canary: StageOptions = { set: 'canary' };
const KLING_5S = 0.56;
const SEEDANCE_5S = 1.156;

describe('runStage', () => {
  test('canary submits image 1 for both models at 9:16 with the safe preset, polls and downloads', async () => {
    const r = rig();
    const res = await runStage(r.deps, canary);
    expect(res.outcome).toBe('complete');
    expect(res.counts).toEqual({ succeeded: 2 });
    expect(res.spentUsd).toBeCloseTo(KLING_5S + SEEDANCE_5S, 6);
    expect(r.submits).toEqual([`${KLING.id}:input:img1.jpg`, `${SEEDANCE.id}:input:img1.jpg`]);
    expect(new Set(r.prompts)).toEqual(new Set([BAKEOFF_PRESET.prompt]));
    const lines = readLines(r.outDir);
    expect(lines.filter((l) => l.status === 'succeeded').every((l) => l.round === 'bakeoff' && existsSync(join(r.outDir, l.clip!)))).toBe(true);
    expect(lines.map((l) => l.status)).toEqual(['submitting', 'submitted', 'submitting', 'submitted', 'succeeded', 'succeeded']);
  });

  test('the guard stops at the cap and never submits a job that would pass it', async () => {
    const r = rig({ capUsd: 3 });
    const res = await runStage(r.deps, { set: 'half-1' });
    // image 1 (0.56 + 1.156) and image 2 Kling (0.56) fit: 2.276; image 2 Seedance would make 3.432.
    expect(res.outcome).toBe('stopped: cap');
    expect(r.submits).toHaveLength(3);
    expect(res.spentUsd).toBeLessThanOrEqual(3);
    expect(res.counts.notSubmitted).toBe(7);
  });

  test('a failed job is a render failure and is not retried, even across reruns', async () => {
    const failing = (inner: VideoProvider): VideoProvider => ({
      ...inner,
      status: async () => ({ state: 'failed', error: 'boom', costUsd: KLING_5S, costSource: 'estimate' }),
    });
    const r = rig({ fal: failing });
    const first = await runStage(r.deps, canary);
    expect(first.counts).toEqual({ failed: 1, succeeded: 1 });
    expect(first.renderFailures).toBe(1);
    const second = await runStage(r.deps, canary);
    expect(second.counts).toEqual({ failed: 1, succeeded: 1 });
    expect(r.submits).toHaveLength(2);
  });

  test('a job still unfinished when polling stops becomes timeout, counts its estimate and is not resubmitted', async () => {
    const stuck = (inner: VideoProvider): VideoProvider => ({ ...inner, status: async () => ({ state: 'running' }) });
    const r = rig({ fal: stuck, maxPolls: 3 });
    const res = await runStage(r.deps, canary);
    expect(res.counts).toEqual({ timeout: 1, succeeded: 1 });
    expect(res.renderFailures).toBe(1);
    await runStage(r.deps, canary);
    expect(r.submits).toHaveLength(2);
  });

  test('the guard counts earlier rounds in any out/*.jsonl file', async () => {
    const r = rig();
    // 39.00 spent by an earlier smoke round in another file: Kling (0.56) fits, Seedance (1.156) would pass $40.
    mkdirSync(r.outDir, { recursive: true });
    writeFileSync(join(r.outDir, 'smoke.jsonl'), `${JSON.stringify(line({ image: 1, round: 'smoke', estimateUsd: 39 }))}\n`);
    appendLine(r.outDir, line({ image: 2, round: 'extra', status: 'failed', estimateUsd: 0, costUsd: 0 }));
    const res = await runStage(r.deps, canary);
    expect(res.outcome).toBe('stopped: cap');
    expect(r.submits).toEqual([`${KLING.id}:input:img1.jpg`]);
    expect(res.spentUsd).toBeCloseTo(39 + KLING_5S, 6);
  });

  test('the guard takes the larger of the log and the fal balance fall since the baseline', async () => {
    const r = rig();
    mkdirSync(r.outDir, { recursive: true });
    writeFileSync(join(r.outDir, 'baseline.json'), JSON.stringify({ at: '2026-10-23T00:00:00.000Z', falBalanceUsd: 100 }));
    r.balance.usd = 61; // 39 spent according to fal, nothing in the log
    const res = await runStage(r.deps, canary);
    expect(res.outcome).toBe('stopped: cap');
    expect(r.submits).toEqual([`${KLING.id}:input:img1.jpg`]);
  });

  test('the first paid stage records the fal balance as the baseline', async () => {
    const r = rig();
    await runStage(r.deps, canary);
    expect(JSON.parse(readFileSync(join(r.outDir, 'baseline.json'), 'utf8')).falBalanceUsd).toBe(100);
  });

  test('a stage below the fal estimate plus $2 submits nothing and waits as not funded', async () => {
    const r = rig();
    r.balance.usd = 2.5; // the Kling canary needs 0.56 + 2 = 2.56
    const res = await runStage(r.deps, canary);
    expect(res.outcome).toBe('stuck: not funded');
    expect(r.submits).toEqual([]);
    expect(res.renderFailures).toBe(0);
    expect(existsSync(join(r.outDir, JOBS_FILE))).toBe(false);
    r.balance.usd = 3;
    expect((await runStage(r.deps, canary)).outcome).toBe('complete');
  });

  test('an unreadable fal balance stops the stage as not funded', async () => {
    const r = rig({ falBalance: async () => { throw new Error('billing down'); } });
    const res = await runStage(r.deps, canary);
    expect(res.outcome).toBe('stuck: not funded');
    expect(r.submits).toEqual([]);
  });

  test('a credit refusal stops the stage as not funded, is no render failure, and the keys are submitted once after top-up', async () => {
    let calls = 0;
    const refuse = (inner: VideoProvider): VideoProvider => ({
      ...inner,
      submit: async (req) => {
        // The wrapper below records the attempt; the second Kling attempt (image 2) is refused.
        if (++calls === 2) throw new ProviderHttpError(403, '{"detail":"User is locked. Reason: Exhausted balance."}', 'fal submit: HTTP 403');
        return inner.submit(req);
      },
    });
    const r = rig({ fal: refuse });
    const first = await runStage(r.deps, { set: 'half-1' });
    expect(first.outcome).toBe('stuck: not funded');
    expect(first.renderFailures).toBe(0);
    // Kling image 1 and Seedance image 1 went out; the Kling image 2 call was refused and nothing was attempted after it.
    expect(r.submits).toEqual([`${KLING.id}:input:img1.jpg`, `${SEEDANCE.id}:input:img1.jpg`]);
    expect(first.counts).toEqual({ succeeded: 2, notSubmitted: 8 });
    expect(readLines(r.outDir).filter((l) => l.status === 'not_funded')).toHaveLength(1);
    // A refused key costs nothing.
    expect(spend(readLines(r.outDir)).total).toBeCloseTo(KLING_5S + SEEDANCE_5S, 6);

    const second = await runStage(r.deps, { set: 'half-1' });
    expect(second.outcome).toBe('complete');
    expect(second.counts).toEqual({ succeeded: 10 });
    // Across both runs every one of the 10 keys was submitted exactly once: the refused key after the top-up, the first two never again.
    expect(r.submits).toHaveLength(10);
    expect(new Set(r.submits).size).toBe(10);
  });

  test('a rerun after a kill never resubmits a key at submitting or a key with a provider id', async () => {
    const r = rig();
    // Killed between the submitting line and the provider answer: Kling image 1.
    appendLine(r.outDir, line({ status: 'submitting' }));
    // Killed after the provider answered: Seedance image 1 has an id the mock knows.
    const { providerJobId } = await r.deps.providers.replicate!.submit({ model: SEEDANCE, prompt: 'p', imageUrls: ['input:img1.jpg'], ratio: '9:16', durationSec: 5 });
    r.submits.length = 0;
    appendLine(r.outDir, line({ provider: 'replicate', model: SEEDANCE.id, status: 'submitted', estimateUsd: SEEDANCE_5S, providerJobId }));

    const res = await runStage(r.deps, canary);
    expect(r.submits).toEqual([]);
    expect(res.counts).toEqual({ unknown: 1, succeeded: 1 });
    expect(res.renderFailures).toBe(1);
    // The unknown key still counts its estimate.
    expect(res.spentUsd).toBeCloseTo(KLING_5S + SEEDANCE_5S, 6);
    // And a further rerun changes nothing.
    await runStage(r.deps, canary);
    expect(r.submits).toEqual([]);
  });

  test('half-1 polls the canary keys (round bakeoff) instead of resubmitting them', async () => {
    const r = rig();
    await runStage(r.deps, canary);
    r.submits.length = 0;
    const res = await runStage(r.deps, { set: 'half-1' });
    expect(res.counts).toEqual({ succeeded: 10 });
    expect(r.submits).toHaveLength(8);
    expect(r.submits.some((s) => s.endsWith('img1.jpg'))).toBe(false);
  });

  test('half-2 runs only the models passed, on images 6 to 10', async () => {
    const r = rig();
    const res = await runStage(r.deps, { set: 'half-2', models: [SEEDANCE.id] });
    expect(res.counts).toEqual({ succeeded: 5 });
    expect(r.submits.map((s) => s.split(':')[0])).toEqual(Array(5).fill(SEEDANCE.id));
    expect(r.submits.map((s) => s.split(':')[2])).toEqual(['img6.jpg', 'img7.jpg', 'img8.jpg', 'img9.jpg', 'img10.jpg']);
  });

  test('the extra set needs one model, at most 5 images and a preset other than the safe one, and uses round extra', async () => {
    const other = PRESETS.find((p) => !p.isBakeoffSafe)!;
    const r = rig();
    await expect(runStage(r.deps, { set: 'extra', models: [KLING.id], images: [1, 2], presetId: BAKEOFF_PRESET.id })).rejects.toThrow(/other than the safe one/);
    await expect(runStage(r.deps, { set: 'extra', models: [KLING.id], images: [1, 2, 3, 4, 5, 6], presetId: other.id })).rejects.toThrow(/1 to 5/);
    await expect(runStage(r.deps, { set: 'extra', images: [1], presetId: other.id })).rejects.toThrow(/one model/);
    expect(r.submits).toEqual([]);
    const res = await runStage(r.deps, { set: 'extra', models: [KLING.id], images: [2, 4], presetId: other.id });
    expect(res.counts).toEqual({ succeeded: 2 });
    expect(new Set(r.prompts)).toEqual(new Set([other.prompt]));
    expect(readLines(r.outDir).every((l) => l.round === 'extra')).toBe(true);
  });

  test('a corrupt log line stops the run before any spend', async () => {
    const r = rig();
    mkdirSync(r.outDir, { recursive: true });
    writeFileSync(join(r.outDir, JOBS_FILE), '{"image":1\n');
    await expect(runStage(r.deps, canary)).rejects.toThrow(/not valid JSON/);
    expect(r.submits).toEqual([]);
  });
});

describe('parseFalBalance', () => {
  test('reads credits.current_balance and rejects anything else', () => {
    expect(parseFalBalance({ credits: { current_balance: 12.5 } })).toBe(12.5);
    expect(() => parseFalBalance({})).toThrow(/current_balance/);
    expect(() => parseFalBalance({ credits: { current_balance: '12' } })).toThrow(/current_balance/);
  });
});

describe('inputs.json', () => {
  const good = () => JSON.parse(JSON.stringify(sampleInputs())) as { images: { file: string; category: string; sourceKey: string; smallText?: unknown }[] };

  test('accepts 10 images, 5 and 5, each half of 5 mixing both categories', () => {
    expect(parseInputs(good()).images).toHaveLength(10);
    const withText = good();
    withText.images[0]!.smallText = true;
    expect(parseInputs(withText).images[0]!.smallText).toBe(true);
  });

  test.each([
    ['not an object', null, /"images" must be an array/],
    ['9 images', (() => { const v = good(); v.images.pop(); return v; })(), /9 images/],
    ['6 mockups', (() => { const v = good(); v.images[1]!.category = 'mockup'; return v; })(), /6 mockups/],
    ['a half that does not mix', (() => { const v = good(); v.images.forEach((im, i) => (im.category = i < 5 ? 'mockup' : 'product')); return v; })(), /first half/],
    ['a parent path', (() => { const v = good(); v.images[0]!.file = '../x.jpg'; return v; })(), /inside the inputs folder/],
    ['an absolute path', (() => { const v = good(); v.images[0]!.file = 'C:\\x.jpg'; return v; })(), /inside the inputs folder/],
    ['a duplicate file', (() => { const v = good(); v.images[1]!.file = 'img1.jpg'; return v; })(), /repeats img1.jpg/],
    ['a bad extension', (() => { const v = good(); v.images[0]!.file = 'img1.gif'; return v; })(), /\.jpg, \.png or \.webp/],
    ['a bad category', (() => { const v = good(); v.images[0]!.category = 'poster'; return v; })(), /category/],
    ['an empty source key', (() => { const v = good(); v.images[0]!.sourceKey = ''; return v; })(), /sourceKey/],
    ['a non-boolean smallText', (() => { const v = good(); v.images[0]!.smallText = 'yes'; return v; })(), /smallText/],
  ])('rejects %s', (_name, value, message) => {
    expect(() => parseInputs(value)).toThrow(message);
  });

  test('loadInputs checks the files exist; readImage serves them to the adapter as a data URL', async () => {
    const dir = tmp();
    const path = join(dir, 'inputs.json');
    writeFileSync(path, JSON.stringify(sampleInputs()));
    expect(() => loadInputs(path)).toThrow(/img1.jpg is missing/);
    for (const im of sampleInputs().images) writeFileSync(join(dir, im.file), 'jpegbytes');
    const { inputs, dir: found } = loadInputs(path);
    expect(found).toBe(dir);

    const bodies: { image_urls: string[] }[] = [];
    const fal = createFalProvider({
      apiKey: 'test-key',
      readImage: localReadImage(dir),
      fetch: (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ request_id: 'r1' }));
      }) as unknown as typeof fetch,
    });
    await fal.submit({ model: KLING, prompt: 'p', imageUrls: [imageUrl(inputs, 1)], ratio: '9:16', durationSec: 5 });
    expect(bodies[0]!.image_urls[0]).toBe(`data:image/jpeg;base64,${Buffer.from('jpegbytes').toString('base64')}`);
  });
});
