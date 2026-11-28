// What a member has not seen yet in the changelog, and when the once-a-day popup is due (components/ChangelogPopup.tsx, the sidebar dot).
import type { ChangeEntry } from './changelog';
import { vnDay } from './lark-prompt';

/** The localStorage key that holds a JSON array of the `at` of the entries seen after the floor. */
export const CHANGELOG_SEEN_IDS_KEY = 'cvs.changelog.seenIds';
/** The localStorage key that holds the floor: entries at or before this time count as seen (history from before the per-entry state began). */
export const CHANGELOG_SEEN_FLOOR_KEY = 'cvs.changelog.seenFloor';
/** The older key, the `at` of the newest entry seen: read once to set the floor, and still written so a rollback behaves. */
export const CHANGELOG_SEEN_KEY = 'cvs.changelog.seen';
/** The localStorage key that holds the Vietnam day the popup was last shown. */
export const CHANGELOG_POPUP_KEY = 'cvs.changelog.popup';
/** Fired on window when the seen set changes, so the sidebar dot clears at once. */
export const CHANGELOG_SEEN_EVENT = 'cvs:changelog-seen';

const byNewest = (a: ChangeEntry, b: ChangeEntry) => Date.parse(b.at) - Date.parse(a.at);

/** The entries this member may read, newest first. PR numbers are for Admins only, so they are cut from a member's copy. */
export const visibleEntries = (entries: readonly ChangeEntry[], isAdmin: boolean): ChangeEntry[] =>
  entries
    .filter((e) => isAdmin || e.audience === 'all')
    .map((e) => (isAdmin ? e : { ...e, prs: [] }))
    .sort(byNewest);

/** What a member has seen: every entry at or before `floor` (a time in ms), and the listed `at`s after it. */
export interface Seen {
  ids: ReadonlySet<string>;
  floor: number;
}

/** The entries after the floor whose `at` is not in the seen set, newest first. No state (storage blocked) means nothing is unseen. */
export const unseenEntries = (entries: readonly ChangeEntry[], seen: Seen | null): ChangeEntry[] =>
  seen === null ? [] : entries.filter((e) => Date.parse(e.at) > seen.floor && !seen.ids.has(e.at)).sort(byNewest);

/** Whether the popup shows: something is unseen, it was not shown yet on `today` (a Vietnam day), and the Lark reminder is not taking this visit. */
export const changelogPopupDue = (o: { unseen: number; lastShown: string | null; today: string; larkDue: boolean }) => o.unseen > 0 && o.lastShown !== o.today && !o.larkDue;

/** The mark a first visit starts from: the start of the newest entry's Vietnam day, so that day's entries count as unseen (the dot announces them) and older history does not. */
export const firstVisitMark = (entries: readonly ChangeEntry[]): string => `${vnDay(new Date([...entries].sort(byNewest)[0]!.at))}T00:00:00+07:00`;

const readSeen = (): Seen | null => {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(CHANGELOG_SEEN_IDS_KEY) ?? 'null');
    const floor = Date.parse(localStorage.getItem(CHANGELOG_SEEN_FLOOR_KEY) ?? '');
    return Array.isArray(ids) && ids.every((id) => typeof id === 'string') && !Number.isNaN(floor) ? { ids: new Set(ids), floor } : null;
  } catch {
    return null; // absent or corrupt
  }
};
const writeSeen = (s: Seen) => {
  localStorage.setItem(CHANGELOG_SEEN_IDS_KEY, JSON.stringify([...s.ids]));
  localStorage.setItem(CHANGELOG_SEEN_FLOOR_KEY, new Date(s.floor).toISOString());
};

/**
 * The seen state. With none yet the floor is the older mark or, on a first visit, firstVisitMark, and it is saved: all history up to it counts as
 * seen without listing it, as the Shell is given only the newest entries. A first visit also counts as today's popup, so it shows the dot but
 * never opens a dialog. A corrupt state is rebuilt from the older mark. A blocked storage reads as null each time, so nothing is ever unseen there.
 */
export function loadSeen(entries: readonly ChangeEntry[]): Seen | null {
  try {
    const saved = readSeen();
    if (saved !== null) return saved;
    const mark = localStorage.getItem(CHANGELOG_SEEN_KEY);
    if (mark === null && entries.length === 0) return null;
    const cut = mark ?? firstVisitMark(entries);
    const seen = { ids: new Set<string>(), floor: Date.parse(cut) };
    writeSeen(seen);
    if (mark === null) {
      localStorage.setItem(CHANGELOG_SEEN_KEY, cut);
      if (localStorage.getItem(CHANGELOG_POPUP_KEY) === null) localStorage.setItem(CHANGELOG_POPUP_KEY, vnDay(new Date()));
    }
    return seen;
  } catch {
    return null;
  }
}

/** Adds every entry of `entries` after the floor to the seen set. */
export function markSeen(entries: readonly ChangeEntry[]) {
  if (entries.length === 0) return;
  try {
    const seen = loadSeen(entries);
    if (seen) writeSeen({ floor: seen.floor, ids: new Set([...seen.ids, ...entries.filter((e) => Date.parse(e.at) > seen.floor).map((e) => e.at)]) });
    localStorage.setItem(CHANGELOG_SEEN_KEY, [...entries].sort(byNewest)[0]!.at);
  } catch {} // storage blocked: the page still shows
  window.dispatchEvent(new Event(CHANGELOG_SEEN_EVENT));
}
