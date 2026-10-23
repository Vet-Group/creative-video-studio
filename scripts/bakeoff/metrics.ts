// Motion metrics for the flicker-or-judder fault (plan B.6 step 2). The other four faults are judged visually.
//   tsx scripts/bakeoff/metrics.ts --set half-1|half-2|extra [--root dir] [--rubric file]   writes blind/<set>/metrics.json
//   tsx scripts/bakeoff/metrics.ts --files a.mp4,b.mp4                                      prints the numbers, for calibration at B.5a
// Per clip: the tblend luma-difference series over ALL frames (signalstats mean luma of each frame difference), minus a global-motion
// estimate, then the mean and the p99 spike of what is left. Thresholds come from rubric.md and are empty until calibrated.
// shortcut: the global-motion estimate is the rolling median of the difference series, so smooth camera motion cancels but a flicker on
// every single frame would cancel too; irregular flicker and judder stand out. Upgrade to motion-compensated differences if B.5a shows it.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { defaultRoot, ffmpeg, isMain } from './common.ts';
import { parseSet, type SetName } from './jobs.ts';

const WINDOW = 9;

export const RUBRIC = join(dirname(fileURLToPath(import.meta.url)), 'rubric.md');

export interface Thresholds {
  flickerMeanMax: number | null;
  judderP99Max: number | null;
}

/** Reads the `- flicker_mean_max:` and `- judder_p99_max:` lines of rubric.md; an empty value means not calibrated yet. */
export function readThresholds(rubric: string): Thresholds {
  const get = (name: string): number | null => {
    const m = new RegExp(`^- ${name}:[ \\t]*(\\S*)[ \\t]*$`, 'm').exec(rubric);
    if (!m) throw new Error(`rubric.md has no "- ${name}:" line`);
    if (m[1] === '') return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 0) throw new Error(`rubric.md: ${name} must be empty or a non-negative number`);
    return n;
  };
  return { flickerMeanMax: get('flicker_mean_max'), judderP99Max: get('judder_p99_max') };
}

export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** Mean and p99 (nearest rank) of |series - rolling median of the series|. */
export function motionStats(series: number[]): { samples: number; mean: number; p99: number } {
  if (!series.length) throw new Error('no luma-difference samples');
  const half = Math.floor(WINDOW / 2);
  const resid = series.map((v, i) => Math.abs(v - median(series.slice(Math.max(0, i - half), i + half + 1))));
  const sorted = [...resid].sort((a, b) => a - b);
  return { samples: series.length, mean: resid.reduce((a, b) => a + b, 0) / resid.length, p99: sorted[Math.ceil(0.99 * sorted.length) - 1]! };
}

/** null while the threshold is not calibrated, so an uncalibrated run flags nothing. */
export const flagsFor = (s: { mean: number; p99: number }, t: Thresholds): { flicker: boolean | null; judder: boolean | null } => ({
  flicker: t.flickerMeanMax === null ? null : s.mean > t.flickerMeanMax,
  judder: t.judderP99Max === null ? null : s.p99 > t.judderP99Max,
});

export async function lumaDiffSeries(file: string): Promise<number[]> {
  const { stdout } = await ffmpeg([
    '-v', 'error', '-i', file, '-an',
    '-vf', 'tblend=all_mode=difference,signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file=-',
    '-f', 'null', '-',
  ]);
  return [...stdout.matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)].map((m) => Number(m[1]));
}

export const clipMetrics = async (file: string) => motionStats(await lumaDiffSeries(file));

/** What blind/<set>/metrics.json holds per clip. Nothing here may differ systematically by model, so the sample count is left out. */
export interface ClipMetrics {
  id: string;
  mean: number;
  p99: number;
  flicker: boolean | null;
  judder: boolean | null;
}

/** Measures the clip.mp4 in every clip folder of blind/<set> and writes blind/<set>/metrics.json. */
export async function metricsForSet(root: string, set: SetName, rubricPath = RUBRIC): Promise<ClipMetrics[]> {
  const thresholds = readThresholds(readFileSync(rubricPath, 'utf8'));
  const dir = join(root, 'blind', set);
  const ids = readdirSync(dir).filter((d) => d.startsWith('clip-')).sort();
  if (!ids.length) throw new Error(`no clips in ${dir}; run anonymise first`);
  const out: ClipMetrics[] = [];
  for (const id of ids) {
    const s = await clipMetrics(join(dir, id, 'clip.mp4'));
    out.push({ id, mean: s.mean, p99: s.p99, ...flagsFor(s, thresholds) });
  }
  writeFileSync(join(dir, 'metrics.json'), `${JSON.stringify(out, null, 2)}\n`);
  return out;
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { set: { type: 'string' }, files: { type: 'string' }, root: { type: 'string' }, rubric: { type: 'string' } } });
  if (values.files) {
    for (const f of values.files.split(',')) console.log(JSON.stringify({ file: f, ...(await clipMetrics(f)) }));
  } else {
    console.log(JSON.stringify(await metricsForSet(values.root ?? defaultRoot(), parseSet(values.set), values.rubric), null, 2));
  }
}
