import { describe, expect, it } from 'vitest';
import { APP_ABOUT } from './about-apps';
import { ABOUT, type AboutBlock, type AboutPage, withLiveSpecs } from './about-content';
import { MODEL_CARD_TEXT } from './about-model-cards';
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
                    : []; // pairs and loop carry no text

describe('the About pages', () => {
  it.each(pages)('%s has unique section titles, ends on the FAQ and keeps table rows as wide as the header', (_, page) => {
    const titles = page.sections.map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length); // section titles are React keys
    expect(page.sections.at(-1)!.blocks!.some((b) => typeof b !== 'string' && 'faq' in b)).toBe(true);
    for (const b of page.sections.flatMap((s) => s.blocks ?? [])) {
      if (typeof b !== 'string' && 'table' in b) for (const row of b.table) expect(row).toHaveLength(b.table[0]!.length);
      if (typeof b !== 'string' && 'cards' in b) expect(new Set(b.cards.map((c) => c.title)).size).toBe(b.cards.length);
      if (typeof b !== 'string' && 'cards' in b) for (const c of b.cards) if (c.link) expect(c.link[1]).toMatch(/^\/[a-z-/]+$/);
      if (typeof b !== 'string' && 'links' in b) for (const [, href] of b.links) expect(href).toMatch(/^\/[a-z-/]+$/);
    }
  });

  it.each(pages)('%s never speaks of credits, plans or the reference site', (_, page) => {
    const all = [page.title, page.lead ?? '', ...page.sections.flatMap((s) => [s.title, s.lead ?? '', ...(s.blocks ?? []).flatMap(text)])].join(' ');
    expect(all).not.toMatch(/credit|tín dụng|gói cước|\bfash\b|fash\.studio/i);
  });

  /** Every media slot of a page: the sample each card, step, example and loop names. */
  const media = (page: AboutPage): string[] =>
    page.sections.flatMap((s) => s.blocks ?? []).flatMap((b) =>
      typeof b === 'string' ? [] : 'cards' in b ? b.cards.flatMap((c) => c.media ?? []) : 'steps' in b ? b.steps.flatMap((x) => x.media ?? []) : 'example' in b ? (b.example.media ?? []) : 'loop' in b ? [b.loop] : [],
    );

  it.each(pages)('%s names an uploadable sample in every media slot, once each', (_, page) => {
    const names = media(page);
    for (const name of names) expect([sampleType(`${name}.mp4`), sampleType(`${name}.jpg`)], name).not.toContain(null); // the bucket accepts it as a loop and a still
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(pages)('%s lays its ratio tiles out in full rows (three a row, five on a wide screen) and names an uploadable tutorial', (_, page) => {
    for (const b of page.sections.flatMap((s) => s.blocks ?? [])) if (typeof b !== 'string' && 'ratios' in b) expect([3, 5, 6]).toContain(b.ratios.length);
    if (page.video) expect(sampleType(`${page.video}.mp4`)).toBe('video/mp4');
  });

  it("opens Advanced like the live page: the two format cards, the UGC one linking to UGC Try-On, and no comparison table", () => {
    const [choose] = ABOUT.advanced.sections;
    expect(choose!.blocks!.some((b) => typeof b !== 'string' && 'table' in b)).toBe(false);
    const cards = choose!.blocks!.flatMap((b) => (typeof b !== 'string' && 'cards' in b ? b.cards : []));
    expect(cards.map((c) => [c.title, c.link])).toEqual([
      ['UGC Thử đồ', ['Mở UGC Thử đồ', '/marketing-studio']],
      ['Editorial', undefined],
    ]);
  });

  it('answers "why not ChatGPT, Gemini or a general image tool" on Try On, Jewelry and Lingerie, after the opening, with a table as wide as its header and no garment count', () => {
    const general = 'ChatGPT, Gemini hay công cụ AI tạo ảnh chung';
    const why = (page: AboutPage) => page.sections.findIndex((s) => s.title.includes(general));
    expect(why(ABOUT.tryOn)).toBe(0); // right after the page lead
    expect(why(APP_ABOUT['jewelry-try-on']!)).toBe(1); // after "Thử trang sức bằng AI là gì?"
    expect(why(APP_ABOUT['lingerie-try-on']!)).toBe(1);
    for (const page of [ABOUT.tryOn, APP_ABOUT['jewelry-try-on']!, APP_ABOUT['lingerie-try-on']!]) {
      const section = page.sections[why(page)]!;
      const table = section.blocks!.flatMap((b) => (typeof b !== 'string' && 'table' in b ? [b.table] : []))[0]!;
      expect(table[0]![2]).toBe(general);
      expect(table.length).toBeGreaterThanOrEqual(5);
      expect(section.blocks!.flatMap(text).join(' ')).not.toMatch(/\b\d+ (món|ảnh trang phục)|MCP/); // another change may raise the limit: say "nhiều món"
    }
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

describe('withLiveSpecs', () => {
  const m = (id: string, label: string, durationsSec: number[], resolution: string, ratios: string[], maxImages: number) => ({ id, label, durationsSec, resolution, ratios, maxImages });
  const kling = ABOUT.create.sections.flatMap((s) => s.blocks ?? []).flatMap((b) => (typeof b === 'object' && 'cards' in b ? b.cards : [])).find((c) => c.title === 'Kling')!;
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const models = [
    m('kling-o3-pro', 'Kling O3 Pro', range(3, 15), '1080p', ['9:16', '1:1', '16:9'], 7),
    m('kling-o1', 'Kling O1', [5, 10], '1080p', ['9:16', '1:1', '16:9'], 4),
    m('kling-2.6', 'Kling 2.6', [5, 10], '1080p', ['9:16', '1:1'], 1),
    m('kling-2.5-turbo', 'Kling 2.5 Turbo', [5, 10], '1080p', ['9:16', '1:1'], 1),
    m('kling-3.0-pro', 'Kling 3.0 Pro', range(3, 15), '1080p', ['9:16', '1:1'], 1),
    m('veo-3.1', 'Veo 3.1', [8], '720p', ['9:16', '16:9'], 1),
  ];

  it("builds a family card's spec lines and model count from the loaded models", () => {
    const card = withLiveSpecs(kling, models);
    expect(card.tag).toBe('5 mô hình');
    expect(card.specs).toEqual([
      'Thời lượng: 3–15 giây (O3 Pro, 3.0 Pro) · 5 hoặc 10 giây (các bản khác)',
      'Độ phân giải: 1080p',
      'Tỉ lệ: 9:16, 1:1, 16:9 (O3 Pro, O1) · 9:16, 1:1 (các bản khác)',
      'Ảnh: tối đa 7 (O3 Pro) · tối đa 4 (O1) · 1 (các bản khác)',
    ]);
  });

  it('follows what Admin turned off, and keeps the written lines while nothing of the family is loaded', () => {
    expect(withLiveSpecs(kling, models.slice(0, 1)).tag).toBe('1 mô hình');
    expect(withLiveSpecs(kling, undefined)).toBe(kling);
    expect(withLiveSpecs(kling, models.slice(5))).toBe(kling);
  });

  it('names variants that differ only by resolution once, with their level count', () => {
    const minimax = ABOUT.create.sections.flatMap((s) => s.blocks ?? []).flatMap((b) => (typeof b === 'object' && 'cards' in b ? b.cards : [])).find((c) => c.title === 'MiniMax')!;
    const r5 = ['9:16', '1:1', '16:9', '4:3', '3:4'];
    const card = withLiveSpecs(minimax, [
      m('minimax-h3-max', 'MiniMax H3 Max', range(5, 15), '768p', ['9:16', '1:1'], 1),
      m('minimax-h3-max-1080p', 'MiniMax H3 Max 1080p', range(5, 15), '1080p', ['9:16', '1:1'], 1),
      m('minimax-h3-max-480p', 'MiniMax H3 Max 480p', range(5, 15), '480p', ['9:16', '1:1'], 1),
      m('minimax-h3-max-reference', 'MiniMax H3 Max Reference', range(5, 15), '768p', r5, 9),
      m('minimax-h3-max-reference-1080p', 'MiniMax H3 Max Reference 1080p', range(5, 15), '1080p', r5, 9),
      m('minimax-h3-max-reference-480p', 'MiniMax H3 Max Reference 480p', range(5, 15), '480p', r5, 9),
      m('minimax-hailuo-2.3-pro', 'MiniMax Hailuo 2.3 Pro', [6], '1080p', ['9:16', '1:1'], 1),
    ]);
    expect(card.specs).toEqual([
      'Thời lượng: 6 giây (Hailuo 2.3 Pro) · 5–15 giây (các bản khác)',
      'Độ phân giải: 768p (H3 Max, H3 Max Reference) · 480p (H3 Max 480p, H3 Max Reference 480p) · 1080p (các bản khác)',
      'Tỉ lệ: 9:16, 1:1, 16:9, 4:3, 3:4 (Reference (3 mức)) · 9:16, 1:1 (các bản khác)',
      'Ảnh: tối đa 9 (Reference (3 mức)) · 1 (các bản khác)',
    ]);
  });

  it('gives each video family card a prefix that matches its own models only', () => {
    const fams = ABOUT.create.sections.flatMap((s) => s.blocks ?? []).flatMap((b) => (typeof b === 'object' && 'cards' in b ? b.cards : [])).filter((c) => c.family);
    expect(fams.map((c) => c.family)).toEqual(['kling-', 'seedance-', 'flux-3', 'veo-', 'gemini-omni-flash', 'grok-imagine', 'wan-', 'minimax-']);
  });
});
