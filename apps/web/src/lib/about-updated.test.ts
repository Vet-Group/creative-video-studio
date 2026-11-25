import { describe, expect, it } from 'vitest';
import { ABOUT } from './about-content';
import { ABOUT_PATH, aboutPath, pageUpdates, updatedLabel } from './about-updated';
import { CHANGELOG } from './changelog';

const entry = (at: string, href: string | undefined, audience: 'all' | 'admin' = 'all') => ({ at, href, audience });

describe('the About pill date', () => {
  it("takes the newest member entry whose href is the page's, with or without a query string", () => {
    const map = pageUpdates([
      entry('2026-11-20T10:00:00+07:00', '/try-on'),
      entry('2026-11-24T09:00:00+07:00', '/try-on?tab=examples'),
      entry('2026-11-22T09:00:00+07:00', '/try-on'),
      entry('2026-11-23T09:00:00+07:00', '/apps/pose-generator'),
    ]);
    expect(map['/try-on']).toBe('2026-11-24T09:00:00+07:00');
    expect(map['/apps/pose-generator']).toBe('2026-11-23T09:00:00+07:00');
  });
  it('gives a page without a member entry no date: Admin-only entries and entries without a page do not count', () => {
    const map = pageUpdates([entry('2026-11-24T09:00:00+07:00', '/analyze', 'admin'), entry('2026-11-24T10:00:00+07:00', undefined), entry('2026-11-20T09:00:00+07:00', '/create')]);
    expect(map['/analyze']).toBeUndefined();
    expect(map['/try-on']).toBeUndefined();
    expect(Object.keys(map)).toEqual(['/create']);
  });
  it("names a tool page's own page, the Marketing Studio formats sharing theirs, and an app's /apps/<slug>", () => {
    expect(Object.keys(ABOUT_PATH).sort()).toEqual(Object.keys(ABOUT).sort());
    expect([aboutPath('tryOn'), aboutPath('image'), aboutPath('review'), aboutPath(undefined, 'lingerie-try-on'), aboutPath()]).toEqual(['/try-on', '/image-generation', '/marketing-studio', '/apps/lingerie-try-on', undefined]);
  });
  it("writes the day in Vietnam time, so a late-evening UTC entry shows the next day's date", () => {
    expect(updatedLabel('2026-11-25T00:10:00+07:00')).toBe('Cập nhật 25/11/2026');
    expect(updatedLabel('2026-11-24T18:30:00Z')).toBe('Cập nhật 25/11/2026');
  });
  it('builds a date for the real changelog', () => {
    expect(pageUpdates(CHANGELOG)['/try-on']).toMatch(/^2026-/);
  });
});
