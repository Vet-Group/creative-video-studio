// anonymise, metrics and judge on tiny clips made with the pinned ffmpeg-static, in temp dirs. No provider is involved.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BAKEOFF_MODELS } from '@cvs/core/models';
import { beforeAll, describe, expect, test } from 'vitest';
import { anonymise, FRAMES } from './anonymise.ts';
import { ffmpeg } from './common.ts';
import type { Inputs } from './inputs.ts';
import { appendLine, type JobLine } from './jobs.ts';
import { buildBrief, FAULT_CODES, parseCsv, prepareBrief, validateScores } from './judge.ts';
import { clipMetrics, flagsFor, metricsForSet, motionStats, readThresholds, RUBRIC } from './metrics.ts';

const KLING = BAKEOFF_MODELS[0]!.id;
const SEEDANCE = BAKEOFF_MODELS[1]!.id;
const work = mkdtempSync(join(tmpdir(), 'cvs-bakeoff-judging-'));
const steady = join(work, 'steady.mp4');
const flicker = join(work, 'flicker.mp4');

/** 2 s at 10 fps and 64x112; the title tag stands in for provider metadata that anonymise must strip. */
const makeClip = (file: string, vf?: string) =>
  ffmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x808080:s=64x112:r=10:d=2', ...(vf ? ['-vf', vf] : []), '-metadata', 'title=kling-secret', '-pix_fmt', 'yuv420p', file]);

beforeAll(async () => {
  await makeClip(steady);
  // A bright flash every 7th frame: irregular enough that the rolling median does not cancel it.
  await makeClip(flicker, "eq=brightness='0.4*eq(mod(n,7),0)':eval=frame");
}, 60_000);

describe('metrics', () => {
  test('the shipped rubric.md has empty thresholds and the five Q3 faults', () => {
    const rubric = readFileSync(RUBRIC, 'utf8');
    expect(readThresholds(rubric)).toEqual({ flickerMeanMax: null, judderP99Max: null });
    for (const code of FAULT_CODES) expect(rubric).toContain(`\`${code}\``);
  });

  test('readThresholds reads numbers and rejects a missing line or a bad value', () => {
    expect(readThresholds('- flicker_mean_max: 1.5\n- judder_p99_max:   4\n')).toEqual({ flickerMeanMax: 1.5, judderP99Max: 4 });
    expect(() => readThresholds('- flicker_mean_max: 1')).toThrow(/judder_p99_max/);
    expect(() => readThresholds('- flicker_mean_max: high\n- judder_p99_max:')).toThrow(/non-negative number/);
  });

  test('motionStats removes a steady (global-motion) level and keeps spikes', () => {
    const smooth = motionStats(Array(30).fill(5));
    expect(smooth.mean).toBe(0);
    expect(smooth.p99).toBe(0);
    const spiky = motionStats(Array.from({ length: 30 }, (_, i) => (i === 15 ? 20 : 5)));
    expect(spiky.p99).toBe(15);
    expect(spiky.mean).toBeCloseTo(0.5, 6);
  });

  test('flagsFor flags only against calibrated thresholds', () => {
    expect(flagsFor({ mean: 9, p99: 9 }, { flickerMeanMax: null, judderP99Max: null })).toEqual({ flicker: null, judder: null });
    expect(flagsFor({ mean: 2, p99: 9 }, { flickerMeanMax: 1, judderP99Max: 10 })).toEqual({ flicker: true, judder: false });
  });

  test('a flickering clip scores above a steady one on the mean and the p99 spike, over all frames', async () => {
    const a = await clipMetrics(steady);
    const b = await clipMetrics(flicker);
    expect(a.samples).toBeGreaterThanOrEqual(19);
    expect(b.samples).toBe(a.samples);
    expect(b.mean).toBeGreaterThan(a.mean + 1);
    expect(b.p99).toBeGreaterThan(a.p99 + 5);
  }, 60_000);
});

describe('anonymise, metrics and judge on a set', () => {
  const root = join(work, 'cvs-bakeoff');
  const mapPath = join(work, 'scratch', 'map-half-1.json');
  const inputsDir = join(root, 'inputs');
  const inputs: Inputs = {
    images: Array.from({ length: 10 }, (_, i) => ({ file: `img${i + 1}.jpg`, category: i % 2 ? 'product' : 'mockup', sourceKey: `k${i}` })),
  };

  beforeAll(() => {
    mkdirSync(inputsDir, { recursive: true });
    for (const im of inputs.images) writeFileSync(join(inputsDir, im.file), `source of ${im.file}`);
    const out = join(root, 'out');
    mkdirSync(join(out, 'clips'), { recursive: true });
    const base = { at: '2026-10-23T00:00:00.000Z', provider: 'fal', estimateUsd: 0.56 } as const;
    const add = (l: Partial<JobLine> & Pick<JobLine, 'image' | 'model' | 'round' | 'status'>) => appendLine(out, { ...base, ...l });
    // Half 1: images 1 and 2 of both models; a failed job and a half-2 clip must not be copied.
    for (const [n, image, model, src, status] of [
      [1, 1, KLING, steady, 'succeeded'], [2, 1, SEEDANCE, flicker, 'succeeded'], [3, 2, KLING, steady, 'succeeded'], [4, 2, SEEDANCE, flicker, 'failed'], [5, 6, KLING, steady, 'succeeded'],
    ] as const) {
      const clip = `clips/c${n}.mp4`;
      writeFileSync(join(out, clip), readFileSync(src));
      add({ image, model, round: 'bakeoff', status, ...(status === 'succeeded' ? { clip } : {}) });
    }
  });

  test('anonymise copies only the set\'s succeeded clips, strips metadata, scales to 720 wide, and keeps the map outside', async () => {
    let n = 0;
    const map = await anonymise({ root, set: 'half-1', mapPath, inputs, inputsDir, newId: () => `clip-${String(++n).padStart(4, '0')}` });
    expect(Object.keys(map.clips)).toEqual(['clip-0001', 'clip-0002', 'clip-0003']);
    expect(Object.values(map.clips).map((c) => `${c.model}/${c.image}`).sort()).toEqual([`${KLING}/1`, `${KLING}/2`, `${SEEDANCE}/1`].sort());
    expect(JSON.parse(readFileSync(mapPath, 'utf8'))).toEqual(map);
    expect(mapPath.startsWith(root)).toBe(false);

    const set = join(root, 'blind', 'half-1');
    const dir = join(set, 'clip-0001');
    expect(readdirSync(dir).sort()).toEqual(['clip.mp4', ...Array.from({ length: FRAMES }, (_, i) => `frame-${i + 1}.jpg`), 'source.jpg'].sort());
    expect(readFileSync(join(dir, 'source.jpg'), 'utf8')).toBe(`source of img${map.clips['clip-0001']!.image}.jpg`);
    // The source title tag is gone, and nothing under blind/ names a model or a source file.
    expect(readFileSync(join(dir, 'clip.mp4')).includes('kling-secret')).toBe(false);
    const all = readdirSync(set, { recursive: true }).join('\n');
    expect(all).not.toMatch(/kling|seedance|c\d\.mp4|bakeoff/i);
    const { stderr } = await ffmpeg(['-i', join(dir, 'clip.mp4'), '-f', 'null', '-']);
    // The 64x112 test clip keeps its 4:7 shape at 720 wide.
    expect(stderr).toMatch(/Stream #0:0.*, 720x1260/);

    // A second run would orphan the map, so it refuses; so does a map inside cvs-bakeoff.
    await expect(anonymise({ root, set: 'half-1', mapPath, inputs, inputsDir })).rejects.toThrow(/already holds clips/);
    await expect(anonymise({ root, set: 'extra', mapPath: join(root, 'map.json'), inputs, inputsDir })).rejects.toThrow(/outside the cvs-bakeoff folder/);
    await expect(anonymise({ root, set: 'extra', mapPath, inputs, inputsDir })).rejects.toThrow(/no succeeded clips/);
  }, 120_000);

  test('metrics writes blind/<set>/metrics.json and judge prepares a brief that names no model', async () => {
    const calibrated = join(work, 'rubric.md');
    writeFileSync(calibrated, readFileSync(RUBRIC, 'utf8').replace('- flicker_mean_max:', '- flicker_mean_max: 0.5'));
    const rows = await metricsForSet(root, 'half-1', calibrated);
    expect(rows.map((r) => r.id)).toEqual(['clip-0001', 'clip-0002', 'clip-0003']);
    expect(existsSync(join(root, 'blind', 'half-1', 'metrics.json'))).toBe(true);
    expect(rows.every((r) => r.flicker !== null && r.judder === null)).toBe(true);

    const brief = readFileSync(prepareBrief(root, 'half-1'), 'utf8');
    for (const id of ['clip-0001', 'clip-0002', 'clip-0003']) expect(brief).toContain(id);
    expect(brief).toContain('scores-half-1.csv');
    expect(brief).not.toMatch(/kling|seedance/i);
  }, 120_000);
});

describe('judge scores', () => {
  const ids = ['clip-a', 'clip-b', 'clip-c'];
  const ok = 'id,pass,faults,note\nclip-a,true,,"clean, steady"\nclip-b,false,print;flicker,logo bends\nclip-c,false,colour,\n';

  test('parseCsv handles quoted commas and quotes', () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,2,3\n')).toEqual([['a', 'b,c', 'd "e"'], ['1', '2', '3']]);
    expect(() => parseCsv('a,"b')).toThrow(/unclosed quote/);
  });

  test('a complete file passes', () => {
    expect(validateScores(ok, ids)).toEqual([]);
  });

  test.each([
    ['a wrong header', 'id,pass,note,faults\n', /header must be exactly id,pass,faults,note/],
    ['a missing clip', 'id,pass,faults,note\nclip-a,true,,x\nclip-b,true,,x\n', /clip-c has no row/],
    ['an unknown clip', `${ok}clip-z,true,,x\n`, /clip-z is not a clip/],
    ['a duplicate row', `${ok}clip-a,true,,x\n`, /appears twice/],
    ['a bad pass value', ok.replace('clip-a,true', 'clip-a,yes'), /pass must be true or false/],
    ['an unknown fault code', ok.replace('colour', 'blurry'), /unknown fault code blurry/],
    ['a passing clip with faults', ok.replace('clip-a,true,,', 'clip-a,true,print,'), /passing clip lists no faults/],
    ['a failing clip without faults', ok.replace('clip-c,false,colour', 'clip-c,false,'), /failing clip lists at least one fault/],
    ['a short row', 'id,pass,faults,note\nclip-a,true\nclip-b,true,,\nclip-c,true,,\n', /2 columns/],
  ])('rejects %s', (_name, csv, message) => {
    expect(validateScores(csv, ids).join('\n')).toMatch(message);
  });

  test('buildBrief marks metrics as not measured before metrics.ts has run', () => {
    expect(buildBrief('extra', ['clip-a'], [])).toContain('| clip-a | not measured | not measured |');
  });
});
