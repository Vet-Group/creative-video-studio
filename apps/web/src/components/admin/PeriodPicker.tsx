'use client';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { MAX_PERIOD_DAYS, parsePeriod, PERIOD_PRESETS, type Period, type PeriodPreset, presetPeriod, todayIct } from '@/lib/period';

/** Why a typed range cannot be applied, in words; null when it can. */
export function rangeProblem(from: string, to: string): string | null {
  if (!from || !to) return 'Chọn cả Từ ngày và Đến ngày.';
  if (!('error' in parsePeriod(new URLSearchParams({ from, to })))) return null;
  return from > to ? 'Từ ngày phải trước hoặc trùng Đến ngày.' : `Chọn tối đa ${MAX_PERIOD_DAYS} ngày.`;
}

/** The address with the chosen period: the other parameters kept, the legacy `month` dropped. */
export function periodHref(pathname: string, search: string, next: { from: string; to: string }): string {
  const query = new URLSearchParams(search);
  query.delete('month');
  query.set('from', next.from);
  query.set('to', next.to);
  return `${pathname}?${query}`;
}

/** The period of an Admin report: its label in Vietnamese, the quick choices and a custom range. A choice replaces the address (periodHref, no scroll) and calls `onChange`. */
export function PeriodPicker({ period, onChange }: { period: Period; onChange?(next: { from: string; to: string }): void }) {
  const router = useRouter();
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const id = useId();
  const today = todayIct();
  const problem = rangeProblem(from, to);

  function choose(next: { from: string; to: string }) {
    router.replace(periodHref(window.location.pathname, window.location.search, next), { scroll: false });
    onChange?.({ from: next.from, to: next.to });
  }

  return (
    <div className="period-picker">
      <p className="period-label" aria-live="polite">
        {period.label}
      </p>
      <div className="segmented preset-chips" role="group" aria-label="Khoảng thời gian">
        {(Object.entries(PERIOD_PRESETS) as [PeriodPreset, string][]).map(([key, label]) => {
          const p = presetPeriod(key, today);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={p.from === period.from && p.to === period.to}
              onClick={() => {
                setCustom(false);
                choose(p);
              }}
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          aria-expanded={custom}
          aria-controls={custom ? `${id}-custom` : undefined}
          onClick={() => {
            setFrom(period.from);
            setTo(period.to);
            setCustom(!custom);
          }}
        >
          Tuỳ chọn
        </button>
      </div>
      {custom && (
        <>
          <form
            id={`${id}-custom`}
            className="row period-custom"
            aria-label="Khoảng ngày tuỳ chọn"
            onSubmit={(e) => {
              e.preventDefault();
              if (!problem) choose({ from, to });
            }}
          >
            <label>
              Từ ngày
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              Đến ngày
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button type="submit" disabled={!!problem} aria-describedby={`${id}-problem`}>
              Áp dụng
            </button>
          </form>
          <small id={`${id}-problem`} aria-live="polite">
            {problem}
          </small>
        </>
      )}
    </div>
  );
}
