import type { IconName } from '@/components/Icon';
import { fold } from './apps';

/** One place the command palette (components/CommandPalette.tsx) opens: a page, an app or a recent job. */
export interface PaletteItem {
  href: string;
  name: string;
  /** Shown under the name; searched too, with the keywords. */
  description?: string;
  keywords?: string;
  icon: IconName;
}

export interface PaletteGroup {
  label: string;
  items: PaletteItem[];
}

/** Lower case, without accents (the stroked d as d) and with punctuation as spaces, so a name with accents reads as one typed without them, and "Try-On" as "try on". */
const plain = (s: string): string => fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** How well a query fits an item: 3 its name starts with it, 2 a word of its name, description or keywords does, 1 it is found inside one, 0 not at all. Every item fits an empty query. */
export function matchScore(query: string, item: Pick<PaletteItem, 'name' | 'description' | 'keywords'>): number {
  const q = plain(query);
  if (!q) return 1;
  const name = plain(item.name);
  if (name.startsWith(q)) return 3;
  const all = ` ${name} ${plain(`${item.description ?? ''} ${item.keywords ?? ''}`)}`;
  return all.includes(` ${q}`) ? 2 : all.includes(q) ? 1 : 0;
}

/** The groups as the palette lists them for a query: only the items that fit, best first, and the group with the best fit first (ties keep the given order). */
export function searchPalette(groups: PaletteGroup[], query: string): PaletteGroup[] {
  return groups
    .map((g) => {
      const scored = g.items.map((item) => ({ item, score: matchScore(query, item) })).filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
      return { label: g.label, items: scored.map((s) => s.item), best: scored[0]?.score ?? 0 };
    })
    .filter((g) => g.best > 0)
    .sort((a, b) => b.best - a.best)
    .map(({ label, items }) => ({ label, items }));
}
