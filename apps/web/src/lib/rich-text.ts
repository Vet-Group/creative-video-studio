// Plain text as members and the Admin type it, read as light formatting: a blank line starts a new paragraph, lines that start with
// "1." or "-" make a list, **bold**, and http(s) links. Used by feedback items, replies and comments; it only builds data, never HTML.

export interface Inline {
  kind: 'text' | 'bold' | 'link';
  text: string;
}
/** A paragraph keeps its single line breaks; a list item keeps the lines that follow its marker. */
export type RichBlock = { kind: 'para'; lines: Inline[][] } | { kind: 'list'; ordered: boolean; start: number; items: Inline[][][] };

const ORDERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
// A link ends before trailing punctuation, so "xem https://a.vn/x." links https://a.vn/x.
const INLINE = /\*\*([^*\n]+?)\*\*|(https?:\/\/[^\s<>]*[^\s<>.,;:!?'"”’)\]])/g;

export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const m of s.matchAll(INLINE)) {
    if (m.index > at) out.push({ kind: 'text', text: s.slice(at, m.index) });
    out.push(m[1] !== undefined ? { kind: 'bold', text: m[1] } : { kind: 'link', text: m[2]! });
    at = m.index + m[0].length;
  }
  if (at < s.length) out.push({ kind: 'text', text: s.slice(at) });
  return out;
}

export function parseRich(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  for (const chunk of text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/)) {
    let current: RichBlock | null = null;
    for (const raw of chunk.split('\n')) {
      const line = raw.trimEnd();
      if (!line.trim()) continue;
      const o = ORDERED.exec(line);
      const b = o ? null : BULLET.exec(line);
      if (o || b) {
        const ordered = o !== null;
        if (current?.kind !== 'list' || current.ordered !== ordered) {
          current = { kind: 'list', ordered, start: o ? Number(o[1]) : 1, items: [] };
          blocks.push(current);
        }
        current.items.push([inline(o ? o[2]! : b![1]!)]);
      } else if (current?.kind === 'list') {
        current.items.at(-1)!.push(inline(line.trim()));
      } else {
        if (current?.kind !== 'para') {
          current = { kind: 'para', lines: [] };
          blocks.push(current);
        }
        current.lines.push(inline(line));
      }
    }
  }
  return blocks;
}
