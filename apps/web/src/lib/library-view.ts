// The Library page's filters as the /api/library query, how many of them narrow the list, the day headings, and the grid or list view remembered per browser.
import { vnDay } from './lark-prompt';

/** The verdict filter: every item (''), the unmarked ones, any Pass (a featured one too), only featured, or Fail. */
export type VerdictFilter = '' | 'none' | 'pass' | 'featured' | 'fail';

export interface LibraryFilters {
  q: string;
  creator: string;
  date: string;
  /** '1' (today), '7' or '30': the last days in Vietnam time; '' for any day. */
  days: '' | '1' | '7' | '30';
  ratio: string;
  kind: string;
  verdict: VerdictFilter;
  favoritesOnly: boolean;
  /** Only the results an Admin put on an Examples tab. */
  examplesOnly: boolean;
  sort: 'newest' | 'oldest';
}

export const NO_FILTERS: LibraryFilters = { q: '', creator: '', date: '', days: '', ratio: '', kind: 'all', verdict: '', favoritesOnly: false, examplesOnly: false, sort: 'newest' };

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
  if (f.date) q.set('date', f.date);
  if (f.days) q.set('days', f.days);
  if (f.ratio) q.set('ratio', f.ratio);
  if (f.kind !== 'all') q.set('kind', f.kind);
  if (f.verdict) q.set('verdict', f.verdict);
  if (f.favoritesOnly) q.set('favorites', '1');
  if (f.examplesOnly) q.set('example', '1');
  if (f.sort !== 'newest') q.set('sort', f.sort);
  if (offset > 0) q.set('offset', String(offset));
  return q.toString();
}

/** The filters carried in the Library URL, read back from its query so a shared or bookmarked link reopens the same view; offset and item are ignored. The inverse of libraryQuery. */
export function filtersFromParams(p: URLSearchParams): LibraryFilters {
  const days = p.get('days');
  const verdict = p.get('verdict');
  return {
    q: p.get('q') ?? '',
    creator: p.get('creator') ?? '',
    date: p.get('date') ?? '',
    days: days === '1' || days === '7' || days === '30' ? days : '',
    ratio: p.get('ratio') ?? '',
    kind: p.get('kind') ?? 'all',
    verdict: verdict === 'none' || verdict === 'pass' || verdict === 'featured' || verdict === 'fail' ? verdict : '',
    favoritesOnly: p.get('favorites') === '1',
    examplesOnly: p.get('example') === '1',
    sort: p.get('sort') === 'oldest' ? 'oldest' : 'newest',
  };
}

/** How many filters narrow the list; the sort only orders it, so it is not one. */
export const activeFilters = (f: LibraryFilters): number => [f.q.trim(), f.creator, f.date, f.days, f.ratio, f.kind !== 'all', f.verdict, f.favoritesOnly, f.examplesOnly].filter(Boolean).length;

/** Which filter a chip removes; date and days share one chip since the UI never sets both. */
export type ChipKey = 'q' | 'creator' | 'date' | 'days' | 'ratio' | 'kind' | 'verdict' | 'favoritesOnly' | 'examplesOnly';

const DAYS_LABEL: Record<string, string> = { '1': 'Hôm nay', '7': '7 ngày qua', '30': '30 ngày qua' };
const VERDICT_LABEL: Record<Exclude<VerdictFilter, ''>, string> = { none: 'Chưa chấm', pass: 'Đạt', featured: 'Nổi bật', fail: 'Không đạt' };

/** The active filters as removable chips, in the order of the filter bar. creator and kind read as labels, not raw values, so the page passes the names it already shows. */
export function activeFilterChips(f: LibraryFilters, names: { creator?: string; kind?: string } = {}): { key: ChipKey; label: string }[] {
  const chips: { key: ChipKey; label: string }[] = [];
  if (f.q.trim()) chips.push({ key: 'q', label: `Tìm: ${f.q.trim()}` });
  if (f.creator) chips.push({ key: 'creator', label: `Người tạo: ${names.creator ?? f.creator}` });
  if (f.date) chips.push({ key: 'date', label: `Ngày: ${f.date.split('-').reverse().join('/')}` });
  else if (f.days) chips.push({ key: 'days', label: DAYS_LABEL[f.days] ?? f.days });
  if (f.ratio) chips.push({ key: 'ratio', label: `Tỉ lệ: ${f.ratio}` });
  if (f.kind !== 'all') chips.push({ key: 'kind', label: names.kind ?? f.kind });
  if (f.verdict) chips.push({ key: 'verdict', label: `Kết quả: ${VERDICT_LABEL[f.verdict]}` });
  if (f.favoritesOnly) chips.push({ key: 'favoritesOnly', label: 'Yêu thích' });
  if (f.examplesOnly) chips.push({ key: 'examplesOnly', label: 'Đang ở Ví dụ' });
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

/**
 * The day heading before each item that starts a new Vietnam day, keyed by the item's index (today, yesterday, else the weekday and date), as ComfyUI's job list groups by day.
 * A list that is all one day gets none: a single heading would add nothing.
 */
export function dayHeadings(items: { createdAt: string }[], now = new Date()): Map<number, string> {
  const days = items.map((it) => vnDay(new Date(it.createdAt)));
  const out = new Map<number, string>();
  if (new Set(days).size < 2) return out;
  const today = vnDay(now);
  const yesterday = vnDay(new Date(now.getTime() - 86_400_000));
  const long = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
  days.forEach((d, i) => {
    if (i > 0 && d === days[i - 1]) return;
    const label = d === today ? 'Hôm nay' : d === yesterday ? 'Hôm qua' : long.format(new Date(items[i]!.createdAt));
    out.set(i, label[0]!.toUpperCase() + label.slice(1));
  });
  return out;
}
