// What a member has not seen yet in the changelog, and when the once-a-day popup is due (components/ChangelogPopup.tsx, the sidebar dot).
import type { ChangeEntry } from './changelog';
import { vnDay } from './lark-prompt';

/** The localStorage key that holds the `at` of the newest entry the member has seen. */
export const CHANGELOG_SEEN_KEY = 'cvs.changelog.seen';
/** The localStorage key that holds the Vietnam day the popup was last shown. */
export const CHANGELOG_POPUP_KEY = 'cvs.changelog.popup';
/** Fired on window when the seen mark changes, so the sidebar dot clears at once. */
export const CHANGELOG_SEEN_EVENT = 'cvs:changelog-seen';

const byNewest = (a: ChangeEntry, b: ChangeEntry) => Date.parse(b.at) - Date.parse(a.at);

/** The entries this member may read, newest first. PR numbers are for Admins only, so they are cut from a member's copy. */
export const visibleEntries = (entries: readonly ChangeEntry[], isAdmin: boolean): ChangeEntry[] =>
  entries
    .filter((e) => isAdmin || e.audience === 'all')
    .map((e) => (isAdmin ? e : { ...e, prs: [] }))
    .sort(byNewest);

/** The entries newer than the seen mark, newest first. No mark yet (a first visit) means nothing is unseen: the caller marks everything seen instead. */
export const unseenEntries = (entries: readonly ChangeEntry[], seen: string | null): ChangeEntry[] =>
  seen === null ? [] : entries.filter((e) => Date.parse(e.at) > Date.parse(seen)).sort(byNewest);

/** Whether the popup shows: something is unseen, it was not shown yet on `today` (a Vietnam day), and the Lark reminder is not taking this visit. */
export const changelogPopupDue = (o: { unseen: number; lastShown: string | null; today: string; larkDue: boolean }) => o.unseen > 0 && o.lastShown !== o.today && !o.larkDue;

/** The mark a first visit starts from: the start of the newest entry's Vietnam day, so that day's entries count as unseen (the dot announces them) and older history does not. */
export const firstVisitMark = (entries: readonly ChangeEntry[]): string => `${vnDay(new Date([...entries].sort(byNewest)[0]!.at))}T00:00:00+07:00`;

/** The seen mark, set by firstVisitMark when there is none yet; a first visit also counts as today's popup, so it shows the dot but never opens a dialog. A blocked storage reads as null each time, so nothing is ever unseen there. */
export function loadSeen(entries: readonly ChangeEntry[]): string | null {
  try {
    const seen = localStorage.getItem(CHANGELOG_SEEN_KEY);
    if (seen !== null || entries.length === 0) return seen;
    const first = firstVisitMark(entries);
    localStorage.setItem(CHANGELOG_SEEN_KEY, first);
    if (localStorage.getItem(CHANGELOG_POPUP_KEY) === null) localStorage.setItem(CHANGELOG_POPUP_KEY, vnDay(new Date()));
    return first;
  } catch {
    return null;
  }
}

/** Marks every entry up to the newest of `entries` as seen. */
export function markSeen(entries: readonly ChangeEntry[]) {
  if (entries.length === 0) return;
  try {
    localStorage.setItem(CHANGELOG_SEEN_KEY, [...entries].sort(byNewest)[0]!.at);
  } catch {} // storage blocked: the page still shows
  window.dispatchEvent(new Event(CHANGELOG_SEEN_EVENT));
}
