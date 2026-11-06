import { describe, expect, it } from 'vitest';
import { endingLine, hookLine, MAX_ENDING, MAX_HOOK } from './marketing';
import { PROMPT_TEMPLATES } from './prompt-starters';

describe('PROMPT_TEMPLATES', () => {
  it.each(Object.entries(PROMPT_TEMPLATES))('%s: uniquely named templates with a short Vietnamese line, whose English hook and ending fit their sections and read as written', (_, list) => {
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(new Set(list.map((t) => t.name)).size).toBe(list.length);
    for (const t of list) {
      expect(t.hook.length).toBeLessThanOrEqual(MAX_HOOK);
      expect(t.ending.length).toBeLessThanOrEqual(MAX_ENDING);
      for (const text of [t.hook, t.body, t.ending]) expect(text).not.toMatch(/[À-ỹ]/); // the video models read English best
      expect(t.desc).toMatch(/[À-ỹ]/); // the sheet's line under the name is Vietnamese
      expect(t.desc.length).toBeLessThanOrEqual(60); // and one line at 390 px
      expect(t.hook).toMatch(/^The clip opens /);
      expect(hookLine(t.hook)).toBe(t.hook);
      expect(endingLine(t.ending)).toBe(t.ending); // no "It ends with: The clip ends…"
    }
  });
});

describe('PROMPT_TEMPLATES across pages', () => {
  it('names the three templates of each Marketing Studio format and never offers one template on two pages', () => {
    expect(PROMPT_TEMPLATES.marketing.map((t) => t.name)).toEqual(['Trước / sau', 'Cận chất liệu', 'Phối đồ']);
    expect(PROMPT_TEMPLATES.unboxing.map((t) => t.name)).toEqual(['Hộp quà', 'POV tay', 'Mở nhanh ASMR']);
    expect(PROMPT_TEMPLATES.review.map((t) => t.name)).toEqual(['Review thật', 'Ưu và nhược', 'Mặc cả ngày']);
    const all = Object.values(PROMPT_TEMPLATES).flat();
    for (const key of ['name', 'hook', 'body', 'ending'] as const) expect(new Set(all.map((t) => t[key])).size).toBe(all.length);
  });
});

