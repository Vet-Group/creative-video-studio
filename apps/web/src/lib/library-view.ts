// The Library page's filters as the /api/library query, how many of them narrow the list, the day groups, and the grid or list view remembered per browser.
import { BOARD_ID } from './library-boards';

/** The verdict filter: every item (''), the unmarked ones, any Pass (a featured one too), only featured, or Fail. */
export type VerdictFilter = '' | 'none' | 'pass' | 'featured' | 'fail';

export interface LibraryFilters {
  q: string;
  creator: string;
  /** A store id, or 'none' for items with no store; '' for any. */
  store: string;
  date: string;
  /** '1' (today), '7' or '30': the last days in Vietnam time; '' for any day. */
  days: '' | '1' | '7' | '30';
  ratio: string;
  kind: string;
  verdict: VerdictFilter;
  favoritesOnly: boolean;
  /** The id of one of the member's own boards (lib/library-boards.ts), or ''. */
  board: string;
  /** Only the results an Admin put on an Examples tab. */
  examplesOnly: boolean;
  /** Only the featured results not yet on an Examples tab, which an Admin may put there. */
  suggestedOnly: boolean;
  /** Also the results of system accounts, which the Library otherwise leaves out; the server honours it for an Admin only. It widens the list, so it is no filter to count or clear. */
  showSystem: boolean;
  sort: 'newest' | 'oldest';
}

export const NO_FILTERS: LibraryFilters = { q: '', creator: '', store: '', date: '', days: '', ratio: '', kind: 'all', verdict: '', favoritesOnly: false, board: '', examplesOnly: false, suggestedOnly: false, showSystem: false, sort: 'newest' };

/** A refresh of the first page onto the list shown: the items not yet there go on top (newest first), so pages loaded since and the scroll position stay;
 * an item shown that is on the fresh page takes its fresh copy (a mark or a final cost set meanwhile). */
export function mergeFresh<T extends { id: string }>(cur: T[], fresh: T[]): T[] {
  const byId = new Map(fresh.map((c) => [c.id, c]));
  const have = new Set(cur.map((c) => c.id));
  return [...fresh.filter((c) => !have.has(c.id)), ...cur.map((c) => byId.get(c.id) ?? c)];
}

/** Whether an item with this mark belongs under the verdict filter, so a fresh mark can take it out of the list. */
export function matchesVerdict(filter: VerdictFilter, mark: { verdict: 'pass' | 'fail'; featured: boolean } | null): boolean {
  if (filter === '') return true;
  if (filter === 'none') return mark === null;
  if (filter === 'featured') return mark?.featured === true;
  return mark?.verdict === filter;
}

/** The /api/library query for these filters and a page offset; a default is left out. */
export function libraryQuery(f: LibraryFilters, offset: number): string {
  const q = new URLSearchParams();
  if (f.q.trim()) q.set('q', f.q.trim());
  if (f.creator) q.set('creator', f.creator);
  if (f.store) q.set('store', f.store);
  if (f.date) q.set('date', f.date);
  if (f.days) q.set('days', f.days);
  if (f.ratio) q.set('ratio', f.ratio);
  if (f.kind !== 'all') q.set('kind', f.kind);
  if (f.verdict) q.set('verdict', f.verdict);
  if (f.favoritesOnly) q.set('favorites', '1');
  if (f.board) q.set('board', f.board);
  if (f.examplesOnly) q.set('example', '1');
  if (f.suggestedOnly) q.set('suggested', '1');
  if (f.showSystem) q.set('system', '1');
  if (f.sort !== 'newest') q.set('sort', f.sort);
  if (offset > 0) q.set('offset', String(offset));
  return q.toString();
}

/** The filters carried in the Library URL, read back from its query so a shared or bookmarked link reopens the same view; offset and item are ignored. The inverse of libraryQuery. */
export function filtersFromParams(p: URLSearchParams): LibraryFilters {
  const days = p.get('days');
  const verdict = p.get('verdict');
  const board = p.get('board') ?? '';
  return {
    q: p.get('q') ?? '',
    creator: p.get('creator') ?? '',
    store: p.get('store') ?? '',
    date: p.get('date') ?? '',
    days: days === '1' || days === '7' || days === '30' ? days : '',
    ratio: p.get('ratio') ?? '',
    kind: p.get('kind') ?? 'all',
    verdict: verdict === 'none' || verdict === 'pass' || verdict === 'featured' || verdict === 'fail' ? verdict : '',
    favoritesOnly: p.get('favorites') === '1',
    board: BOARD_ID.test(board) ? board : '', // a mangled link opens the whole Library, not a permanent error
    examplesOnly: p.get('example') === '1',
    suggestedOnly: p.get('suggested') === '1',
    showSystem: p.get('system') === '1',
    sort: p.get('sort') === 'oldest' ? 'oldest' : 'newest',
  };
}

/** The same read from what a server page gets as `searchParams` (a repeated key counts once, first wins), so the server and the first client render start from the same filters. */
export function filtersFromSearch(search: Record<string, string | string[] | undefined>): LibraryFilters {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) for (const x of [v ?? []].flat()) p.append(k, x);
  return filtersFromParams(p);
}

/** How many filters narrow the list; the sort only orders it, so it is not one. */
export const activeFilters = (f: LibraryFilters): number => [f.q.trim(), f.creator, f.store, f.date, f.days, f.ratio, f.kind !== 'all', f.verdict, f.favoritesOnly, f.board, f.examplesOnly, f.suggestedOnly].filter(Boolean).length;

/** Which filter a chip removes; date and days share one chip since the UI never sets both. */
export type ChipKey = 'q' | 'creator' | 'store' | 'date' | 'days' | 'ratio' | 'kind' | 'verdict' | 'favoritesOnly' | 'board' | 'examplesOnly' | 'suggestedOnly';

/** The store filter's option, and its chip, for items with no store. */
export const NO_STORE = 'Không gắn cửa hàng';
const DAYS_LABEL: Record<string, string> = { '1': 'Hôm nay', '7': '7 ngày qua', '30': '30 ngày qua' };
const VERDICT_LABEL: Record<Exclude<VerdictFilter, ''>, string> = { none: 'Chưa chấm', pass: 'Đạt', featured: 'Nổi bật', fail: 'Không đạt' };

/** The active filters as removable chips, in the order of the filter bar. creator, store and kind read as labels, not raw values, so the page passes the names it already shows (`board`: '' while the boards load, undefined for an id that is not one of the caller's). */
export function activeFilterChips(f: LibraryFilters, names: { creator?: string; store?: string; kind?: string; board?: string } = {}): { key: ChipKey; label: string }[] {
  const chips: { key: ChipKey; label: string }[] = [];
  if (f.q.trim()) chips.push({ key: 'q', label: `Tìm: ${f.q.trim()}` });
  if (f.board) chips.push({ key: 'board', label: names.board === '' ? 'Bảng' : `Bảng: ${names.board ?? 'không tìm thấy'}` });
  if (f.creator) chips.push({ key: 'creator', label: `Người tạo: ${names.creator ?? f.creator}` });
  if (f.store) chips.push({ key: 'store', label: `Cửa hàng: ${f.store === 'none' ? NO_STORE : (names.store ?? f.store)}` });
  if (f.date) chips.push({ key: 'date', label: `Ngày: ${f.date.split('-').reverse().join('/')}` });
  else if (f.days) chips.push({ key: 'days', label: DAYS_LABEL[f.days] ?? f.days });
  if (f.ratio) chips.push({ key: 'ratio', label: `Tỉ lệ: ${f.ratio}` });
  if (f.kind !== 'all') chips.push({ key: 'kind', label: names.kind ?? f.kind });
  if (f.verdict) chips.push({ key: 'verdict', label: `Kết quả: ${VERDICT_LABEL[f.verdict]}` });
  if (f.favoritesOnly) chips.push({ key: 'favoritesOnly', label: 'Yêu thích' });
  if (f.examplesOnly) chips.push({ key: 'examplesOnly', label: 'Đang ở Ví dụ' });
  if (f.suggestedOnly) chips.push({ key: 'suggestedOnly', label: 'Gợi ý làm ví dụ' });
  return chips;
}

export type LibraryView = 'grid' | 'list';
export const VIEW_KEY = 'cvs.library.view';

/** The remembered view; blocked storage or any other value is the grid. */
export function readView(): LibraryView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export function saveView(view: LibraryView): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {} // blocked storage: the view lasts for this visit
}

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/**
 * The items as runs of one day in the viewer's time zone (or `timeZone`), each under its heading: Hôm nay, Hôm qua, else the weekday and day/month, with the year when it is not this one, as fash.studio's Library groups.
 * One pass over the items as loaded, so a page that goes on with the last day adds to its run; `start` is the run's first index in `items`.
 */
export function dayGroups<T extends { createdAt: string }>(items: T[], now = new Date(), timeZone?: string): { day: string; label: string; start: number; items: T[] }[] {
  const dayOf = new Intl.DateTimeFormat('sv-SE', { timeZone }).format; // YYYY-MM-DD
  const today = dayOf(now);
  const [y, m, d] = today.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y!, m! - 1, d! - 1)).toISOString().slice(0, 10);
  const label = (day: string) => {
    if (day === today) return 'Hôm nay';
    if (day === yesterday) return 'Hôm qua';
    const [yyyy, mm, dd] = day.split('-');
    return `${WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]}, ${dd}/${mm}${Number(yyyy) === y ? '' : `/${yyyy}`}`;
  };
  const groups: { day: string; label: string; start: number; items: T[] }[] = [];
  items.forEach((it, i) => {
    const day = dayOf(new Date(it.createdAt));
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(it);
    else groups.push({ day, label: label(day), start: i, items: [it] });
  });
  return groups;
}
