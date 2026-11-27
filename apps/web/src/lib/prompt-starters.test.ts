import { describe, expect, it } from 'vitest';
import { endingLine, hookLine, MAX_ENDING, MAX_HOOK } from './marketing';
import { isProductType } from './product-types';
import { inSeason, MOTION_KINDS, PROMPT_TEMPLATES, STARTERS, suits } from './prompt-starters';
import { sampleType } from './samples';

describe('inSeason', () => {
  const list = [{ label: 'a', text: 'a' }, { label: 'x', text: 'x', holiday: true as const }, { label: 'b', text: 'b' }];
  it('puts the holiday chips first from 15 November to 31 December in Vietnam, and leaves them out otherwise', () => {
    expect(inSeason(list, new Date('2026-11-14T23:59:00+07:00')).map((s) => s.label)).toEqual(['a', 'b']);
    expect(inSeason(list, new Date('2026-11-14T17:30:00Z')).map((s) => s.label)).toEqual(['x', 'a', 'b']); // already 15 November in Vietnam
    expect(inSeason(list, new Date('2026-12-31T23:00:00+07:00')).map((s) => s.label)).toEqual(['x', 'a', 'b']);
    expect(inSeason(list, new Date('2027-01-01T00:00:00+07:00')).map((s) => s.label)).toEqual(['a', 'b']);
  });
  it('gives the image, try-on and background changer rows holiday chips', () => {
    for (const k of ['image', 'try_on', 'background_changer']) expect(STARTERS[k]!.some((s) => s.holiday)).toBe(true);
  });
});

describe('STARTERS', () => {
  it.each(Object.entries(STARTERS))('%s: uniquely labelled chips with a Vietnamese label and English text', (_, list) => {
    expect(new Set(list.map((s) => s.label)).size).toBe(list.length);
    expect(new Set(list.map((s) => s.text)).size).toBe(list.length);
    for (const s of list) {
      expect(s.label.length).toBeLessThanOrEqual(20); // one chip in the scrolling row
      expect(s.text).not.toMatch(/[À-ỹ]/); // the image models read English best
    }
  });
});

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

describe('PROMPT_TEMPLATES ids', () => {
  it('gives every template a unique kebab slug that is a valid sample name, and a short Vietnamese needs note only where set', () => {
    const all = Object.values(PROMPT_TEMPLATES).flat();
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
    for (const t of all) {
      expect(t.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      for (const ext of ['mp4', 'jpg']) expect(sampleType(`template-${t.id}.${ext}`)).not.toBeNull();
      if (t.needs !== undefined) {
        expect(t.needs).toMatch(/[À-ỹ]/);
        expect(t.needs.length).toBeLessThanOrEqual(60);
      }
    }
  });
});

describe('PROMPT_TEMPLATES across pages', () => {
  it('names the templates of each Marketing Studio format and never offers one template on two pages', () => {
    expect(PROMPT_TEMPLATES.marketing.map((t) => t.name)).toEqual(['Trước / sau', 'Cận chất liệu', 'Phối đồ', 'Quay bằng điện thoại', 'Dừng lướt', 'Phản ứng bất ngờ', 'Chỉ là cái hoodie', 'Cún nhà mình']);
    expect(PROMPT_TEMPLATES.advanced.map((t) => t.name)).toEqual(['Giới thiệu nhanh', 'Một ngày cùng sản phẩm', 'Vấn đề và giải pháp', 'Phim quảng cáo ngắn', 'Món quà', 'Dạo phố']);
    expect(PROMPT_TEMPLATES.unboxing.map((t) => t.name)).toEqual(['Hộp quà', 'POV tay', 'Mở nhanh ASMR', 'Hàng vừa giao', 'Nhiều đơn một lần', 'Tối giản']);
    expect(PROMPT_TEMPLATES.review.map((t) => t.name)).toEqual(['Review thật', 'Ưu và nhược', 'Mặc cả ngày', 'Trả lời bình luận', 'So với đồ cũ', 'Thử size']);
    const all = Object.values(PROMPT_TEMPLATES).flat();
    for (const key of ['name', 'hook', 'body', 'ending'] as const) expect(new Set(all.map((t) => t[key])).size).toBe(all.length);
  });
});


describe('motion packs (Create templates by product type)', () => {
  const video = PROMPT_TEMPLATES.video;
  it('tags only Create templates, with real product types, each covered by a type chip', () => {
    for (const t of Object.values(PROMPT_TEMPLATES).flat()) if (!video.includes(t)) expect(t.types).toBeUndefined();
    const chipTypes = MOTION_KINDS.flatMap((k) => k.types);
    for (const t of video) for (const type of t.types ?? []) (expect(isProductType(type)).toBe(true), expect(chipTypes).toContain(type));
  });
  it('gives every chip a motion of its own beside the ones for any product', () => {
    for (const k of MOTION_KINDS) expect(video.some((t) => t.types && suits(t, k.types))).toBe(true);
    expect(new Set(MOTION_KINDS.map((k) => k.label)).size).toBe(MOTION_KINDS.length);
  });
  it('shows an untyped template under every chip and a typed one only under its own', () => {
    const mug = MOTION_KINDS.find((k) => k.label === 'Cốc, tumbler')!.types;
    expect(suits(video.find((t) => t.id === 'xoay-360')!, mug)).toBe(true);
    expect(suits(video.find((t) => t.id === 'coc-boc-hoi')!, mug)).toBe(true);
    expect(suits(video.find((t) => t.id === 'treo-moc')!, mug)).toBe(false);
  });
});
