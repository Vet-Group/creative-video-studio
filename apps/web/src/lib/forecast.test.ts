// The month-end forecast: a linear run-rate on ICT time, with at least one day counted as elapsed.
import { describe, expect, test } from 'vitest';
import { forecastUsd } from './forecast';

const at = (iso: string) => new Date(iso);

describe('forecastUsd', () => {
  test('scales the total so far by the month length over the days elapsed', () => {
    expect(forecastUsd('15.0000', '2026-11', at('2026-11-16T00:00:00+07:00'))).toBe('30.0000'); // 15 of 30 days
    expect(forecastUsd('10.0000', '2026-11', at('2026-11-03T00:00:00+07:00'))).toBe('150.0000'); // 2 of 30 days
    expect(forecastUsd('3.3333', '2026-12', at('2026-12-11T00:00:00+07:00'))).toBe('10.3332'); // 10 of 31 days
  });

  test('uses the real month length: 29 days in a leap February, 31 over the year end', () => {
    expect(forecastUsd('14.0000', '2028-02', at('2028-02-15T00:00:00+07:00'))).toBe('29.0000');
    expect(forecastUsd('14.0000', '2027-02', at('2027-02-15T00:00:00+07:00'))).toBe('28.0000');
    expect(forecastUsd('30.0000', '2026-12', at('2026-12-31T00:00:00+07:00'))).toBe('31.0000');
  });

  test('counts at least one day, so the first hours of a month do not explode', () => {
    expect(forecastUsd('5.0000', '2026-11', at('2026-11-01T01:00:00+07:00'))).toBe('150.0000'); // one hour in: as if one day
    expect(forecastUsd('5.0000', '2026-11', at('2026-10-31T17:00:00Z'))).toBe('150.0000'); // exactly midnight ICT
    expect(forecastUsd('5.0000', '2026-11', at('2026-11-02T00:00:00+07:00'))).toBe('150.0000'); // exactly one day
  });

  test('reads the month start and now on ICT, not UTC', () => {
    // 2026-11-15T20:00Z is 03:00 on 16 November in Vietnam: 15.125 days in, so 15.125 USD heads for 30.
    expect(forecastUsd('15.1250', '2026-11', at('2026-11-15T20:00:00Z'))).toBe('30.0000');
    // 2026-10-31T16:00Z is still 31 October in UTC+7 but already 1 November in UTC+8: the month has not begun, so the one-day floor applies.
    expect(forecastUsd('1.0000', '2026-11', at('2026-10-31T16:00:00Z'))).toBe('30.0000');
  });

  test('never goes below the total, and a month with nothing or less than nothing forecasts zero', () => {
    expect(forecastUsd('42.0000', '2026-11', at('2026-12-05T00:00:00+07:00'))).toBe('42.0000'); // after the month ended: elapsed stops at the month
    expect(forecastUsd('0.0000', '2026-11', at('2026-11-10T00:00:00+07:00'))).toBe('0.0000');
    expect(forecastUsd('-3.0000', '2026-11', at('2026-11-10T00:00:00+07:00'))).toBe('0.0000');
  });
});
