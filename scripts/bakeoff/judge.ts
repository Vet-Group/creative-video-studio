// Judge inputs and score validation (plan B.6 step 3).
//   tsx scripts/bakeoff/judge.ts --set half-1|half-2|extra [--root dir]                 writes blind/<set>/BRIEF.md for the judge subagent
//   tsx scripts/bakeoff/judge.ts --set half-1|half-2|extra --scores <file> [--root dir]   checks the scores CSV against the set's clips
// The brief names only clip ids and motion flags, never a model, and the judge sees only blind/<set>/ and rubric.md.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { defaultRoot, isMain } from './common.ts';
import { parseSet, type SetName } from './jobs.ts';
import type { ClipMetrics } from './metrics.ts';

export const FAULT_CODES = ['print', 'colour', 'deformed', 'flicker', 'stray-text'] as const;
export const SCORE_COLUMNS = ['id', 'pass', 'faults', 'note'] as const;

/** Minimal CSV: comma separated, double quotes around a field that holds a comma, quote or newline, "" for a quote inside. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"', i++);
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') (row.push(field), (field = ''));
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (quoted) throw new Error('the CSV has an unclosed quote');
  if (field !== '' || row.length) (row.push(field), rows.push(row));
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

/** Every problem found in a scores CSV; empty means valid. `clipIds` are the clip folders of the set. */
export function validateScores(csv: string, clipIds: string[]): string[] {
  const errors: string[] = [];
  const [header, ...rows] = parseCsv(csv);
  if (!header || header.join(',') !== SCORE_COLUMNS.join(',')) return [`the header must be exactly ${SCORE_COLUMNS.join(',')}`];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const at = `row ${i + 2}`;
    if (r.length !== SCORE_COLUMNS.length) return void errors.push(`${at}: ${r.length} columns; ${SCORE_COLUMNS.length} are required`);
    const [id, pass, faults] = r as [string, string, string, string];
    if (!clipIds.includes(id)) errors.push(`${at}: ${id} is not a clip of this set`);
    else if (seen.has(id)) errors.push(`${at}: ${id} appears twice`);
    seen.add(id);
    if (pass !== 'true' && pass !== 'false') errors.push(`${at}: pass must be true or false`);
    const codes = faults === '' ? [] : faults.split(';');
    const bad = codes.filter((c) => !(FAULT_CODES as readonly string[]).includes(c));
    if (bad.length) errors.push(`${at}: unknown fault code ${bad.join(', ')}`);
    else if (pass === 'true' && codes.length) errors.push(`${at}: a passing clip lists no faults`);
    else if (pass === 'false' && !codes.length) errors.push(`${at}: a failing clip lists at least one fault`);
  });
  for (const id of clipIds) if (!seen.has(id)) errors.push(`${id} has no row`);
  return errors;
}

const clipIdsOf = (dir: string): string[] => readdirSync(dir).filter((d) => d.startsWith('clip-')).sort();

/** The brief the judge subagent reads; `metrics` is blind/<set>/metrics.json when it exists. */
export function buildBrief(set: SetName, ids: string[], metrics: ClipMetrics[]): string {
  const flag = (v: boolean | null | undefined): string => (v === null || v === undefined ? 'not measured' : v ? 'flagged' : 'clear');
  const rows = ids.map((id) => {
    const m = metrics.find((x) => x.id === id);
    return `| ${id} | ${flag(m?.flicker)} | ${flag(m?.judder)} |`;
  });
  return [
    `# Judge brief: set ${set}`,
    '',
    'Read rubric.md first. Then judge every clip folder listed below against its `source.<ext>` image, using `clip.mp4` and the eight `frame-N.jpg` frames.',
    'Do not look for, guess or record which model made a clip. Do not open anything outside this folder and rubric.md.',
    '',
    `Write \`scores-${set}.csv\` in this folder with the header \`${SCORE_COLUMNS.join(',')}\`, one row per clip, as rubric.md describes.`,
    '',
    'Motion metrics (a flag is a hint for the `flicker` fault, not a verdict):',
    '',
    '| clip | flicker measure | judder measure |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

export function prepareBrief(root: string, set: SetName): string {
  const dir = join(root, 'blind', set);
  const ids = clipIdsOf(dir);
  if (!ids.length) throw new Error(`no clips in ${dir}; run anonymise first`);
  let metrics: ClipMetrics[] = [];
  try {
    metrics = JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8')) as ClipMetrics[];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const file = join(dir, 'BRIEF.md');
  writeFileSync(file, buildBrief(set, ids, metrics));
  return file;
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { set: { type: 'string' }, scores: { type: 'string' }, root: { type: 'string' } } });
  const root = values.root ?? defaultRoot();
  const set = parseSet(values.set);
  if (values.scores) {
    const errors = validateScores(readFileSync(values.scores, 'utf8'), clipIdsOf(join(root, 'blind', set)));
    for (const e of errors) console.log(`  x ${e}`);
    console.log(errors.length ? `${errors.length} problem(s) in ${values.scores}` : `${values.scores} is valid`);
    process.exit(errors.length ? 1 : 0);
  }
  console.log(`brief written to ${prepareBrief(root, set)}`);
}
