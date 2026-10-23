// The Admin Costs page and its two CSVs (plan M.5). Each is read inside one REPEATABLE READ transaction, so what they show is one set of
// ledger rows. VND is rounded per row in SQL by round_half_even; every total here is a sum of those row values, kept in whole 1/10000 USD
// and whole VND as BigInt, so nothing passes through a float.
import { type Queryable, withTransaction } from '@cvs/core/ledger';
import { pool } from '@/lib/auth';
import { csvResponse, text } from '@/lib/csv';
import { featureLabel } from '@/lib/features';

const NO_STORE = 'Không gắn cửa hàng';
const SHARED = 'Chi phí chung';

interface Row {
  id: number;
  kind: string;
  usd: string;
  vnd: string | null;
  month: string;
  day: string | null;
  job_id: string | null;
  /** The job's feature; null on shared rows. */
  feature: string | null;
  provider: string | null;
  model: string | null;
  user_id: string | null;
  user_name: string | null;
  email: string | null;
  team_id: string | null;
  team_name: string | null;
  cost_centre_code: string | null;
  store_id: string | null;
  store_name: string | null;
  store_code: string | null;
  /** The job's own user, team and store now (a store can be re-assigned), for counting accepted clips. */
  job_user: string | null;
  job_team: string | null;
  job_store: string | null;
  /** The job has a closing row. Shared rows are always final. */
  final: boolean;
  verdict: 'pass' | 'fail' | null;
  /** The job failed or timed out yet has a cost, and no Fail verdict. */
  fail_status: boolean;
}

export interface InvoiceRow {
  provider: string;
  totalUsd: string;
  /** What the ledger holds for the provider and month, without invoice_diff rows. */
  ledgerUsd: string;
  /** Invoice minus ledgerUsd. */
  diffUsd: string;
  /** The difference is more than 5% of the invoice. */
  red: boolean;
  /** The provider's job rows by the UTC month the job was submitted, plus its bake-off rows, to explain time-zone differences. */
  utcMonthUsd: string;
}

export interface Snapshot {
  month: string;
  /** max(cost_entries.id) in the transaction: a label for which ledger rows the figures include. */
  asOf: number;
  rate: string | null;
  rows: Row[];
  /** The video budget: every ledger row of the month outside the image and apps features (shared rows included), and its cap. */
  capUsageUsd: string;
  monthlyCapUsd: string;
  /** The image and apps budget and its hard cap. */
  featuresCapUsageUsd: string;
  featuresMonthlyCapUsd: string;
  /** The soft per-feature caps. */
  featureCaps: { feature: string; monthlyUsd: string }[];
  invoices: InvoiceRow[];
}

/** The invoices entered for `month` (one provider when given), with the difference to the ledger. */
export async function invoiceRows(db: Queryable, month: string, provider?: string): Promise<InvoiceRow[]> {
  const { rows } = await db.query(
    `select i.provider, i.total_usd::text as "totalUsd", l.usd::text as "ledgerUsd", (i.total_usd - l.usd)::text as "diffUsd",
            abs(i.total_usd - l.usd) > 0.05 * i.total_usd as red, u.usd::text as "utcMonthUsd"
       from provider_invoices i
       cross join lateral (select coalesce(sum(usd), 0)::numeric(12, 4) as usd from cost_entries where month = i.month and provider = i.provider and kind <> 'invoice_diff') l
       cross join lateral (
         select coalesce(sum(ce.usd), 0)::numeric(12, 4) as usd from cost_entries ce left join jobs j on j.id = ce.job_id
          where ce.provider = i.provider and ce.kind <> 'invoice_diff'
            and case when ce.job_id is null then ce.month else to_char(coalesce(j.started_at, j.created_at) at time zone 'UTC', 'YYYY-MM') end = i.month) u
      where i.month = $1 and ($2::text is null or i.provider = $2) order by i.provider`,
    [month, provider ?? null],
  );
  return rows;
}

/**
 * Reads the month's ledger rows, rate, cap usage and invoices in one REPEATABLE READ transaction; null means the current ICT month.
 * `upTo` keeps only the rows with an id up to it, so a CSV can show the rows the Costs page showed (the page's as_of).
 * shortcut: bigserial ids can commit out of order, so a row with a lower id committed after the page load would appear; upgrade to a stored snapshot if that matters
 */
export function snapshot(requestedMonth: string | null, upTo: number | null = null): Promise<Snapshot> {
  return withTransaction(pool, async (tx) => {
    await tx.query('set transaction isolation level repeatable read read only');
    const latest = (await tx.query('select coalesce(max(id), 0)::int as n from cost_entries')).rows[0].n as number;
    const asOf = upTo === null ? latest : Math.min(upTo, latest);
    const month = requestedMonth ?? ((await tx.query(`select to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') as m`)).rows[0].m as string);
    const rate = await tx.query('select vnd_per_usd::text as rate from monthly_rates where month = $1', [month]);
    const cap = await tx.query(
      `with b as (select ce.usd, exists (select 1 from jobs j where j.id = ce.job_id and j.feature not in ('video', 'marketing')) as budget
                    from cost_entries ce where ce.month = $1)
       select coalesce((select sum(usd) from b where not budget), 0)::numeric(12, 4)::text as used,
              coalesce((select sum(usd) from b where budget), 0)::numeric(12, 4)::text as features_used,
              s.monthly_cap_usd::text as cap, s.features_monthly_cap_usd::text as features_cap
         from settings s where s.id = 1`,
      [month],
    );
    const featureCaps = await tx.query('select feature, monthly_usd::text as "monthlyUsd" from feature_caps order by feature');
    const rows = await tx.query(
      `select ce.id::int as id, ce.kind, ce.usd::text as usd, round_half_even(ce.usd * r.vnd_per_usd)::text as vnd, ce.month, ce.day::text as day,
              ce.job_id, j.feature, ce.provider, ce.model, ce.user_id, u.name as user_name, u.email, ce.team_id, t.name as team_name, t.cost_centre_code,
              ce.store_id, s.name as store_name, s.code as store_code, j.user_id as job_user, j.team_id as job_team, j.store_id as job_store,
              coalesce(jc.is_final, true) as final, v.verdict,
              coalesce(j.status in ('failed', 'timed_out') and jc.usd > 0 and v.verdict is distinct from 'fail', false) as fail_status
         from cost_entries ce
         left join monthly_rates r on r.month = ce.month
         left join users u on u.id = ce.user_id
         left join teams t on t.id = ce.team_id
         left join stores s on s.id = ce.store_id
         left join jobs j on j.id = ce.job_id
         left join job_costs jc on jc.job_id = ce.job_id
         left join verdicts v on v.job_id = ce.job_id
        where ce.month = $1 and ce.id <= $2 order by ce.id`,
      [month, asOf],
    );
    return {
      month, asOf, rate: rate.rows[0]?.rate ?? null, rows: rows.rows, capUsageUsd: cap.rows[0].used, monthlyCapUsd: cap.rows[0].cap,
      featuresCapUsageUsd: cap.rows[0].features_used, featuresMonthlyCapUsd: cap.rows[0].features_cap, featureCaps: featureCaps.rows,
      invoices: await invoiceRows(tx, month),
    };
  });
}

const units = (usd: string) => BigInt(usd.replace('.', ''));
const fixed = (n: bigint, scale: number) => {
  const a = n < 0n ? -n : n;
  const p = 10n ** BigInt(scale);
  return `${n < 0n ? '-' : ''}${a / p}.${String(a % p).padStart(scale, '0')}`;
};
/** n / d to a whole number, a tie going to the even neighbour (the same rule as round_half_even). */
function divEven(n: bigint, d: bigint): bigint {
  const a = n < 0n ? -n : n;
  let q = a / d;
  const twice = (a % d) * 2n;
  if (twice > d || (twice === d && q % 2n === 1n)) q++;
  return n < 0n ? -q : q;
}

interface Agg { usd: bigint; vnd: bigint; fvUsd: bigint; fvVnd: bigint; fsUsd: bigint; fsVnd: bigint; accepted: number }
const blank = (): Agg => ({ usd: 0n, vnd: 0n, fvUsd: 0n, fvVnd: 0n, fsUsd: 0n, fsVnd: 0n, accepted: 0 });

/** Sums the job rows per `rowKey`; each job with a Pass verdict counts once as an accepted clip for its `jobKey`. */
function aggregate(rows: Row[], rowKey: (r: Row) => string, jobKey: (r: Row) => string): Map<string, Agg> {
  const out = new Map<string, Agg>();
  const at = (k: string) => out.get(k) ?? out.set(k, blank()).get(k)!;
  const counted = new Set<string>();
  for (const r of rows) {
    if (!r.job_id) continue;
    const a = at(rowKey(r));
    const usd = units(r.usd);
    const vnd = BigInt(r.vnd ?? 0);
    a.usd += usd;
    a.vnd += vnd;
    if (r.verdict === 'fail') { a.fvUsd += usd; a.fvVnd += vnd; }
    if (r.fail_status) { a.fsUsd += usd; a.fsVnd += vnd; }
    if (r.verdict === 'pass' && !counted.has(r.job_id)) { counted.add(r.job_id); at(jobKey(r)).accepted++; }
  }
  return out;
}

const hasRate = (s: Snapshot) => s.rate !== null;
/** USD at 4 decimals and as a 2-decimal display value, and VND (null while the month has no rate). */
const money = (s: Snapshot, usd: bigint, vnd: bigint) => ({ usd: fixed(usd, 4), usdDisplay: fixed(divEven(usd, 100n), 2), vnd: hasRate(s) ? String(vnd) : null });

function figures(s: Snapshot, a: Agg) {
  const n = BigInt(a.accepted);
  return {
    ...money(s, a.usd, a.vnd),
    failedByVerdict: money(s, a.fvUsd, a.fvVnd),
    failedByStatus: money(s, a.fsUsd, a.fsVnd),
    acceptedClips: a.accepted,
    costPerAcceptedUsd: a.accepted ? fixed(divEven(a.usd, n), 4) : null,
    costPerAcceptedVnd: a.accepted && hasRate(s) ? String(divEven(a.vnd, n)) : null,
  };
}

function groups(s: Snapshot, rowKey: (r: Row) => string, jobKey: (r: Row) => string, label: (r: Row) => Record<string, unknown>) {
  const labels = new Map<string, Record<string, unknown>>();
  for (const r of s.rows) if (r.job_id && !labels.has(rowKey(r))) labels.set(rowKey(r), label(r));
  return [...aggregate(s.rows, rowKey, jobKey)]
    .sort(([ka, a], [kb, b]) => (a.usd === b.usd ? ka.localeCompare(kb) : a.usd < b.usd ? 1 : -1))
    .map(([id, a]) => ({ id, ...labels.get(id), ...figures(s, a) }));
}

/** The shared rows (bake-off, manual adjustments, invoice differences): the general-cost line. */
function sharedLine(s: Snapshot) {
  const shared = s.rows.filter((r) => !r.job_id);
  const sum = (rows: Row[]) => ({ usd: rows.reduce((t, r) => t + units(r.usd), 0n), vnd: rows.reduce((t, r) => t + BigInt(r.vnd ?? 0), 0n) });
  const byKind = Object.fromEntries(['bakeoff', 'manual_adjustment', 'invoice_diff'].map((k) => [k, fixed(sum(shared.filter((r) => r.kind === k)).usd, 4)]));
  return { ...money(s, sum(shared).usd, sum(shared).vnd), rows: shared.length, byKind };
}

/** The Costs page: totals by user, team and store, the general-cost line, the grand total, cap usage and invoices. */
export function costsPage(s: Snapshot) {
  const all = s.rows.reduce((t, r) => ({ usd: t.usd + units(r.usd), vnd: t.vnd + BigInt(r.vnd ?? 0) }), { usd: 0n, vnd: 0n });
  return {
    month: s.month,
    asOf: s.asOf,
    provisional: s.rows.some((r) => r.job_id && !r.final),
    rateVndPerUsd: s.rate,
    total: money(s, all.usd, all.vnd),
    shared: sharedLine(s),
    byUser: groups(s, (r) => r.user_id ?? '', (r) => r.job_user ?? '', (r) => ({ name: r.user_name, email: r.email })),
    byTeam: groups(s, (r) => r.team_id ?? '', (r) => r.job_team ?? '', (r) => ({ name: r.team_name, costCentreCode: r.cost_centre_code })),
    byStore: groups(s, (r) => r.store_id ?? '', (r) => r.job_store ?? '', (r) => ({ name: r.store_name ?? NO_STORE, code: r.store_code })),
    byFeature: groups(s, (r) => r.feature ?? '', (r) => r.feature ?? '', (r) => ({ name: featureLabel(r.feature) })),
    capUsage: { usd: s.capUsageUsd, monthlyCapUsd: s.monthlyCapUsd },
    featuresCapUsage: { usd: s.featuresCapUsageUsd, monthlyCapUsd: s.featuresMonthlyCapUsd },
    featureCaps: featureCapLines(s),
    invoices: s.invoices,
  };
}

/** Each soft per-feature cap with the month's spend and 80 or 100 once that share is reached (null below 80%). */
function featureCapLines(s: Snapshot) {
  const spent = aggregate(s.rows, (r) => r.feature ?? '', (r) => r.feature ?? '');
  return s.featureCaps.map(({ feature, monthlyUsd }) => {
    const usd = spent.get(feature)?.usd ?? 0n;
    const cap = units(monthlyUsd);
    const level = cap > 0n && usd >= cap ? 100 : cap > 0n && usd * 10n >= cap * 8n ? 80 : null;
    return { feature, name: featureLabel(feature), capUsd: monthlyUsd, spentUsd: fixed(usd, 4), level };
  });
}

/** A CSV download with a label line holding the month and as_of. */
const csv = (s: Snapshot, kind: string, header: string[], rows: (string | null)[][]) =>
  csvResponse(`Creative Video Studio ${kind} ${s.month} as_of ${s.asOf}`, `cvs-${kind}-${s.month}.csv`, header, rows);

/** The ledger detail: one line per ledger row of the month. */
export function detailCsv(s: Snapshot) {
  return csv(
    s, 'ledger-detail',
    ['month', 'date', 'job id', 'user', 'email', 'team', 'cost-centre code', 'store', 'store code', 'provider', 'model', 'entry kind', 'USD', 'VND', 'Tạm tính/Thật', 'Đạt/Không đạt'],
    s.rows.map((r) => [
      r.month, r.day, r.job_id, text(r.user_name), text(r.email), text(r.team_name), text(r.cost_centre_code), text(r.store_name), text(r.store_code),
      r.provider, r.model, r.kind, r.usd, r.vnd, r.final ? 'Thật' : 'Tạm tính', r.verdict === 'pass' ? 'Đạt' : r.verdict === 'fail' ? 'Không đạt' : null,
    ]),
  );
}

/** The summary by team and store, with a general-cost row for the shared rows. */
export function summaryCsv(s: Snapshot) {
  const labels = new Map<string, Row>();
  const key = (team: string | null, store: string | null) => `${team ?? ''}\t${store ?? ''}`;
  for (const r of s.rows) if (r.job_id && !labels.has(key(r.team_id, r.store_id))) labels.set(key(r.team_id, r.store_id), r);
  const line = (head: (string | null)[], f: ReturnType<typeof figures>) => [s.month, ...head, f.usd, f.vnd, f.failedByVerdict.usd, f.failedByStatus.usd, String(f.acceptedClips), f.costPerAcceptedUsd];
  const teamStore = [...aggregate(s.rows, (r) => key(r.team_id, r.store_id), (r) => key(r.job_team, r.job_store))].map(([k, a]) => {
    const r = labels.get(k);
    return line([text(r?.team_name ?? null), text(r?.cost_centre_code ?? null), text(r?.store_name ?? NO_STORE), text(r?.store_code ?? null)], figures(s, a));
  });
  teamStore.sort((a, b) => `${a[1]}\t${a[3]}`.localeCompare(`${b[1]}\t${b[3]}`));
  const shared = sharedLine(s);
  return csv(
    s, 'summary',
    ['month', 'team', 'cost-centre code', 'store', 'store code', 'USD', 'VND', 'failed clips USD (Fail verdict)', 'failed jobs USD (failed or timed out)', 'accepted clips', 'cost per accepted clip USD'],
    [...teamStore, [s.month, SHARED, null, null, null, shared.usd, shared.vnd, null, null, null, null]],
  );
}
