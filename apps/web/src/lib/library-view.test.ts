import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeFilterChips, activeFilters, dayGroups, filtersFromParams, libraryQuery, matchesVerdict, mergeFresh, NO_FILTERS, readView, saveView, VIEW_KEY } from './library-view';

describe('libraryQuery', () => {
  it('leaves the defaults out', () => {
    expect(libraryQuery(NO_FILTERS, 0)).toBe('');
  });

  it('sends every filter, the trimmed words, the sort and the offset', () => {
    const q = new URLSearchParams(libraryQuery({ q: '  áo  khoác ', creator: 'u1', store: 's1', date: '2026-10-23', days: '7', ratio: '1:1', kind: 'images', verdict: 'none', favoritesOnly: true, examplesOnly: true, suggestedOnly: true, sort: 'oldest' }, 24));
    expect(Object.fromEntries(q)).toEqual({ q: 'áo  khoác', creator: 'u1', store: 's1', date: '2026-10-23', days: '7', ratio: '1:1', kind: 'images', verdict: 'none', favorites: '1', example: '1', suggested: '1', sort: 'oldest', offset: '24' });
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
    const f = { q: 'áo khoác', creator: 'u1', store: 'none', date: '2026-10-23', days: '7' as const, ratio: '1:1', kind: 'images', verdict: 'none' as const, favoritesOnly: true, examplesOnly: true, suggestedOnly: true, sort: 'oldest' as const };
    expect(filtersFromParams(new URLSearchParams(libraryQuery(f, 0)))).toEqual(f);
  });

  it('keeps the kind of one app through the address', () => {
    const f = { ...NO_FILTERS, kind: 'background_changer', sort: 'oldest' as const };
    const query = libraryQuery(f, 0);
    expect(query).toBe('kind=background_changer&sort=oldest');
    expect(filtersFromParams(new URLSearchParams(query))).toEqual(f);
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
    expect(activeFilters({ q: 'x', creator: 'u1', store: 's1', date: '2026-10-23', days: '30', ratio: '9:16', kind: 'apps', verdict: 'pass', favoritesOnly: true, examplesOnly: true, suggestedOnly: true, sort: 'newest' })).toBe(11);
    expect(activeFilters({ ...NO_FILTERS, store: 'none' })).toBe(1);
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

describe('activeFilterChips', () => {
  it('has no chip when nothing is filtered', () => {
    expect(activeFilterChips(NO_FILTERS)).toEqual([]);
  });
  it('one chip per active filter, in bar order, with the passed creator, store and kind names', () => {
    const chips = activeFilterChips(
      { ...NO_FILTERS, q: ' áo ', creator: 'u1', store: 's1', days: '7', ratio: '9:16', kind: 'video', verdict: 'featured', favoritesOnly: true, examplesOnly: true, suggestedOnly: true },
      { creator: 'An', store: 'Cửa hàng A', kind: 'Tạo video' },
    );
    expect(chips).toEqual([
      { key: 'q', label: 'Tìm: áo' },
      { key: 'creator', label: 'Người tạo: An' },
      { key: 'store', label: 'Cửa hàng: Cửa hàng A' },
      { key: 'days', label: '7 ngày qua' },
      { key: 'ratio', label: 'Tỉ lệ: 9:16' },
      { key: 'kind', label: 'Tạo video' },
      { key: 'verdict', label: 'Kết quả: Nổi bật' },
      { key: 'favoritesOnly', label: 'Yêu thích' },
      { key: 'examplesOnly', label: 'Đang ở Ví dụ' },
      { key: 'suggestedOnly', label: 'Gợi ý làm ví dụ' },
    ]);
  });
  it('the store filter for items with no store reads as its option, whatever name is passed', () => {
    expect(activeFilterChips({ ...NO_FILTERS, store: 'none' }, { store: 'x' })).toEqual([{ key: 'store', label: 'Cửa hàng: Không gắn cửa hàng' }]);
  });
  it('a picked date wins over days and reads day/month/year', () => {
    expect(activeFilterChips({ ...NO_FILTERS, date: '2026-11-09', days: '30' })).toEqual([{ key: 'date', label: 'Ngày: 09/11/2026' }]);
  });
  it('shows the name of one app for its kind', () => {
    expect(activeFilterChips({ ...NO_FILTERS, kind: 'background_changer' }, { kind: 'Đổi nền' })).toEqual([{ key: 'kind', label: 'Đổi nền' }]);
  });
  it('falls back to the raw value when no name is passed', () => {
    expect(activeFilterChips({ ...NO_FILTERS, creator: 'u1', store: 's1', kind: 'video' })).toEqual([
      { key: 'creator', label: 'Người tạo: u1' },
      { key: 'store', label: 'Cửa hàng: s1' },
      { key: 'kind', label: 'video' },
    ]);
  });
});

describe('dayGroups', () => {
  const now = new Date('2026-11-12T16:00:00+07:00');
  const VN = 'Asia/Ho_Chi_Minh';
  const at = (iso: string) => ({ createdAt: iso });
  const view = (groups: ReturnType<typeof dayGroups>) => groups.map((g) => [g.label, g.start, g.items.length]);
  it('labels today, yesterday, an earlier day this year with its weekday, and another year with the year', () => {
    const items = [at('2026-11-12T09:00:00+07:00'), at('2026-11-12T00:30:00+07:00'), at('2026-11-11T23:59:00+07:00'), at('2026-11-09T10:00:00+07:00'), at('2025-12-31T10:00:00+07:00')];
    expect(view(dayGroups(items, now, VN))).toEqual([
      ['Hôm nay', 0, 2],
      ['Hôm qua', 2, 1],
      ['Thứ Hai, 09/11', 3, 1],
      ['Thứ Tư, 31/12/2025', 4, 1],
    ]);
  });
  it('groups oldest first too, and keeps one heading for a list of one day', () => {
    const items = [at('2026-11-11T08:00:00+07:00'), at('2026-11-12T08:00:00+07:00'), at('2026-11-12T09:00:00+07:00')];
    expect(view(dayGroups(items, now, VN))).toEqual([['Hôm qua', 0, 1], ['Hôm nay', 1, 2]]);
    expect(view(dayGroups(items.slice(1), now, VN))).toEqual([['Hôm nay', 0, 2]]);
    expect(dayGroups([], now, VN)).toEqual([]);
  });
  it("splits days at the viewer's midnight, not UTC's", () => {
    // 17:30 UTC on 11 November is past midnight in Vietnam (UTC+7) but still the morning of the 11th in Los Angeles.
    const items = [at('2026-11-11T17:30:00Z'), at('2026-11-11T16:30:00Z')];
    expect(view(dayGroups(items, now, VN))).toEqual([['Hôm nay', 0, 1], ['Hôm qua', 1, 1]]);
    expect(view(dayGroups(items, now, 'America/Los_Angeles'))).toEqual([['Hôm qua', 0, 2]]);
  });
  it('counts yesterday by the calendar across a month and a year', () => {
    expect(dayGroups([at('2025-12-31T12:00:00+07:00')], new Date('2026-01-01T08:00:00+07:00'), VN)[0]!.label).toBe('Hôm qua');
  });
  it('continues the last day when the next page starts on it', () => {
    const page1 = [at('2026-11-12T09:00:00+07:00'), at('2026-11-11T09:00:00+07:00')];
    const page2 = [at('2026-11-11T08:00:00+07:00'), at('2026-11-10T08:00:00+07:00')];
    expect(view(dayGroups([...page1, ...page2], now, VN))).toEqual([['Hôm nay', 0, 1], ['Hôm qua', 1, 2], ['Thứ Ba, 10/11', 3, 1]]);
  });
});

describe('mergeFresh', () => {
  const item = (id: string) => ({ id });
  it('puts the items not yet shown on top and keeps the pages already loaded', () => {
    const cur = [item('c'), item('b'), item('a')];
    expect(mergeFresh(cur, [item('e'), item('d'), item('c')])).toEqual([item('e'), item('d'), item('c'), item('b'), item('a')]);
  });

  it('adds nothing when the first page has nothing new, and takes the fresh copy of an item shown', () => {
    const cur = [item('c'), item('b')];
    expect(mergeFresh(cur, [item('c'), item('b')])).toEqual(cur);
    const marked = [{ id: 'c', verdict: null as string | null }, { id: 'b', verdict: null as string | null }];
    expect(mergeFresh(marked, [{ id: 'c', verdict: 'pass' }])).toEqual([{ id: 'c', verdict: 'pass' }, { id: 'b', verdict: null }]);
    expect(mergeFresh(cur, [])).toEqual(cur);
  });

  it('fills an empty list', () => {
    expect(mergeFresh([], [item('b'), item('a')])).toEqual([item('b'), item('a')]);
  });
});
