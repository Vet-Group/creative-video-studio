import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeFilters, libraryQuery, matchesVerdict, NO_FILTERS, readView, saveView, VIEW_KEY } from './library-view';

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
