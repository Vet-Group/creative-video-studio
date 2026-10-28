import { describe, expect, it } from 'vitest';
import { ABOUT, type AboutBlock, type AboutPage, APP_ABOUT, MODEL_CARD_TEXT } from './about-content';
import { APPS } from './apps';
import { sampleType } from './samples';

const pages: [string, AboutPage][] = [...Object.entries(ABOUT), ...Object.entries(APP_ABOUT)];
const text = (b: AboutBlock): string[] =>
  typeof b === 'string'
    ? [b]
    : 'cards' in b
      ? b.cards.flatMap((c) => [c.title, c.text, ...(c.specs ?? [])])
      : 'steps' in b
        ? b.steps.flatMap((s) => [s.title, s.text])
        : 'table' in b
          ? b.table.flat()
          : 'list' in b
            ? b.list
            : 'links' in b
              ? b.links.flatMap(([l, , t]) => [l, t])
              : 'ratios' in b
                ? b.ratios.flat()
                : 'example' in b
                  ? [b.example.text]
                  : 'faq' in b
                    ? b.faq.flat()
                    : [];

describe('the About pages', () => {
  it.each(pages)('%s has unique section titles, ends on the FAQ and keeps table rows as wide as the header', (_, page) => {
    const titles = page.sections.map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length); // section titles are React keys
    expect(page.sections.at(-1)!.blocks!.some((b) => typeof b !== 'string' && 'faq' in b)).toBe(true);
    for (const b of page.sections.flatMap((s) => s.blocks ?? [])) {
      if (typeof b !== 'string' && 'table' in b) for (const row of b.table) expect(row).toHaveLength(b.table[0]!.length);
      if (typeof b !== 'string' && 'cards' in b) expect(new Set(b.cards.map((c) => c.title)).size).toBe(b.cards.length);
      if (typeof b !== 'string' && 'links' in b) for (const [, href] of b.links) expect(href).toMatch(/^\/[a-z-/]+$/);
    }
  });

  it.each(pages)('%s never speaks of credits, plans or the reference site', (_, page) => {
    const all = [page.title, page.lead ?? '', ...page.sections.flatMap((s) => [s.title, s.lead ?? '', ...(s.blocks ?? []).flatMap(text)])].join(' ');
    expect(all).not.toMatch(/credit|tín dụng|gói cước|Fash Studio|fash\.studio/i);
  });

  /** Every media slot of a page: the sample each card, step and example names. */
  const media = (page: AboutPage): string[] =>
    page.sections.flatMap((s) => s.blocks ?? []).flatMap((b) =>
      typeof b === 'string' ? [] : 'cards' in b ? b.cards.flatMap((c) => c.media ?? []) : 'steps' in b ? b.steps.flatMap((x) => x.media ?? []) : 'example' in b ? (b.example.media ?? []) : [],
    );

  it.each(pages)('%s names an uploadable sample in every media slot, once each', (_, page) => {
    const names = media(page);
    for (const name of names) expect([sampleType(`${name}.mp4`), sampleType(`${name}.jpg`)], name).not.toContain(null); // the bucket accepts it as a loop and a still
    expect(new Set(names).size).toBe(names.length);
  });

  it('describes every app that is open, and gives every one an About page', () => {
    for (const app of APPS.filter((a) => !a.soon)) {
      expect(app.description.trim().length, app.slug).toBeGreaterThan(20);
      expect(APP_ABOUT[app.slug], app.slug).toBeDefined();
    }
  });

  it('describes the featured Explore models', () => {
    for (const id of ['seedance-2.5-image', 'kling-o3-pro', 'gemini-omni-flash', 'kling-3.0-pro', 'seedance-2.0', 'nano-banana-pro', 'gpt-image-2']) expect(MODEL_CARD_TEXT[id]).toBeTruthy();
  });
});
