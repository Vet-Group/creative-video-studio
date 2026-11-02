import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeFilters, libraryQuery, NO_FILTERS, readView, saveView, VIEW_KEY } from './library-view';

describe('libraryQuery', () => {
  it('leaves the defaults out', () => {
    expect(libraryQuery(NO_FILTERS, 0)).toBe('');
  });

  it('sends every filter, the trimmed words, the sort and the offset', () => {
    const q = new URLSearchParams(libraryQuery({ q: '  áo  khoác ', creator: 'u1', date: '2026-10-23', ratio: '1:1', kind: 'images', favoritesOnly: true, sort: 'oldest' }, 24));
    expect(Object.fromEntries(q)).toEqual({ q: 'áo  khoác', creator: 'u1', date: '2026-10-23', ratio: '1:1', kind: 'images', favorites: '1', sort: 'oldest', offset: '24' });
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
    expect(activeFilters({ q: 'x', creator: 'u1', date: '2026-10-23', ratio: '9:16', kind: 'apps', favoritesOnly: true, sort: 'newest' })).toBe(6);
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
