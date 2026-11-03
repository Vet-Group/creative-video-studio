// The Library page's filters as the /api/library query, how many of them narrow the list, and the grid or list view remembered per browser.

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
  sort: 'newest' | 'oldest';
}

export const NO_FILTERS: LibraryFilters = { q: '', creator: '', date: '', days: '', ratio: '', kind: 'all', verdict: '', favoritesOnly: false, sort: 'newest' };

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
  if (f.sort !== 'newest') q.set('sort', f.sort);
  if (offset > 0) q.set('offset', String(offset));
  return q.toString();
}

/** How many filters narrow the list; the sort only orders it, so it is not one. */
export const activeFilters = (f: LibraryFilters): number => [f.q.trim(), f.creator, f.date, f.days, f.ratio, f.kind !== 'all', f.verdict, f.favoritesOnly].filter(Boolean).length;

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
