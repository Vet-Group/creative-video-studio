// The period an Admin report covers (Costs, Usage), in Vietnam (Asia/Ho_Chi_Minh) calendar days, read from the query string. Pure: no database, so the
// period picker (components/admin/PeriodPicker.tsx) uses it in the browser too.
import { vnDay } from './lark-prompt';

/** `from` and `to` are 'YYYY-MM-DD', both included; `months` is every 'YYYY-MM' the range touches; `wholeMonths` when it runs from a 1st to its month's last day. */
export type Period = { from: string; to: string; months: string[]; wholeMonths: boolean; days: number; label: string };

/** The longest period a report reads: a leap year. */
export const MAX_PERIOD_DAYS = 366;

const DAY_MS = 86_400_000;
const time = (day: string) => Date.parse(`${day}T00:00:00Z`);
const addDays = (day: string, n: number) => new Date(time(day) + n * DAY_MS).toISOString().slice(0, 10);
const span = (from: string, to: string) => (time(to) - time(from)) / DAY_MS + 1;
// A real calendar day: the round trip refuses 2026-02-30, which Date would roll over to March.
const isDay = (v: string | null): v is string => v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(time(v)) && addDays(v, 0) === v;
const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
// The 28th plus 4 days is always in the next month.
const nextMonth = (month: string) => addDays(`${month}-28`, 4).slice(0, 7);
const lastDay = (month: string) => addDays(`${nextMonth(month)}-01`, -1);

/** Today in Vietnam, 'YYYY-MM-DD'. */
export const todayIct = (): string => vnDay(new Date());

/** '2026-11-16' as '16/11/2026'. */
export const formatDay = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

/** '2026-11' as 'Tháng 11/2026'. */
export const formatMonth = (month: string): string => `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`;

function period(from: string, to: string): Period {
  const months: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = nextMonth(m)) months.push(m);
  const wholeMonths = from.endsWith('-01') && to === lastDay(to.slice(0, 7));
  const days = span(from, to);
  const label = wholeMonths
    ? months.length === 1 ? formatMonth(from.slice(0, 7)) : `${formatMonth(from.slice(0, 7))} – ${formatMonth(to.slice(0, 7))}`
    : days === 1 ? formatDay(from)
    : `${from.slice(0, 4) === to.slice(0, 4) ? formatDay(from).slice(0, 5) : formatDay(from)} – ${formatDay(to)}`;
  return { from, to, months, wholeMonths, days, label };
}

const monthPeriod = (month: string) => period(`${month}-01`, lastDay(month));

/**
 * The period of a report request: `from` and `to` together (dates, `from` not after `to`, at most MAX_PERIOD_DAYS days), else the legacy `month=YYYY-MM`
 * (that whole month), else this ICT month from its 1st to its last day. The error is for the API's 400 answer.
 */
export function parsePeriod(params: URLSearchParams, today = todayIct()): Period | { error: string } {
  const from = params.get('from');
  const to = params.get('to');
  if (from !== null || to !== null) {
    if (!isDay(from) || !isDay(to)) return { error: 'from and to must both be dates as YYYY-MM-DD' };
    if (from > to) return { error: 'from must be on or before to' };
    if (span(from, to) > MAX_PERIOD_DAYS) return { error: `a period spans at most ${MAX_PERIOD_DAYS} days` };
    return period(from, to);
  }
  const month = params.get('month');
  if (month !== null) return isMonth(month) ? monthPeriod(month) : { error: 'month must be YYYY-MM' };
  return monthPeriod(today.slice(0, 7));
}

/** The period to compare with: the whole previous month for a whole single month, else as many days ending the day before `from`. */
export function previousPeriod(p: Period): Period {
  if (p.wholeMonths && p.months.length === 1) return monthPeriod(addDays(p.from, -1).slice(0, 7));
  const to = addDays(p.from, -1);
  return period(addDays(to, 1 - p.days), to);
}

/** The picker's quick choices, with their labels. */
export const PERIOD_PRESETS = { today: 'Hôm nay', '7d': '7 ngày', month: 'Tháng này', lastMonth: 'Tháng trước' } as const;
export type PeriodPreset = keyof typeof PERIOD_PRESETS;

/** A quick choice as a period: today, the last 7 days with today, this month, or the whole previous month. */
export function presetPeriod(key: PeriodPreset, today = todayIct()): Period {
  if (key === 'today') return period(today, today);
  if (key === '7d') return period(addDays(today, -6), today);
  const month = monthPeriod(today.slice(0, 7));
  return key === 'month' ? month : previousPeriod(month);
}
