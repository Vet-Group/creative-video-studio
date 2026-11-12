import { describe, expect, it } from 'vitest';
import { appBySlug } from './apps';
import { navGroups } from './sidebar';
import { ANALYZE_TOOL, TOOL_GOALS, TOOL_GUIDE, toolGoals, toolGuide, toolGuides } from './tool-guide';

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
    expect(toolGuide('/analyze')?.title).toBe('Phân tích'); // found even though it is kept out of the static list
  });
});

describe('the analysis tool in the guide', () => {
  it('appears only when the feature is on, right after Tạo video, mirroring the sidebar', () => {
    expect(toolGuides(false)).toEqual(TOOL_GUIDE);
    expect(toolGuides(false).some((t) => t.href === '/analyze')).toBe(false);
    const on = toolGuides(true);
    expect(on.map((t) => t.href)).toEqual(navGroups(false, 0, true).find((g) => g.label === 'Sáng tạo')!.items.map((i) => i.href));
    expect(on[on.findIndex((t) => t.href === '/analyze') - 1]!.href).toBe('/create');
    expect(toolGoals(false).some((g) => g.href === '/analyze')).toBe(false);
    expect(toolGoals(true).some((g) => g.href === '/analyze')).toBe(true);
  });

  it('is well-formed: every field filled and its "use another tool" links reach real pages', () => {
    for (const text of [ANALYZE_TOOL.oneLine, ANALYZE_TOOL.useIf, ANALYZE_TOOL.have, ANALYZE_TOOL.get, ANALYZE_TOOL.example.have, ANALYZE_TOOL.example.get, ANALYZE_TOOL.wait])
      expect(text.trim().length).toBeGreaterThan(10);
    expect(ANALYZE_TOOL.useWhen.length).toBeGreaterThanOrEqual(2);
    for (const n of ANALYZE_TOOL.notWhen) {
      expect(reachable(n.href), n.href).toBe(true);
      expect(n.href).not.toBe('/analyze');
    }
  });
});
