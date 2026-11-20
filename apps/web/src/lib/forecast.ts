// The month-end forecast of a billing team (docs/BILLING.md): a linear run-rate, month total / elapsed × month length, on ICT time (UTC+7, no DST).
const DAY_MS = 86_400_000;
const ICT_MS = 7 * 3_600_000;

/**
 * Where `usd` (a month's total so far, numeric text) is heading by the end of `month` ('YYYY-MM', ICT) at `now`, at the pace so far, as 4-decimal text.
 * Elapsed time counts at least one day, so the first hours of a month do not explode, and at most the month, so a late `now` never shrinks the total.
 * An estimate, so plain floats; the figures billed stay exact (lib/billing.ts).
 */
export function forecastUsd(usd: string, month: string, now: Date): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const length = Date.UTC(y, m, 1) - Date.UTC(y, m - 1, 1);
  const elapsed = Math.min(length, Math.max(DAY_MS, now.getTime() - (Date.UTC(y, m - 1, 1) - ICT_MS)));
  return Math.max(0, (Number(usd) * length) / elapsed).toFixed(4);
}
