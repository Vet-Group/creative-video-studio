import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeFilters, dayHeadings, filtersFromParams, libraryQuery, matchesVerdict, NO_FILTERS, readView, saveView, VIEW_KEY } from './library-view';

describe('libraryQuery', () => {
  it('leaves the defaults out', () => {
    expect(libraryQuery(NO_FILTERS, 0)).toBe('');
  });

  it('sends every filter, the trimmed words, the sort and the offset', () => {
    const q = new URLSearchParams(libraryQuery({ q: '  áo  khoác ', creator: 'u1', date: '2026-10-23', days: '7', ratio: '1:1', kind: 'images', verdict: 'none', favoritesOnly: true, examplesOnly: true, sort: 'oldest' }, 24));
    expect(Object.fromEntries(q)).toEqual({ q: 'áo  khoác', creator: 'u1', date: '2026-10-23', days: '7', ratio: '1:1', kind: 'images', verdict: 'none', favorites: '1', example: '1', sort: 'oldest', offset: '24' });
  });

  it('drops blank words', () => {
    expect(libraryQuery({ ...NO_FILTERS, q: '   ' }, 0)).toBe('');
  });
});

describe('filtersFromParams', () => {
  it('reads nothing back as the defaults', () => {
    expect(filtersFromParams(new URLSearchParams(''))).toEqual(NO_FILTERS);
  });

  it('round-trips every filter through libraryQuery', () => {
    const f = { q: 'áo khoác', creator: 'u1', date: '2026-10-23', days: '7' as const, ratio: '1:1', kind: 'images', verdict: 'none' as const, favoritesOnly: true, examplesOnly: true, sort: 'oldest' as const };
    expect(filtersFromParams(new URLSearchParams(libraryQuery(f, 0)))).toEqual(f);
  });

  it('ignores offset and the item deep link, and falls back on unknown values', () => {
    const p = new URLSearchParams('q=hoa&offset=48&item=abc&days=weird&verdict=bogus&sort=weird');
    expect(filtersFromParams(p)).toEqual({ ...NO_FILTERS, q: 'hoa' });
  });
});

describe('activeFilters', () => {
  it('counts the filters that narrow the list, not the sort', () => {
    expect(activeFilters(NO_FILTERS)).toBe(0);
    expect(activeFilters({ ...NO_FILTERS, sort: 'oldest', q: ' ' })).toBe(0);
    expect(activeFilters({ ...NO_FILTERS, kind: 'videos' })).toBe(1);
    expect(activeFilters({ ...NO_FILTERS, verdict: 'fail' })).toBe(1);
    expect(activeFilters({ q: 'x', creator: 'u1', date: '2026-10-23', days: '30', ratio: '9:16', kind: 'apps', verdict: 'pass', favoritesOnly: true, examplesOnly: true, sort: 'newest' })).toBe(9);
  });
});

describe('matchesVerdict', () => {
  const pass = { verdict: 'pass' as const, featured: false };
  const featured = { verdict: 'pass' as const, featured: true };
  const fail = { verdict: 'fail' as const, featured: false };
  it('keeps every item without the filter, and sorts the marks under each choice', () => {
    for (const mark of [null, pass, featured, fail]) expect(matchesVerdict('', mark)).toBe(true);
    expect([null, pass, featured, fail].map((m) => matchesVerdict('none', m))).toEqual([true, false, false, false]);
    expect([null, pass, featured, fail].map((m) => matchesVerdict('pass', m))).toEqual([false, true, true, false]); // a featured item is a Pass too
    expect([null, pass, featured, fail].map((m) => matchesVerdict('featured', m))).toEqual([false, false, true, false]);
    expect([null, pass, featured, fail].map((m) => matchesVerdict('fail', m))).toEqual([false, false, false, true]);
  });
});

describe('the remembered view', () => {
  afterEach(() => vi.unstubAllGlobals());
  const storage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), map: m };
  };

  it('is the grid until list is saved, and list after', () => {
    const s = storage();
    vi.stubGlobal('localStorage', s);
    expect(readView()).toBe('grid');
    saveView('list');
    expect(s.map.get(VIEW_KEY)).toBe('list');
    expect(readView()).toBe('list');
    saveView('grid');
    expect(readView()).toBe('grid');
  });

  it('reads an unknown value as the grid', () => {
    const s = storage();
    s.map.set(VIEW_KEY, 'tiles');
    vi.stubGlobal('localStorage', s);
    expect(readView()).toBe('grid');
  });

  it('survives blocked storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readView()).toBe('grid');
    expect(() => saveView('list')).not.toThrow();
  });
});

describe('dayHeadings', () => {
  const now = new Date('2026-11-12T16:00:00+07:00');
  const at = (iso: string) => ({ createdAt: iso });
  it('puts a heading before the first item of each Vietnam day, newest first or oldest first', () => {
    const items = [at('2026-11-12T09:00:00+07:00'), at('2026-11-12T00:30:00+07:00'), at('2026-11-11T23:59:00+07:00'), at('2026-11-09T10:00:00+07:00')];
    expect([...dayHeadings(items, now)]).toEqual([
      [0, 'Hôm nay'],
      [2, 'Hôm qua'],
      [3, new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date('2026-11-09T10:00:00+07:00')).replace(/^./, (c) => c.toUpperCase())],
    ]);
    expect([...dayHeadings([...items].reverse(), now).keys()]).toEqual([0, 1, 2]);
  });
  it('counts a UTC evening as the next Vietnam day', () => {
    expect([...dayHeadings([at('2026-11-11T18:00:00Z'), at('2026-11-11T16:00:00Z')], now)]).toEqual([[0, 'Hôm nay'], [1, 'Hôm qua']]);
  });
  it('adds no heading when every item is from one day, or there is none', () => {
    expect(dayHeadings([at('2026-11-12T09:00:00+07:00'), at('2026-11-12T08:00:00+07:00')], now).size).toBe(0);
    expect(dayHeadings([], now).size).toBe(0);
  });
});
