// A billing team's month against its free allowance (docs/BILLING.md), on the Admin's costs-by-team view and in a member's Limits section.
// The bar is neutral below 75% of the allowance, a warning from 75%, and past 100% the part over the allowance is its own segment, billed to
// the team; the line under it says the same in words, so nothing rests on colour alone.

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The bar's state: `ok` below 75% of the allowance, `warn` from 75%, `over` once the month passes it. */
export function allowanceLevel(total: number, free: number): 'ok' | 'warn' | 'over' {
  if (total > free) return 'over';
  return free > 0 && total >= free * 0.75 ? 'warn' : 'ok';
}

export function AllowanceBar({ totalUsd, freeUsd, label }: { totalUsd: string; freeUsd: string; label: string }) {
  const total = Math.max(0, Number(totalUsd));
  const free = Number(freeUsd);
  const used = Math.min(total, free);
  const over = Math.max(0, total - free);
  const scale = Math.max(total, free) || 1;
  const level = allowanceLevel(total, free);
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
    </div>
  );
}
