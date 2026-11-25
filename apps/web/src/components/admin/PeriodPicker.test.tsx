// The report period picker: the label in Vietnamese, the pressed quick choice, the closed custom range, the address it writes and why a range is refused.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { parsePeriod, type Period, presetPeriod } from '@/lib/period';
import { PeriodPicker, periodHref, rangeProblem } from './PeriodPicker';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) })); // a static render has no app router

const chips = (html: string, state: boolean) => [...html.matchAll(new RegExp(`<button type="button" aria-pressed="${state}">([^<]*)</button>`, 'g'))].map((m) => m[1]);
const pressed = (html: string) => chips(html, true);

test('shows the label as text and presses the quick choice that matches the period', () => {
  const html = renderToStaticMarkup(<PeriodPicker period={presetPeriod('month')} />);
  expect(html).toContain(`<p class="period-label" aria-live="polite">${presetPeriod('month').label}</p>`);
  expect(html).toContain('<div class="segmented preset-chips" role="group" aria-label="Khoảng thời gian">');
  expect(pressed(html)).toEqual(['Tháng này']);
  expect(chips(html, false)).toEqual(['Hôm nay', '7 ngày', 'Tháng trước']);
  expect(pressed(renderToStaticMarkup(<PeriodPicker period={presetPeriod('7d')} />))).toEqual(['7 ngày']);
});

test('a range that is no quick choice presses none, and the custom range stays closed until asked for', () => {
  const p = parsePeriod(new URLSearchParams('from=2026-11-16&to=2026-11-25')) as Period;
  const html = renderToStaticMarkup(<PeriodPicker period={p} />);
  expect(html).toContain('>16/11 – 25/11/2026</p>');
  expect(pressed(html)).toEqual([]);
  expect(html).toContain('<button type="button" aria-expanded="false">Tuỳ chọn</button>');
  expect(html).not.toContain('type="date"');
});

test('writes from and to into the address, keeping the other parameters and dropping the legacy month', () => {
  const next = { from: '2026-11-16', to: '2026-11-25' };
  expect(periodHref('/admin/costs', '', next)).toBe('/admin/costs?from=2026-11-16&to=2026-11-25');
  expect(periodHref('/admin/costs', '?view=teams&month=2026-10', next)).toBe('/admin/costs?view=teams&from=2026-11-16&to=2026-11-25');
  expect(periodHref('/admin/usage', '?from=2026-01-01&to=2026-01-02&sort=jobs', next)).toBe('/admin/usage?from=2026-11-16&to=2026-11-25&sort=jobs');
});

test('says why a custom range cannot be applied', () => {
  expect(rangeProblem('2026-11-16', '2026-11-25')).toBeNull();
  expect(rangeProblem('2026-11-25', '2026-11-25')).toBeNull();
  expect(rangeProblem('', '2026-11-25')).toBe('Chọn cả Từ ngày và Đến ngày.');
  expect(rangeProblem('2026-11-25', '')).toBe('Chọn cả Từ ngày và Đến ngày.');
  expect(rangeProblem('2026-11-26', '2026-11-25')).toBe('Từ ngày phải trước hoặc trùng Đến ngày.');
  expect(rangeProblem('2025-11-24', '2026-11-25')).toBe('Chọn tối đa 366 ngày.');
});
