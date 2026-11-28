// A billing team's month against its free allowance (docs/BILLING.md), on the Admin's costs-by-team view and in a member's Limits section.
// The bar is neutral below 75% of the allowance, a warning from 75%, and past 100% the part over the allowance is its own segment, billed to
// the team; the line under it says the same in words, so nothing rests on colour alone. With `forecastUsd` (this month only) one more line says where
// the month is heading at its pace so far and what that would bill: an estimate, never charged and never a block.
// FreeLeft is the one-line version over a form's Run button, so a seller sees the team's free money before spending it (seller survey 2026-11-27).
'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The bar's state: `ok` below 75% of the allowance, `warn` from 75%, `over` once the month passes it. */
export function allowanceLevel(total: number, free: number): 'ok' | 'warn' | 'over' {
  if (total > free) return 'over';
  return free > 0 && total >= free * 0.75 ? 'warn' : 'ok';
}

export function AllowanceBar({ totalUsd, freeUsd, label, forecastUsd }: { totalUsd: string; freeUsd: string; label: string; forecastUsd?: string }) {
  const total = Math.max(0, Number(totalUsd));
  const free = Number(freeUsd);
  const used = Math.min(total, free);
  const over = Math.max(0, total - free);
  const scale = Math.max(total, free) || 1;
  const level = allowanceLevel(total, free);
  const forecast = Number(forecastUsd ?? 0);
  const pct = free > 0 ? Math.round((used / free) * 100) : 100;
  const text = `Đã dùng ${usd(used)} / ${usd(free)} miễn phí (${pct}%)${over > 0 ? `; vượt ${usd(over)}, tính cho team` : `; còn ${usd(free - used)}`}`;
  return (
    <div className="allowance" data-level={level}>
      <div className="allowance-track" role="img" aria-label={`${label}: ${text}`}>
        <span className="allowance-used" style={{ width: `${(used / scale) * 100}%` }} />
        {over > 0 && <span className="allowance-over" style={{ width: `${(over / scale) * 100}%` }} />}
      </div>
      <div className="allowance-legend" aria-hidden="true">
        <span>
          Miễn phí {usd(used)} / {usd(free)} ({pct}%)
        </span>
        {over > 0 && (
          <span className="allowance-over-label">
            <i /> Tính cho team {usd(over)}
          </span>
        )}
      </div>
      {forecast > 0 && (
        <p className="allowance-forecast" title="Ước tính theo tốc độ dùng từ đầu tháng. Không tính tiền và không chặn việc tạo.">
          Dự báo cuối tháng (ước tính): ~{usd(forecast)}
          {forecast > free && <>; tính cho team ~{usd(forecast - free)}</>}
        </p>
      )}
    </div>
  );
}

/** The line over Run: what the team's free allowance still holds this month, or that it is used up. Null for a team without an allowance. */
export function freeLeftText({ monthUsd, freeUsd }: { monthUsd: string; freeUsd: string }): string | null {
  const free = Number(freeUsd);
  if (!(free > 0)) return null;
  const left = free - Math.max(0, Number(monthUsd));
  return left > 0 ? `Team bạn còn ${usd(left)} miễn phí tháng này` : `Team bạn đã dùng hết ${usd(free)} miễn phí tháng này; phần vượt tính cho team`;
}

/**
 * The team's free allowance left, from /api/me/limits: only a member of a billing team in the company's workspace gets `team` there, so a partner
 * workspace, a non-billing team or no team shows nothing (the Run button already carries the price).
 * shortcut: read once when the form opens, so the team's spend since then shows after a reload; poll or refetch after a Run if sellers ask.
 */
export function FreeLeft({ className = 'run-summary run-free', reserve = false }: { className?: string; reserve?: boolean }) {
  const [team, setTeam] = useState<{ monthUsd: string; freeUsd: string } | null | undefined>(undefined); // undefined until the answer
  useEffect(() => {
    let live = true;
    api<{ team?: { monthUsd: string; freeUsd: string } }>('/api/me/limits').then(
      (r) => live && setTeam(r.team ?? null),
      () => {}, // the line is a hint: without it the form works as before
    );
    return () => {
      live = false;
    };
  }, []);
  const text = team && freeLeftText(team);
  if (text) return <p className={className}>{text}</p>;
  // `reserve`: the page knows the line will show, so its row is held until the answer lands and the rows under it stay where they are.
  return reserve && team === undefined ? (
    <p className={className} aria-hidden="true" style={{ visibility: 'hidden' }}>
      &nbsp;
    </p>
  ) : null;
}
