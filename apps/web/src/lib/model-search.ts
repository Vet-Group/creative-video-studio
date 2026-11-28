// Smart search for the model picker: it ignores case, diacritics and separators, forgives typos, and understands attribute words
// (a resolution such as '1080p', audio, a clip length such as '10s', new and cheap, typed in Vietnamese or English) and provider words ('google', 'bytedance') as filters instead of name text.
import { familyOf } from './model-families';

export interface SearchableModel {
  id: string;
  label: string;
  supported: boolean;
  resolution?: string | null;
  durationsSec?: number[];
  audio?: boolean;
  isNew?: boolean;
  estimateUsd: string;
  score?: number;
  recommended?: boolean;
}

export type Chip = 'audio' | '1080p' | 'cheap' | 'new';
export const CHIPS: readonly { key: Chip; label: string }[] = [
  { key: 'audio', label: 'Có âm thanh' },
  { key: '1080p', label: '1080p' },
  { key: 'cheap', label: 'Rẻ nhất' },
  { key: 'new', label: 'Mới' },
];

/** [start, end) indexes into the original label string. */
export type Range = [start: number, end: number];
export interface Hit<T> {
  model: T;
  ranges: Range[];
}

/** Lowercase, strip diacritics (NFD + remove combining marks, and the Vietnamese d with stroke -> d). Keeps spaces/punctuation. */
export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

/** A string reduced to its letters and digits (`compact`), with where each came from and where its words (letter or digit runs) sit. */
interface Prep {
  compact: string;
  /** compact index -> index in the original string; NFD changes lengths, so every offset goes through this. */
  map: number[];
  words: Range[];
}

function prep(s: string): Prep {
  const p: Prep = { compact: '', map: [], words: [] };
  let cls = 0;
  for (let i = 0; i < s.length; i++) {
    const n = normalize(s.charAt(i));
    let alnum = false;
    for (const c of n) {
      const k = c >= 'a' && c <= 'z' ? 1 : c >= '0' && c <= '9' ? 2 : 0;
      if (!k) continue;
      if (k !== cls) p.words.push([p.compact.length, p.compact.length]);
      cls = k;
      p.compact += c;
      p.map.push(i);
      p.words[p.words.length - 1]![1] = p.compact.length;
      alnum = true;
    }
    if (n !== '' && !alnum) cls = 0; // a combining mark alone (n === '') must not split a word
  }
  return p;
}

/** Damerau-Levenshtein (optimal string alignment) distance. */
function dl(a: string, b: string): number {
  const w = b.length + 1;
  const d = new Array<number>((a.length + 1) * w).fill(0);
  for (let i = 0; i <= a.length; i++) d[i * w] = i;
  for (let j = 0; j <= b.length; j++) d[j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(d[(i - 1) * w + j]! + 1, d[i * w + j - 1]! + 1, d[(i - 1) * w + j - 1]! + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) v = Math.min(v, d[(i - 2) * w + j - 2]! + 1);
      d[i * w + j] = v;
    }
  }
  return d[a.length * w + b.length]!;
}

type Flag = 'audio' | 'isNew' | 'cheap';
interface Terms {
  audio: boolean;
  isNew: boolean;
  cheap: boolean;
  /** Normalized resolution words ('1080p', '4k'). */
  res: string[];
  /** Clip lengths in seconds. */
  dur: number[];
  /** What is left: letter or digit runs to match against names or providers. */
  words: string[];
}

// Multi-word phrases go first, before the query is split into words ('co' alone would otherwise be left behind as a name).
const PHRASES: [RegExp, Flag][] = [
  [/\b(?:co\s*)?(?:tieng|am\s*thanh)\b/g, 'audio'], // a chip's own label typed as a query means the chip
  [/\b(?:gia\s*)?re(?:\s*nhat)?\b/g, 'cheap'],
];
const WORD_FLAGS = new Map<string, Flag>([['tieng', 'audio'], ['audio', 'audio'], ['sound', 'audio'], ['moi', 'isNew'], ['new', 'isNew'], ['re', 'cheap'], ['cheap', 'cheap']]);

function parse(query: string): Terms {
  const t: Terms = { audio: false, isNew: false, cheap: false, res: [], dur: [], words: [] };
  let q = normalize(query);
  for (const [re, flag] of PHRASES) q = q.replace(re, () => ((t[flag] = true), ' '));
  q = q.replace(/\b(\d+)\s*(?:giay|sec|s)\b/g, (_, n: string) => (t.dur.push(Number(n)), ' '));
  q = q.replace(/\b(?:\d{3,4}p|\d{1,2}k)\b/g, (r) => (t.res.push(r), ' '));
  for (const w of q.match(/[a-z]+|[0-9]+/g) ?? []) {
    const flag = WORD_FLAGS.get(w);
    if (flag) t[flag] = true;
    else t.words.push(w);
  }
  return t;
}

// Words of a provider note that say nothing about a provider.
const STOP = new Set(['dong', 'cua']);

/** Every word of the present families' names and notes -> the family keys it names. */
function providerWords(fams: ReturnType<typeof familyOf>[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const f of new Set(fams)) {
    for (const w of normalize(`${f.name} ${f.note}`).match(/[a-z0-9]+/g) ?? []) {
      if (w.length < 3 || STOP.has(w)) continue;
      if (!out.has(w)) out.set(w, new Set());
      out.get(w)!.add(f.key);
    }
  }
  return out;
}

const startsWord = (p: Prep, w: string) => p.words.some(([s]) => p.compact.startsWith(w, s));

// Tiers, best first: 0 the whole compact string, 1 its prefix, 2 the start of a word, 3 anywhere inside, 4 a typo away.
interface Match {
  tier: number;
  ranges: Range[];
}

function matchToken(tok: string, p: Prep): { tier: number; range: Range } | null {
  const { compact, words } = p;
  const start = words.find(([s]) => compact.startsWith(tok, s));
  if (start) return { tier: compact.length === tok.length ? 0 : start[0] === 0 ? 1 : 2, range: [start[0], start[0] + tok.length] };
  const at = compact.indexOf(tok);
  if (at >= 0) return { tier: 3, range: [at, at + tok.length] };
  const budget = tok.length <= 2 ? 0 : tok.length <= 5 ? 1 : 2;
  if (!budget || /\d/.test(tok)) return null;
  let bestD = budget + 1;
  let range: Range | null = null;
  for (const [s, e] of words) {
    const w = compact.slice(s, e);
    // A longer word also counts by its first letters, so a typo still matches while the word is being typed.
    const d = Math.min(dl(tok, w), tok.length >= 4 && w.length > tok.length ? dl(tok, w.slice(0, tok.length)) : Infinity);
    if (d < bestD) [bestD, range] = [d, [s, e]];
  }
  return range && { tier: 4, range };
}

/** The query as one compact run (`qc`, 'veo 3 1' -> 'veo31') or as words that each have to match somewhere; the better of the two counts. */
function matchTarget(tokens: string[], qc: string, p: Prep): Match | null {
  let best: Match | null = null;
  const at = p.compact.indexOf(qc);
  if (at >= 0) {
    const tier = at === 0 ? (p.compact.length === qc.length ? 0 : 1) : p.words.some(([s]) => s === at) ? 2 : 3;
    best = { tier, ranges: [[at, at + qc.length]] };
  }
  let tier = 0;
  const ranges: Range[] = [];
  for (const tok of tokens) {
    const hit = matchToken(tok, p);
    if (!hit) return best;
    tier = Math.max(tier, hit.tier);
    ranges.push(hit.range);
  }
  return !best || tier < best.tier ? { tier, ranges } : best;
}

/** Compact ranges -> sorted, merged ranges in the original string. */
function toOriginal(ranges: Range[], map: number[]): Range[] {
  const out: Range[] = [];
  for (const [s, e] of ranges.map(([s, e]): Range => [map[s]!, map[e - 1]! + 1]).sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

const price = (m: SearchableModel) => (Number.isFinite(Number(m.estimateUsd)) ? Number(m.estimateUsd) : Infinity);

/** Ranked hits for a query plus active chips. Empty query and no chips -> every model in input order with no ranges. */
export function searchModels<T extends SearchableModel>(models: T[], query: string, chips: readonly Chip[] = []): Hit<T>[] {
  const t = parse(query);
  for (const c of chips) {
    if (c === 'audio') t.audio = true;
    else if (c === 'new') t.isNew = true;
    else if (c === 'cheap') t.cheap = true;
    else t.res.push('1080p');
  }
  if (!t.words.length && !t.audio && !t.isNew && !t.cheap && !t.res.length && !t.dur.length) return models.map((model) => ({ model, ranges: [] }));

  const fams = models.map((m) => familyOf(m.id));
  // The label, the id and the family name, in that order of trust.
  const targets = t.words.length ? models.map((m, i) => [prep(m.label), prep(m.id), prep(fams[i]!.name)] as const) : [];
  const names: string[] = [];
  const providers: Set<string>[] = [];
  const known = t.words.length ? providerWords(fams) : new Map<string, Set<string>>();
  for (const w of t.words) {
    const keys = new Set<string>();
    if (w.length >= 3) for (const [word, ks] of known) if (word === w || (w.length >= 4 && word.startsWith(w))) ks.forEach((k) => keys.add(k));
    // A word that starts a model's name ('veo', 'kling') stays a name, even when a provider note mentions it too.
    if (keys.size && !targets.some(([label, id]) => startsWord(label, w) || startsWord(id, w))) providers.push(keys);
    else names.push(w);
  }

  const qc = names.join('');
  const rows: { model: T; ranges: Range[]; key: number; i: number }[] = [];
  models.forEach((m, i) => {
    const res = normalize(m.resolution ?? '');
    if ((t.audio && m.audio !== true) || (t.isNew && m.isNew !== true) || !t.res.every((r) => res.includes(r)) || !t.dur.every((n) => m.durationsSec?.includes(n))) return;
    if (!providers.every((keys) => keys.has(fams[i]!.key))) return;
    let key = 0;
    let ranges: Range[] = [];
    if (names.length) {
      key = Infinity;
      targets[i]!.forEach((p, ti) => {
        const hit = matchTarget(names, qc, p);
        // Any label match beats any id or family match; only the label's characters are highlighted.
        if (hit && hit.tier + (ti ? 5 : 0) < key) {
          key = hit.tier + (ti ? 5 : 0);
          if (!ti) ranges = toOriginal(hit.ranges, p.map);
        }
      });
      if (key === Infinity) return;
    }
    rows.push({ model: m, ranges, key, i });
  });

  rows.sort(
    (a, b) =>
      Number(b.model.supported) - Number(a.model.supported) ||
      (t.cheap ? price(a.model) - price(b.model) : 0) ||
      a.key - b.key ||
      Number(!!b.model.recommended) - Number(!!a.model.recommended) ||
      (b.model.score ?? -1) - (a.model.score ?? -1) ||
      a.i - b.i,
  );
  return rows.map(({ model, ranges }) => ({ model, ranges }));
}

/** Closest model for a query that matched nothing, or null when nothing is reasonably close. */
export function suggest<T extends SearchableModel>(models: T[], query: string): T | null {
  const q = prep(query).compact;
  if (!q) return null;
  let best: T | null = null;
  let bestD = Infinity;
  for (const m of models) {
    let d = Infinity;
    for (const { compact, words } of [prep(m.label), prep(m.id)]) {
      d = Math.min(d, dl(q, compact), dl(q, compact.slice(0, q.length)), ...words.map(([s, e]) => dl(q, compact.slice(s, e))));
    }
    if (d < bestD || (d === bestD && best && !best.supported && m.supported)) [best, bestD] = [m, d];
  }
  return best && bestD * 2 <= q.length ? best : null;
}
