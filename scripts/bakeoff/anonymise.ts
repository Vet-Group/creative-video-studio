// Blind copy of a set's clips for the judge (plan B.6 step 1).
//   tsx scripts/bakeoff/anonymise.ts --set half-1|half-2|extra --map <file outside cvs-bakeoff> [--root dir] [--inputs file]
// Each succeeded clip of the set goes to <root>/blind/<set>/clip-<random>/ as clip.mp4 (720 px wide, metadata stripped), frame-1..8.jpg
// (evenly spaced) and source.<ext> (the input image). The id -> model map is written only to --map, which must be outside <root>.
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { defaultRoot, durationSec, ffmpeg, isMain } from './common.ts';
import { loadInputs, type Inputs } from './inputs.ts';
import { inSet, latest, parseSet, readLines, type SetName } from './jobs.ts';

export const FRAMES = 8;

export interface AnonymiseOpts {
  root: string;
  set: SetName;
  /** Where the id -> model map goes; must be outside root. */
  mapPath: string;
  inputs: Inputs;
  inputsDir: string;
  newId?: () => string;
}

export interface ClipMap {
  set: SetName;
  clips: Record<string, { model: string; image: number; round: string }>;
}

const outside = (root: string, p: string): boolean => {
  const rel = relative(resolve(root), resolve(p));
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
};

export async function anonymise(o: AnonymiseOpts): Promise<ClipMap> {
  if (o.set === 'canary') throw new Error('--set must be half-1, half-2 or extra');
  if (!outside(o.root, o.mapPath)) throw new Error('--map must be outside the cvs-bakeoff folder, where a judge could read it');
  const setDir = join(o.root, 'blind', o.set);
  if (existsSync(setDir) && readdirSync(setDir).length) throw new Error(`${setDir} already holds clips; the id map for them would be lost`);
  const outDir = join(o.root, 'out');
  const done = [...latest(readLines(outDir)).values()].filter((l) => l.status === 'succeeded' && l.clip && inSet(o.set, l));
  if (!done.length) throw new Error(`no succeeded clips for set ${o.set}`);
  const newId = o.newId ?? (() => `clip-${randomBytes(4).toString('hex')}`);
  const map: ClipMap = { set: o.set, clips: {} };
  for (const l of done) {
    let id = newId();
    while (map.clips[id]) id = newId();
    map.clips[id] = { model: l.model, image: l.image, round: l.round };
    const dir = join(setDir, id);
    mkdirSync(dir, { recursive: true });
    const clip = join(dir, 'clip.mp4');
    await ffmpeg([
      '-y', '-v', 'error', '-i', join(outDir, l.clip!), '-vf', 'scale=720:-2', '-an', '-map_metadata', '-1', '-map_chapters', '-1',
      '-fflags', '+bitexact', '-flags:v', '+bitexact', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip,
    ]);
    const len = await durationSec(clip);
    for (let k = 0; k < FRAMES; k++) {
      await ffmpeg(['-y', '-v', 'error', '-ss', String((len * (k + 0.5)) / FRAMES), '-i', clip, '-frames:v', '1', '-map_metadata', '-1', '-q:v', '3', join(dir, `frame-${k + 1}.jpg`)]);
    }
    const src = o.inputs.images[l.image - 1]!.file;
    copyFileSync(join(o.inputsDir, src), join(dir, `source${extname(src).toLowerCase()}`));
  }
  mkdirSync(dirname(o.mapPath), { recursive: true });
  writeFileSync(o.mapPath, `${JSON.stringify(map, null, 2)}\n`);
  return map;
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { set: { type: 'string' }, map: { type: 'string' }, root: { type: 'string' }, inputs: { type: 'string' } } });
  const root = values.root ?? defaultRoot();
  if (!values.map) throw new Error('--map is required');
  const { inputs, dir } = loadInputs(values.inputs ?? join(root, 'inputs', 'inputs.json'));
  const map = await anonymise({ root, set: parseSet(values.set), mapPath: values.map, inputs, inputsDir: dir });
  console.log(`${Object.keys(map.clips).length} clips copied to ${join(root, 'blind', map.set)}; map written to ${values.map}`);
}
