// The "updated DD/MM/YYYY" pill of an About page: the newest changelog entry for members whose `href` is the page's tool page.
// The (app) layout builds the map on the server from the changelog it already reads, so the browser gets one date per page rather than the changelog.
import type { ChangeEntry } from './changelog';

/** Each tool About page's own page; the Marketing Studio formats share theirs, as their changelog entries do. */
export const ABOUT_PATH = {
  create: '/create',
  tryOn: '/try-on',
  image: '/image-generation',
  marketing: '/marketing-studio',
  advanced: '/marketing-studio',
  unboxing: '/marketing-studio',
  review: '/marketing-studio',
  analyze: '/analyze',
} as const;
export type AboutKey = keyof typeof ABOUT_PATH;

/** The page an About page is about: a tool's (ABOUT_PATH) or an app's /apps/<slug>. */
export const aboutPath = (page?: AboutKey, app?: string): string | undefined => (page ? ABOUT_PATH[page] : app ? `/apps/${app}` : undefined);

/** Each page's newest member entry time, keyed by the page an entry's `href` names (its query string dropped); Admin-only entries do not count. */
export function pageUpdates(entries: readonly Pick<ChangeEntry, 'at' | 'href' | 'audience'>[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entries) {
    if (e.audience !== 'all' || !e.href) continue;
    const path = e.href.split('?')[0]!;
    const seen = out[path];
    if (seen === undefined || Date.parse(e.at) > Date.parse(seen)) out[path] = e.at;
  }
  return out;
}

const DAY = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
/** "Cập nhật 25/11/2026": the entry's day in Vietnam time. */
export const updatedLabel = (at: string): string => `Cập nhật ${DAY.format(new Date(at))}`;
