// The About page types and the live spec lines, split from about-content.ts so the renderer loads them without the page data.

export interface AboutCard {
  title: string;
  text: string;
  /** A small pill above the title ("Don't", "6 models", "1024px"). */
  tag?: string;
  media?: string;
  /** Short spec lines under the text (a model card's durations, resolutions...). */
  specs?: string[];
  /** A link closing the text, [label, href], as the live cards' "Open UGC Try-On." */
  link?: [string, string];
  /** A model family's id prefix: with the Create form's model list loaded, the spec lines and a model-count tag are built from it (withLiveSpecs). */
  family?: string;
}

/** The fields of a Create form model that a family card's spec lines are built from. */
export interface SpecModel {
  id: string;
  label: string;
  ratios: string[];
  durationsSec: number[];
  resolution: string | null;
  maxImages: number;
}

function seconds(d: number[]): string {
  const s = [...d].sort((a, b) => a - b);
  if (s.length > 2 && s.at(-1)! - s[0]! === s.length - 1) return `${s[0]}–${s.at(-1)} giây`;
  return `${s.length > 1 ? `${s.slice(0, -1).join(', ')} hoặc ${s.at(-1)}` : s[0]} giây`;
}

/** "name: value (variants) · value (variants)", or just the value when every model shares it; a biggest group of three or more is labelled as the other variants and goes last. */
function specLine(name: string, ms: SpecModel[], short: (m: SpecModel) => string, value: (m: SpecModel) => string | null): string | null {
  const groups = new Map<string, string[]>();
  for (const m of ms) {
    const v = value(m);
    if (v) groups.set(v, [...(groups.get(v) ?? []), short(m)]);
  }
  if (groups.size <= 1) return groups.size ? `${name}: ${[...groups.keys()][0]}` : null;
  const all = [...groups];
  const big = all.reduce((a, b) => (b[1].length > a[1].length ? b : a));
  const rest = big[1].length >= 3 ? [...all.filter((g) => g !== big), [big[0], ['các bản khác']] as const] : all;
  const names = ms.map(short);
  return `${name}: ${rest.map(([v, who]) => `${v} (${levels(who, names).join(', ')})`).join(' · ')}`;
}

/** Variants that differ only by a resolution suffix ("H3 Max Reference", "... 1080p", "... 480p") read as one name with their level count in parentheses:
 * the name drops a leading sibling model's name ("H3 Max"), the owner's wording (2026-11-02). */
function levels(who: readonly string[], names: string[]): string[] {
  const base = (w: string) => w.replace(/ \d+p$/i, '');
  return [...new Set(who.map((w) => {
    const b = base(w);
    const n = who.filter((x) => base(x) === b).length;
    if (n < 2) return w;
    const parent = names.filter((p) => b.startsWith(`${p} `)).sort((x, y) => y.length - x.length)[0];
    return `${parent ? b.slice(parent.length + 1) : b} (${n} mức)`;
  }))];
}

/** A family card with its spec lines (and a model-count tag) built from the models the Create form loaded, so they follow Admin and migrations.
 * The hand-written lines stay while the list is loading or when none of the family's models is on. */
export function withLiveSpecs(card: AboutCard, models: SpecModel[] | undefined): AboutCard {
  const ms = card.family && models ? models.filter((m) => m.id.startsWith(card.family!)) : [];
  if (ms.length === 0) return card;
  const short = (m: SpecModel) => (m.label.startsWith(`${card.title} `) ? m.label.slice(card.title.length + 1) : m.label);
  const specs = [
    specLine('Thời lượng', ms, short, (m) => (m.durationsSec.length ? seconds(m.durationsSec) : null)),
    specLine('Độ phân giải', ms, short, (m) => m.resolution),
    specLine('Tỉ lệ', ms, short, (m) => (m.ratios.length ? m.ratios.join(', ') : null)),
    specLine('Ảnh', ms, short, (m) => (m.maxImages > 1 ? `tối đa ${m.maxImages}` : String(m.maxImages))),
  ].filter((s): s is string => s !== null);
  return { ...card, tag: card.tag && /^\d+ mô hình$/.test(card.tag) ? `${ms.length} mô hình` : card.tag, specs };
}
export interface AboutStep {
  title: string;
  text: string;
  media?: string;
}
/** A paragraph, or one of the section's blocks. `links` items are [label, href, text]; `table` rows start with the header row. */
export type AboutBlock =
  | string
  | { cards: AboutCard[]; cols?: 2 | 3 }
  | { steps: AboutStep[] }
  /** A looping clip on its own under the steps, as the live pages show the finished result there; the sample keeps its own shape. */
  | { loop: string }
  | { pairs: [string, string][]; labels: [string, string] }
  | { table: string[][] }
  | { list: string[] }
  | { links: [string, string, string][] }
  | { ratios: [string, string][] }
  | { example: { label: string; text: string; media?: string } }
  | { faq: [string, string][] };
export interface AboutSection {
  kicker?: string;
  title: string;
  lead?: string;
  blocks?: AboutBlock[];
}
export interface AboutPage {
  title: string;
  lead?: string;
  sections: AboutSection[];
}
