import { expect, test } from 'vitest';
import { CHANGELOG } from './changelog';
import { changelogPopupDue, firstVisitMark, unseenEntries, visibleEntries } from './changelog-seen';
import { type ChangeEntry } from './changelog';

const e = (at: string, audience: ChangeEntry['audience'] = 'all', prs: number[] = [1]): ChangeEntry => ({ at, kind: 'new', title: at, details: ['x'], prs, audience });
const sample = [e('2026-11-10T09:00:00+07:00'), e('2026-11-12T09:00:00+07:00', 'admin'), e('2026-11-11T09:00:00+07:00')];

test('a member sees only the entries for everyone, newest first and without PR numbers; an Admin sees all with them', () => {
  expect(visibleEntries(sample, false).map((x) => x.at)).toEqual(['2026-11-11T09:00:00+07:00', '2026-11-10T09:00:00+07:00']);
  expect(visibleEntries(sample, false).every((x) => x.prs.length === 0)).toBe(true);
  expect(visibleEntries(sample, true).map((x) => x.at)).toEqual(['2026-11-12T09:00:00+07:00', '2026-11-11T09:00:00+07:00', '2026-11-10T09:00:00+07:00']);
  expect(visibleEntries(sample, true)[0]!.prs).toEqual([1]);
});

test('unseen are the entries newer than the seen mark, whatever the offset they are written in; no mark means a first visit with nothing unseen', () => {
  const all = visibleEntries(sample, true);
  expect(unseenEntries(all, '2026-11-10T09:00:00+07:00').map((x) => x.at)).toEqual(['2026-11-12T09:00:00+07:00', '2026-11-11T09:00:00+07:00']);
  expect(unseenEntries(all, '2026-11-12T02:00:00Z')).toEqual([]); // the same moment as the newest entry
  expect(unseenEntries(all, '2026-11-12T09:00:00+07:00')).toEqual([]);
  expect(unseenEntries(all, null)).toEqual([]);
});

test("a first visit starts at the newest entry's Vietnam day, so only that day is unseen", () => {
  const day = [e('2026-11-11T18:30:00Z'), e('2026-11-12T10:00:00+07:00'), e('2026-11-11T23:59:00+07:00')];
  expect(firstVisitMark(day)).toBe('2026-11-12T00:00:00+07:00'); // 18:30Z on the 11th is 01:30 on the 12th in Vietnam
  expect(unseenEntries(day, firstVisitMark(day)).map((x) => x.at)).toEqual(['2026-11-12T10:00:00+07:00', '2026-11-11T18:30:00Z']);
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
