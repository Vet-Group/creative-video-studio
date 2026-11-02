// The Library page's filters as the /api/library query, how many of them narrow the list, and the grid or list view remembered per browser.

export interface LibraryFilters {
  q: string;
  creator: string;
  date: string;
  ratio: string;
  kind: string;
  favoritesOnly: boolean;
  sort: 'newest' | 'oldest';
}

export const NO_FILTERS: LibraryFilters = { q: '', creator: '', date: '', ratio: '', kind: 'all', favoritesOnly: false, sort: 'newest' };

/** The /api/library query for these filters and a page offset; a default is left out. */
export function libraryQuery(f: LibraryFilters, offset: number): string {
  const q = new URLSearchParams();
  if (f.q.trim()) q.set('q', f.q.trim());
  if (f.creator) q.set('creator', f.creator);
  if (f.date) q.set('date', f.date);
  if (f.ratio) q.set('ratio', f.ratio);
  if (f.kind !== 'all') q.set('kind', f.kind);
  if (f.favoritesOnly) q.set('favorites', '1');
  if (f.sort !== 'newest') q.set('sort', f.sort);
  if (offset > 0) q.set('offset', String(offset));
  return q.toString();
}

/** How many filters narrow the list; the sort only orders it, so it is not one. */
export const activeFilters = (f: LibraryFilters): number => [f.q.trim(), f.creator, f.date, f.ratio, f.kind !== 'all', f.favoritesOnly].filter(Boolean).length;

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
