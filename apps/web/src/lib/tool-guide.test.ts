import { describe, expect, it } from 'vitest';
import { appBySlug } from './apps';
import { navGroups } from './sidebar';
import { TOOL_GOALS, TOOL_GUIDE, toolGuide } from './tool-guide';

// A link is to one of the five tools or to an app that exists.
const reachable = (href: string) => TOOL_GUIDE.some((t) => t.href === href) || (href.startsWith('/apps/') && appBySlug(href.slice(6)) !== undefined);

describe('tool guide', () => {
  it('covers every Sáng tạo item of the sidebar, in its order, and each item carries its line', () => {
    const items = navGroups(false).find((g) => g.label === 'Sáng tạo')!.items;
    expect(TOOL_GUIDE.map((t) => t.href)).toEqual(items.map((i) => i.href));
    for (const i of items) expect(i.hint).toBe(toolGuide(i.href)!.oneLine);
  });

  it('fills every field and only links to pages that exist', () => {
    for (const t of TOOL_GUIDE) {
      for (const text of [t.oneLine, t.useIf, t.have, t.get, t.example.have, t.example.get, t.wait]) expect(text.trim().length).toBeGreaterThan(10);
      expect(t.useWhen.length).toBeGreaterThanOrEqual(2);
      expect(t.notWhen.length).toBeGreaterThanOrEqual(2);
      for (const n of t.notWhen) {
        expect(reachable(n.href), n.href).toBe(true);
        expect(n.href).not.toBe(t.href); // "use another tool" never points back at itself
      }
    }
    for (const g of TOOL_GOALS) expect(reachable(g.href), g.href).toBe(true);
  });

  it('finds a tool from one of its sub-pages', () => {
    expect(toolGuide('/apps/reframe')?.title).toBe('Ứng dụng');
    expect(toolGuide('/library')).toBeUndefined();
  });
});
