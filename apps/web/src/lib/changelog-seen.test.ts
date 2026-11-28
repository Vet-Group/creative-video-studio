import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { CHANGELOG } from './changelog';
import { CHANGELOG_POPUP_KEY, CHANGELOG_SEEN_EVENT, CHANGELOG_SEEN_FLOOR_KEY, CHANGELOG_SEEN_IDS_KEY, CHANGELOG_SEEN_KEY, changelogPopupDue, firstVisitMark, loadSeen, markSeen, unseenEntries, visibleEntries } from './changelog-seen';
import { type ChangeEntry } from './changelog';

const e = (at: string, audience: ChangeEntry['audience'] = 'all', prs: number[] = [1]): ChangeEntry => ({ at, kind: 'new', title: at, details: ['x'], prs, audience });
const sample = [e('2026-11-10T09:00:00+07:00'), e('2026-11-12T09:00:00+07:00', 'admin'), e('2026-11-11T09:00:00+07:00')];

test('a member sees only the entries for everyone, newest first and without PR numbers; an Admin sees all with them', () => {
  expect(visibleEntries(sample, false).map((x) => x.at)).toEqual(['2026-11-11T09:00:00+07:00', '2026-11-10T09:00:00+07:00']);
  expect(visibleEntries(sample, false).every((x) => x.prs.length === 0)).toBe(true);
  expect(visibleEntries(sample, true).map((x) => x.at)).toEqual(['2026-11-12T09:00:00+07:00', '2026-11-11T09:00:00+07:00', '2026-11-10T09:00:00+07:00']);
  expect(visibleEntries(sample, true)[0]!.prs).toEqual([1]);
});

test('unseen are the entries after the floor whose moment is not in the seen set, whatever the offset they are written in; no state means storage is blocked and nothing is unseen', () => {
  const all = visibleEntries(sample, true);
  const floor = Date.parse('2026-11-10T09:00:00+07:00');
  expect(unseenEntries(all, { ids: new Set(), floor }).map((x) => x.at)).toEqual(['2026-11-12T09:00:00+07:00', '2026-11-11T09:00:00+07:00']);
  expect(unseenEntries(all, { ids: new Set(['2026-11-11T09:00:00+07:00']), floor }).map((x) => x.at)).toEqual(['2026-11-12T09:00:00+07:00']);
  expect(unseenEntries(all, { ids: new Set(), floor: Date.parse('2026-11-12T02:00:00Z') })).toEqual([]); // the same moment as the newest entry
  expect(unseenEntries(all, null)).toEqual([]);
});

test("a first visit starts at the newest entry's Vietnam day, so only that day is unseen", () => {
  const day = [e('2026-11-11T18:30:00Z'), e('2026-11-12T10:00:00+07:00'), e('2026-11-11T23:59:00+07:00')];
  expect(firstVisitMark(day)).toBe('2026-11-12T00:00:00+07:00'); // 18:30Z on the 11th is 01:30 on the 12th in Vietnam
});

/** A Map-backed localStorage, so the tests need no DOM. */
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
const ids = () => JSON.parse(store.get(CHANGELOG_SEEN_IDS_KEY)!) as string[];
const floor = () => store.get(CHANGELOG_SEEN_FLOOR_KEY);

test('an entry merged earlier than one already seen but released later is still unseen', () => {
  const seen = [e('2026-11-28T17:30:00+07:00')];
  markSeen(seen);
  const late = e('2026-11-28T13:00:00+07:00');
  const all = [...seen, late];
  expect(unseenEntries(all, loadSeen(all)).map((x) => x.at)).toEqual([late.at]);
});

test('with only the older mark, the floor is the mark: older entries are seen, later ones unseen, even when only some entries are passed', () => {
  store.set(CHANGELOG_SEEN_KEY, '2026-11-11T09:00:00+07:00');
  const all = visibleEntries(sample, true);
  expect(unseenEntries(all.slice(0, 1), loadSeen(all.slice(0, 1))).map((x) => x.at)).toEqual(['2026-11-12T09:00:00+07:00']); // the Shell gets the newest ones only
  expect(unseenEntries(all, loadSeen(all)).map((x) => x.at)).toEqual(['2026-11-12T09:00:00+07:00']);
  expect(Date.parse(floor()!)).toBe(Date.parse('2026-11-11T09:00:00+07:00'));
  expect(ids()).toEqual([]);
  expect(store.has(CHANGELOG_POPUP_KEY)).toBe(false); // a migration is not a first visit
});

test('a first visit leaves the newest Vietnam day unseen, counts as the popup of today and writes the older mark too', () => {
  const day = [e('2026-11-10T09:00:00+07:00'), e('2026-11-12T10:00:00+07:00'), e('2026-11-12T08:00:00+07:00')];
  expect(unseenEntries(day, loadSeen(day)).map((x) => x.at)).toEqual(['2026-11-12T10:00:00+07:00', '2026-11-12T08:00:00+07:00']);
  expect(Date.parse(floor()!)).toBe(Date.parse('2026-11-12T00:00:00+07:00'));
  expect(store.get(CHANGELOG_SEEN_KEY)).toBe('2026-11-12T00:00:00+07:00');
  expect(store.has(CHANGELOG_POPUP_KEY)).toBe(true);
});

test('the saved state wins over the older mark once it exists', () => {
  store.set(CHANGELOG_SEEN_KEY, '2026-11-12T09:00:00+07:00');
  store.set(CHANGELOG_SEEN_FLOOR_KEY, '2026-11-10T09:00:00+07:00');
  store.set(CHANGELOG_SEEN_IDS_KEY, JSON.stringify(['2026-11-11T09:00:00+07:00']));
  expect(unseenEntries(sample, loadSeen(sample)).map((x) => x.at)).toEqual(['2026-11-12T09:00:00+07:00']);
});

test('markSeen adds the moments after the floor to the set, keeps the older ones, writes the older mark and fires the event', () => {
  store.set(CHANGELOG_SEEN_FLOOR_KEY, '2026-11-10T09:00:00+07:00');
  store.set(CHANGELOG_SEEN_IDS_KEY, JSON.stringify(['2026-11-01T09:00:00+07:00']));
  markSeen(sample);
  expect(ids().sort()).toEqual(['2026-11-01T09:00:00+07:00', '2026-11-11T09:00:00+07:00', '2026-11-12T09:00:00+07:00']); // the 10th is at the floor already
  expect(store.get(CHANGELOG_SEEN_KEY)).toBe('2026-11-12T09:00:00+07:00');
  expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: CHANGELOG_SEEN_EVENT }));
  markSeen([]);
  expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
});

test('a blocked storage reads as nothing unseen and never throws', () => {
  const blocked = () => {
    throw new Error('blocked');
  };
  vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
  expect(loadSeen(sample)).toBeNull();
  expect(() => markSeen(sample)).not.toThrow();
  expect(unseenEntries(sample, loadSeen(sample))).toEqual([]);
});

test('a corrupt state is rebuilt from the older mark, and a set of the wrong shape counts as corrupt', () => {
  store.set(CHANGELOG_SEEN_KEY, '2026-11-11T09:00:00+07:00');
  store.set(CHANGELOG_SEEN_FLOOR_KEY, '2026-11-10T09:00:00+07:00');
  for (const bad of ['{not json', '{"a":1}', '[1,2]']) {
    store.set(CHANGELOG_SEEN_IDS_KEY, bad);
    expect(unseenEntries(sample, loadSeen(sample)).map((x) => x.at)).toEqual(['2026-11-12T09:00:00+07:00']);
    expect(ids()).toEqual([]); // rebuilt and saved
  }
  store.set(CHANGELOG_SEEN_IDS_KEY, '[]');
  store.set(CHANGELOG_SEEN_FLOOR_KEY, 'not a time');
  expect(unseenEntries(sample, loadSeen(sample)).map((x) => x.at)).toEqual(['2026-11-12T09:00:00+07:00']);
  store.set(CHANGELOG_SEEN_IDS_KEY, '{not json');
  markSeen(sample); // a corrupt set does not stop marking
  expect(unseenEntries(sample, loadSeen(sample))).toEqual([]);
});

test('the popup is due once a Vietnam day when something is unseen, and never on the visit the Lark reminder takes', () => {
  const base = { unseen: 2, lastShown: null, today: '2026-11-12', larkDue: false };
  expect(changelogPopupDue(base)).toBe(true);
  expect(changelogPopupDue({ ...base, lastShown: '2026-11-11' })).toBe(true);
  expect(changelogPopupDue({ ...base, lastShown: '2026-11-12' })).toBe(false);
  expect(changelogPopupDue({ ...base, unseen: 0 })).toBe(false);
  expect(changelogPopupDue({ ...base, larkDue: true })).toBe(false);
});

test('the changelog data is well formed: unique moments, written for readers, newest first', () => {
  const ats = CHANGELOG.map((x) => x.at);
  expect(new Set(ats).size).toBe(ats.length);
  expect(ats).toEqual([...ats].sort((a, b) => Date.parse(b) - Date.parse(a)));
  for (const x of CHANGELOG) {
    expect(Number.isNaN(Date.parse(x.at)), x.at).toBe(false);
    expect(x.at, x.at).toMatch(/\+07:00$/);
    expect(x.details.length, x.title).toBeGreaterThanOrEqual(1);
    expect(x.details.length, x.title).toBeLessThanOrEqual(3);
    expect(x.prs.length, x.title).toBeGreaterThan(0);
    if (x.kind === 'ops') expect(x.audience, x.title).toBe('admin');
    if (x.href) expect(x.href, x.title).toMatch(/^\/[a-z-]/);
  }
});
