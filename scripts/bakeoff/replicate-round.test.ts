// Every test runs on the mock adapter or a fake fetch: no real provider is called and no provider key is read.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockVideoProvider } from '@cvs/core/providers/mock';
import type { SubmitRequest } from '@cvs/core/providers';
import { describe, expect, test } from 'vitest';
import type { Inputs } from './inputs.ts';
import { readLines, spend } from './jobs.ts';
import { blindImages, IMAGE_MODELS, IMAGE_ROUND, runImages, type ImageDeps } from './replicate-images.ts';
import { canary, CAP_B_USD, CAP_USD, IMAGE_MODELS_B, IMAGE_PICKS, IMAGE_PICKS_B, SET, SET_B, VIDEO_JOBS, VIDEO_JOBS_B, VIDEO_MODELS, VIDEO_MODELS_B } from './replicate-round.ts';
import { runStage, type RunDeps } from './run.ts';

const tmp = (): string => mkdtempSync(join(tmpdir(), 'cvs-replicate-round-test-'));
const inputs: Inputs = { images: Array.from({ length: 10 }, (_, i) => ({ file: `img${i + 1}.jpg`, category: (i % 2 ? 'product' : 'mockup') as 'product' | 'mockup', sourceKey: `k${i}` })) };

describe('the planned round', () => {
  const imageJobs = IMAGE_MODELS.flatMap((m) => IMAGE_PICKS.map(() => m.usdPerImage));
  const videoUsd = VIDEO_JOBS.reduce((a, j) => a + VIDEO_MODELS.find((m) => m.id === j.model)!.usdPerSecond * VIDEO_MODELS.find((m) => m.id === j.model)!.thrift!.durationSec, 0);

  test('the full plan, every job at its estimate, stays under the cap', () => {
    expect(videoUsd + imageJobs.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(CAP_USD);
  });
  test('the canary is the first job of each model', () => {
    expect(canary(VIDEO_JOBS, (j) => j.model)).toEqual([
      { image: 1, model: 'seedance-2.0-replicate' },
      { image: 1, model: 'veo-3.1-replicate' },
      { image: 3, model: 'seedance-2.5' },
    ]);
  });
});

describe('the second round (replicate-2026-11b)', () => {
  test('three 4 s Veo clips and six restyled images stay under the $3.10 cap at their estimates', () => {
    const veo = VIDEO_MODELS_B[0]!;
    const usd = VIDEO_JOBS_B.length * veo.usdPerSecond * veo.thrift!.durationSec + IMAGE_MODELS_B.reduce((a, m) => a + IMAGE_PICKS_B.length * m.usdPerImage, 0);
    expect(veo.thrift!.durationSec).toBe(4);
    expect(IMAGE_MODELS_B.map((m) => m.id).sort()).toEqual(['nano-banana-2-replicate', 'nano-banana-2.1-replicate', 'seedream-5-pro-replicate']);
    expect(usd).toBeCloseTo(2.4 + 2 * (0.0336 + 0.067 + 0.045), 6);
    expect(usd).toBeLessThanOrEqual(CAP_B_USD);
  });
  test('submits Veo at 4 s into its own set and refuses a job past its cap', async () => {
    const outDir = join(tmp(), 'out');
    const durations: number[] = [];
    const inner = createMockVideoProvider();
    const deps: RunDeps = {
      outDir,
      inputs,
      models: VIDEO_MODELS_B,
      providers: { replicate: { ...inner, submit: async (req) => (durations.push(req.durationSec), inner.submit(req)) } },
      falBalance: async () => {
        throw new Error('the fal balance must not be read');
      },
      download: async (_url, dest) => {
        mkdirSync(join(dest, '..'), { recursive: true });
        writeFileSync(dest, 'clip');
      },
      sleep: async () => {},
      capUsd: 1.7,
    };
    const res = await runStage(deps, { set: SET_B, jobs: VIDEO_JOBS_B });
    expect(durations).toEqual([4, 4]);
    expect(res.outcome).toBe('stopped: cap');
    expect(readLines(outDir).every((l) => l.round === SET_B && l.set === SET_B)).toBe(true);
  });
  test('image jobs of the second round are logged under their own image round', async () => {
    const outDir = join(tmp(), 'out');
    const fetchFake = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> =>
      init?.method === 'POST' ? Response.json({ id: 'p1' }) : Response.json({ status: 'succeeded', output: ['https://replicate.delivery/x.png'] });
    const res = await runImages(
      {
        outDir, fetch: fetchFake as typeof fetch, apiToken: 'test-token', set: SET_B, capUsd: CAP_B_USD,
        readImage: async () => ({ bytes: new Uint8Array([1]), contentType: 'image/jpeg' }),
        imageUrl: (i) => `input:img${i}.jpg`,
        download: async (_url, dest) => {
          mkdirSync(join(dest, '..'), { recursive: true });
          writeFileSync(dest, 'png');
        },
        sleep: async () => {},
      },
      [{ model: IMAGE_MODELS_B[0]!, image: IMAGE_PICKS_B[0]! }],
    );
    expect(res.outcome).toBe('complete');
    expect(readLines(outDir).every((l) => l.round === 'replicate-2026-11b-images' && l.set === SET_B)).toBe(true);
  });
});

describe('runStage on the replicate set', () => {
  const rig = (over: Partial<RunDeps> = {}): { deps: RunDeps; outDir: string; submits: SubmitRequest[] } => {
    const outDir = join(tmp(), 'out');
    const submits: SubmitRequest[] = [];
    const inner = createMockVideoProvider();
    return {
      outDir,
      submits,
      deps: {
        outDir,
        inputs,
        models: VIDEO_MODELS,
        providers: { replicate: { ...inner, submit: async (req) => (submits.push(req), inner.submit(req)) } },
        falBalance: async () => {
          throw new Error('the fal balance must not be read');
        },
        download: async (_url, dest) => {
          mkdirSync(join(dest, '..'), { recursive: true });
          writeFileSync(dest, 'clip');
        },
        sleep: async () => {},
        capUsd: CAP_USD,
        ...over,
      },
    };
  };

  test('submits each job at its own model duration without reading the fal balance', async () => {
    const r = rig();
    const res = await runStage(r.deps, { set: SET, jobs: canary(VIDEO_JOBS, (j) => j.model) });
    expect(res.outcome).toBe('complete');
    expect(res.counts).toEqual({ succeeded: 3 });
    expect(r.submits.map((s) => [s.model.id, s.durationSec, s.ratio])).toEqual([
      ['seedance-2.0-replicate', 5, '9:16'],
      ['veo-3.1-replicate', 8, '9:16'],
      ['seedance-2.5', 5, '9:16'],
    ]);
    expect(res.spentUsd).toBeCloseTo(0.9 + 1.6 + 1.156, 6);
    expect(readLines(r.outDir).every((l) => l.round === SET && l.provider === 'replicate')).toBe(true);
  });

  test('the second stage polls the canary jobs and submits only the rest', async () => {
    const r = rig();
    await runStage(r.deps, { set: SET, jobs: canary(VIDEO_JOBS, (j) => j.model) });
    const res = await runStage(r.deps, { set: SET, jobs: VIDEO_JOBS });
    expect(res.outcome).toBe('complete');
    expect(r.submits).toHaveLength(VIDEO_JOBS.length);
    expect(new Set(r.submits.map((s) => `${s.model.id}|${s.imageUrls[0]}`)).size).toBe(VIDEO_JOBS.length);
  });

  test('waits between two submits, not before the first', async () => {
    const waits: number[] = [];
    const r = rig({ submitGapMs: 11_000, sleep: async (ms) => void waits.push(ms) });
    await runStage(r.deps, { set: SET, jobs: canary(VIDEO_JOBS, (j) => j.model) });
    expect(waits.slice(0, 2)).toEqual([11_000, 11_000]);
    expect(r.submits).toHaveLength(3);
  });

  test('stops at the cap before a job that would pass it', async () => {
    const r = rig({ capUsd: 2.5 });
    const res = await runStage(r.deps, { set: SET, jobs: canary(VIDEO_JOBS, (j) => j.model) });
    // 0.9 + 1.6 = 2.5 fits exactly; the 1.156 Seedance 2.5 clip would pass it.
    expect(res.outcome).toBe('stopped: cap');
    expect(r.submits).toHaveLength(2);
    expect(res.counts.notSubmitted).toBe(1);
  });

  test('needs jobs, and jobs belong to this set only', async () => {
    const r = rig();
    await expect(runStage(r.deps, { set: SET })).rejects.toThrow('takes jobs only');
    await expect(runStage(r.deps, { set: 'half-1', jobs: VIDEO_JOBS })).rejects.toThrow('apply only to the extra set');
    await expect(runStage(r.deps, { set: SET, jobs: [{ image: 1, model: 'nope' }] })).rejects.toThrow('unknown model nope');
    await expect(runStage(r.deps, { set: SET, jobs: [{ image: 11, model: 'seedance-2.5' }] })).rejects.toThrow('image 11 is not in inputs.json');
  });
});

describe('runImages', () => {
  interface Call {
    method: string;
    url: string;
    body?: { input: Record<string, unknown> };
  }
  const rig = (reply?: (c: Call) => Response | undefined, capUsd = CAP_USD): { deps: ImageDeps; outDir: string; calls: Call[] } => {
    const outDir = join(tmp(), 'out');
    const calls: Call[] = [];
    let n = 0;
    const fetchFake = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const c: Call = { method: init?.method ?? 'GET', url: String(url), ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) };
      calls.push(c);
      const custom = reply?.(c);
      if (custom) return custom;
      if (c.method === 'POST') return Response.json({ id: `p${++n}` });
      return Response.json({ status: 'succeeded', output: ['https://replicate.delivery/x.png'] });
    };
    return {
      outDir,
      calls,
      deps: {
        outDir,
        fetch: fetchFake as typeof fetch,
        apiToken: 'test-token',
        readImage: async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' }),
        imageUrl: (i) => `input:img${i}.jpg`,
        download: async (_url, dest) => {
          mkdirSync(join(dest, '..'), { recursive: true });
          writeFileSync(dest, 'png');
        },
        sleep: async () => {},
        capUsd,
      },
    };
  };
  const [seedream, banana21] = IMAGE_MODELS;

  test('sends the model fields, polls, saves the image and books the price', async () => {
    const r = rig();
    const res = await runImages(r.deps, [{ model: seedream!, image: 2 }, { model: banana21!, image: 2 }]);
    expect(res.outcome).toBe('complete');
    expect(res.counts).toEqual({ succeeded: 2 });
    const posts = r.calls.filter((c) => c.method === 'POST');
    expect(posts.map((c) => c.url)).toEqual(['https://api.replicate.com/v1/models/bytedance/seedream-5-pro/predictions', 'https://api.replicate.com/v1/models/google/nano-banana-2.1/predictions']);
    expect(posts[0]!.body!.input).toMatchObject({ size: '1K', aspect_ratio: 'match_input_image', output_format: 'png' });
    expect(posts[1]!.body!.input).toMatchObject({ resolution: '1K' });
    expect(String((posts[0]!.body!.input.image_input as string[])[0]).startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(existsSync(join(r.outDir, 'images', 'image02-seedream-5-pro-replicate.png'))).toBe(true);
    expect(res.spentUsd).toBeCloseTo(0.045 + 0.0336, 6);
  });

  test('a key already in the log is not submitted again', async () => {
    const r = rig();
    await runImages(r.deps, [{ model: seedream!, image: 1 }]);
    await runImages(r.deps, [{ model: seedream!, image: 1 }, { model: seedream!, image: 2 }]);
    expect(r.calls.filter((c) => c.method === 'POST')).toHaveLength(2);
  });

  test('stops at the cap and counts earlier jobs, videos included, against it', async () => {
    const r = rig(undefined, 0.09);
    const res = await runImages(r.deps, [{ model: seedream!, image: 1 }, { model: seedream!, image: 2 }, { model: seedream!, image: 3 }]);
    expect(res.outcome).toBe('stopped: cap');
    expect(r.calls.filter((c) => c.method === 'POST')).toHaveLength(2);
    expect(res.counts.notSubmitted).toBe(1);
  });

  test('a 4xx fails that job and goes on; a 429 stops; a 5xx stops and is never resubmitted', async () => {
    const r = rig((c) => (c.method === 'POST' && c.url.includes('seedream') ? new Response('bad input', { status: 422 }) : undefined));
    const res = await runImages(r.deps, [{ model: seedream!, image: 1 }, { model: banana21!, image: 1 }]);
    expect(res.counts).toEqual({ failed: 1, succeeded: 1 });

    const limited = rig((c) => (c.method === 'POST' ? new Response('slow down', { status: 429 }) : undefined));
    expect((await runImages(limited.deps, [{ model: seedream!, image: 1 }, { model: seedream!, image: 2 }])).outcome).toBe('stopped: rate limited');
    expect(limited.calls).toHaveLength(1);

    const broken = rig((c) => (c.method === 'POST' ? new Response('oops', { status: 502 }) : undefined));
    const stopped = await runImages(broken.deps, [{ model: seedream!, image: 1 }, { model: seedream!, image: 2 }]);
    expect(stopped.outcome).toBe('stopped: provider error');
    await runImages(broken.deps, [{ model: seedream!, image: 1 }]);
    expect(broken.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(spend(readLines(broken.outDir)).total).toBeCloseTo(0.045, 6);
  });
});

describe('blindImages', () => {
  test('refuses a map inside the bake-off folder', async () => {
    const root = tmp();
    await expect(blindImages({ root, outDir: join(root, 'out'), mapPath: join(root, 'map.json'), inputsDir: root, sourceFile: () => 'a.jpg', rubricPath: join(root, 'r.md') })).rejects.toThrow('outside');
    expect(IMAGE_ROUND).toBe('replicate-2026-11-images');
  });
});
