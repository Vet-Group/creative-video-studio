// The report period (lib/period.ts): the query string's from/to or legacy month, the default month, the previous period, the presets and the labels.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { formatDay, formatMonth, MAX_PERIOD_DAYS, parsePeriod, type Period, PERIOD_PRESETS, presetPeriod, previousPeriod, todayIct } from './period';

const parse = (query: string, today = '2026-11-25') => parsePeriod(new URLSearchParams(query), today);
const ok = (query: string, today?: string): Period => {
  const p = parse(query, today);
  if ('error' in p) throw new Error(p.error);
  return p;
};

describe('parsePeriod', () => {
  test('with neither from/to nor month, it is this ICT month from its 1st to its last day', () => {
    expect(parse('')).toEqual({ from: '2026-11-01', to: '2026-11-30', months: ['2026-11'], wholeMonths: true, days: 30, label: 'Tháng 11/2026' });
    expect(ok('', '2026-12-31')).toMatchObject({ from: '2026-12-01', to: '2026-12-31', days: 31 });
    expect(ok('other=1', '2026-02-01')).toMatchObject({ from: '2026-02-01', to: '2026-02-28', days: 28 });
  });

  test('a range inside one month: both days included, labelled with the year once', () => {
    expect(parse('from=2026-11-16&to=2026-11-25')).toEqual({ from: '2026-11-16', to: '2026-11-25', months: ['2026-11'], wholeMonths: false, days: 10, label: '16/11 – 25/11/2026' });
  });

  test('one day is labelled as that day', () => {
    expect(ok('from=2026-11-25&to=2026-11-25')).toMatchObject({ days: 1, wholeMonths: false, months: ['2026-11'], label: '25/11/2026' });
    expect(ok('from=2026-11-01&to=2026-11-01')).toMatchObject({ days: 1, wholeMonths: false, label: '01/11/2026' });
  });

  test('a range from a 1st to a last day is whole months, labelled by month', () => {
    expect(ok('from=2026-11-01&to=2026-11-30')).toMatchObject({ wholeMonths: true, months: ['2026-11'], label: 'Tháng 11/2026' });
    expect(ok('from=2026-10-01&to=2026-11-30')).toMatchObject({ wholeMonths: true, months: ['2026-10', '2026-11'], days: 61, label: 'Tháng 10/2026 – Tháng 11/2026' });
    expect(ok('from=2026-03-01&to=2026-03-31')).toMatchObject({ wholeMonths: true, label: 'Tháng 3/2026' });
    // not whole: it starts on a 1st but stops short of the month end, or starts late
    expect(ok('from=2026-11-01&to=2026-11-29')).toMatchObject({ wholeMonths: false, label: '01/11 – 29/11/2026' });
    expect(ok('from=2026-11-02&to=2026-11-30')).toMatchObject({ wholeMonths: false });
  });

  test('month ends: 30 and 31 days, February in leap and common years', () => {
    expect(ok('month=2026-04')).toMatchObject({ to: '2026-04-30', days: 30 });
    expect(ok('month=2026-01')).toMatchObject({ to: '2026-01-31', days: 31 });
    expect(ok('month=2026-02')).toMatchObject({ to: '2026-02-28', days: 28, label: 'Tháng 2/2026' });
    expect(ok('month=2024-02')).toMatchObject({ to: '2024-02-29', days: 29 });
    expect(ok('month=2000-02')).toMatchObject({ to: '2000-02-29', days: 29 }); // divisible by 400
    expect(ok('month=2100-02')).toMatchObject({ to: '2100-02-28', days: 28 }); // divisible by 100 only
    expect(ok('from=2024-02-29&to=2024-02-29')).toMatchObject({ label: '29/02/2024' });
    expect(ok('from=2024-02-01&to=2024-02-29')).toMatchObject({ wholeMonths: true, label: 'Tháng 2/2024' });
    expect(ok('from=2026-02-01&to=2026-02-28')).toMatchObject({ wholeMonths: true });
  });

  test('across the year boundary: both months, and the year on both ends of the label', () => {
    expect(ok('from=2025-12-25&to=2026-01-05')).toMatchObject({ months: ['2025-12', '2026-01'], days: 12, wholeMonths: false, label: '25/12/2025 – 05/01/2026' });
    expect(ok('from=2025-12-01&to=2026-01-31')).toMatchObject({ wholeMonths: true, label: 'Tháng 12/2025 – Tháng 1/2026' });
    expect(ok('from=2025-11-30&to=2026-02-01').months).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  test('legacy month: that whole month, and from/to win when both are given', () => {
    expect(parse('month=2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31', months: ['2026-10'], wholeMonths: true, days: 31, label: 'Tháng 10/2026' });
    expect(ok('month=2026-10&from=2026-11-20&to=2026-11-21')).toMatchObject({ from: '2026-11-20', to: '2026-11-21' });
  });

  test.each([
    ['only from', 'from=2026-11-01'],
    ['only to', 'to=2026-11-01'],
    ['an empty from', 'from=&to=2026-11-01'],
    ['a day that does not exist', 'from=2026-02-29&to=2026-03-01'],
    ['the 31st of a 30-day month', 'from=2026-04-31&to=2026-05-01'],
    ['month 13', 'from=2026-13-01&to=2026-13-02'],
    ['day 0', 'from=2026-11-00&to=2026-11-02'],
    ['no zero padding', 'from=2026-1-5&to=2026-01-06'],
    ['a time with the date', 'from=2026-11-01T00:00&to=2026-11-02'],
    ['words', 'from=yesterday&to=today'],
  ])('refuses %s', (_, query) => {
    expect(parse(query)).toEqual({ error: 'from and to must both be dates as YYYY-MM-DD' });
  });

  test('refuses from after to', () => {
    expect(parse('from=2026-11-26&to=2026-11-25')).toEqual({ error: 'from must be on or before to' });
  });

  test(`takes ${MAX_PERIOD_DAYS} days and refuses one more`, () => {
    expect(ok('from=2024-01-01&to=2024-12-31')).toMatchObject({ days: 366, wholeMonths: true, label: 'Tháng 1/2024 – Tháng 12/2024' });
    expect(ok('from=2025-11-25&to=2026-11-25')).toMatchObject({ days: 366 });
    expect(parse('from=2025-11-24&to=2026-11-25')).toEqual({ error: 'a period spans at most 366 days' });
    expect(parse('from=1000-01-01&to=9999-12-31')).toEqual({ error: 'a period spans at most 366 days' });
  });

  test.each(['2026-13', '2026-00', '2026-1', '26-11', '2026-11-01', ''])('refuses the legacy month %j', (month) => {
    expect(parse(`month=${month}`)).toEqual({ error: 'month must be YYYY-MM' });
  });
});

describe('previousPeriod', () => {
  test('a whole single month compares with the whole previous month, whatever its length', () => {
    expect(previousPeriod(ok('month=2026-03'))).toMatchObject({ from: '2026-02-01', to: '2026-02-28', wholeMonths: true, label: 'Tháng 2/2026' });
    expect(previousPeriod(ok('month=2024-03'))).toMatchObject({ from: '2024-02-01', to: '2024-02-29' });
    expect(previousPeriod(ok('month=2026-01'))).toMatchObject({ from: '2025-12-01', to: '2025-12-31', label: 'Tháng 12/2025' });
  });

  test('any other period compares with as many days ending the day before it', () => {
    expect(previousPeriod(ok('from=2026-11-16&to=2026-11-25'))).toMatchObject({ from: '2026-11-06', to: '2026-11-15', days: 10 });
    expect(previousPeriod(ok('from=2026-11-25&to=2026-11-25'))).toMatchObject({ from: '2026-11-24', to: '2026-11-24', days: 1 });
    expect(previousPeriod(ok('from=2026-03-01&to=2026-03-05'))).toMatchObject({ from: '2026-02-24', to: '2026-02-28', days: 5 });
    expect(previousPeriod(ok('from=2026-01-01&to=2026-01-10'))).toMatchObject({ from: '2025-12-22', to: '2025-12-31', label: '22/12 – 31/12/2025' });
    // several whole months: the same number of days, here the two months before
    expect(previousPeriod(ok('from=2026-10-01&to=2026-11-30'))).toMatchObject({ from: '2026-08-01', to: '2026-09-30', days: 61 });
  });
});

describe('presets', () => {
  test('each quick choice has its Vietnamese label', () => {
    expect(PERIOD_PRESETS).toEqual({ today: 'Hôm nay', '7d': '7 ngày', month: 'Tháng này', lastMonth: 'Tháng trước' });
  });

  test('today, the last 7 days with today, this month and last month', () => {
    expect(presetPeriod('today', '2026-11-25')).toMatchObject({ from: '2026-11-25', to: '2026-11-25', label: '25/11/2026' });
    expect(presetPeriod('7d', '2026-11-25')).toMatchObject({ from: '2026-11-19', to: '2026-11-25', days: 7 });
    expect(presetPeriod('7d', '2026-03-02')).toMatchObject({ from: '2026-02-24', to: '2026-03-02', months: ['2026-02', '2026-03'] });
    expect(presetPeriod('month', '2026-11-25')).toMatchObject({ from: '2026-11-01', to: '2026-11-30', wholeMonths: true });
    expect(presetPeriod('lastMonth', '2026-11-25')).toMatchObject({ from: '2026-10-01', to: '2026-10-31', label: 'Tháng 10/2026' });
    expect(presetPeriod('lastMonth', '2026-01-15')).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetPeriod('7d', '2026-01-03')).toMatchObject({ from: '2025-12-28', label: '28/12/2025 – 03/01/2026' });
  });
});

describe('days in words and today', () => {
  afterEach(() => vi.useRealTimers());

  test('formats a day and a month the Vietnamese way', () => {
    expect(formatDay('2026-11-16')).toBe('16/11/2026');
    expect(formatDay('2026-03-05')).toBe('05/03/2026');
    expect(formatMonth('2026-11')).toBe('Tháng 11/2026');
    expect(formatMonth('2026-03')).toBe('Tháng 3/2026');
  });

  test('today is the Vietnam day, already the next one at 17:00 UTC', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-30T16:59:59Z'));
    expect(todayIct()).toBe('2026-11-30');
    vi.setSystemTime(new Date('2026-11-30T17:00:00Z'));
    expect(todayIct()).toBe('2026-12-01');
    expect(parsePeriod(new URLSearchParams())).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
  });
});
