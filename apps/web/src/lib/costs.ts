// The Admin Costs page and its two CSVs (plan M.5). Each is read inside one REPEATABLE READ transaction, so what they show is one set of
// ledger rows. VND is rounded per row in SQL by round_half_even; every total here is a sum of those row values, kept in whole 1/10000 USD
// and whole VND as BigInt, so nothing passes through a float.
import { CANCELED_ERROR, type Queryable, withTransaction } from '@cvs/core/ledger';
import { pool } from '@/lib/auth';
import { csvResponse, text } from '@/lib/csv';
import { featureLabel } from '@/lib/features';
import { type Period, parsePeriod, previousPeriod, todayIct } from '@/lib/period';
import { realUserSql } from '@/lib/real-users';

const NO_STORE = 'Không gắn cửa hàng';
const NO_TEAM = 'Chưa có nhóm';
const SHARED = 'Chi phí chung';
// shortcut: a Smart Remake's fal calls are llm rows (bookLlm), so they share this line; give them their own line if their spend needs reading apart.
const LLM = 'LLM (Dịch/Gợi ý/Cải thiện) và Smart Remake';

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
  /** The model's label in model_configs; null for a model the table no longer holds and for shared rows. */
  model_label: string | null;
  job_status: string | null;
  /** The job's submit time in UTC, ISO 8601. */
  job_created_at: string | null;
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
  /** The row's user's team now (the job-time team is team_id). */
  team_now_id: string | null;
  team_now_name: string | null;
  /** The row's user is a real user now (realUserSql); false for a row without a user. */
  real: boolean;
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
  period: Period;
  /** The month of `period.to`: the caps, the invoices and the reconciliation read it. */
  month: string;
  /** max(cost_entries.id) in the transaction: a label for which ledger rows the figures include. */
  asOf: number;
  /** The VND rate when the period sits in one month. */
  rate: string | null;
  /** Every month of the period has a rate, so VND sums add up. */
  hasRate: boolean;
  rows: Row[];
  /** The video budget: every ledger row of the month outside the image and apps features (shared rows and Smart Remakes included, other LLM calls left out), and its cap. */
  capUsageUsd: string;
  monthlyCapUsd: string;
  /** The image and apps budget and its hard cap. */
  featuresCapUsageUsd: string;
  featuresMonthlyCapUsd: string;
  /** The soft per-feature caps, with the month's spend on each feature without LLM calls. */
  featureCaps: { feature: string; monthlyUsd: string; spentUsd: string }[];
  invoices: InvoiceRow[];
  /** The period to compare with (comparedPeriod) and its sum over every row and over the real users' job and LLM rows. */
  previous: { period: Period; usd: string; realUsd: string };
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

/** A whole month as a period; null is this ICT month. `month` must already be a valid 'YYYY-MM'. */
export const wholeMonth = (month: string | null): Period => parsePeriod(new URLSearchParams(month === null ? {} : { month })) as Period;

// The ledger rows of a period ($1 months, $2 from, $3 to, $4 wholeMonths): a row without a day (a shared row) counts only for whole months.
const IN_PERIOD = 'ce.month = any($1::text[]) and (ce.day between $2::date and $3::date or (ce.day is null and $4::boolean))';
const periodParams = (p: Period) => [p.months, p.from, p.to, p.wholeMonths];

/** The period's ledger rows up to id `asOf`, with what the page and the job lists show about each. */
const readRows = async (tx: Queryable, p: Period, asOf: number): Promise<Row[]> =>
  (
    await tx.query(
      `select ce.id::int as id, ce.kind, ce.usd::text as usd, round_half_even(ce.usd * r.vnd_per_usd)::text as vnd, ce.month, ce.day::text as day,
              ce.job_id, j.feature, ce.provider, ce.model, mc.label as model_label, case when j.status = 'failed' and j.error = '${CANCELED_ERROR}' then 'canceled' else j.status end as job_status, to_char(j.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as job_created_at, ce.user_id, u.name as user_name, u.email, ce.team_id, t.name as team_name, t.cost_centre_code,
              ce.store_id, s.name as store_name, s.code as store_code, j.user_id as job_user, j.team_id as job_team, j.store_id as job_store,
              u.team_id as team_now_id, rt.name as team_now_name, coalesce(${realUserSql('u', 'rt')}, false) as real,
              coalesce(jc.is_final, true) as final, v.verdict,
              coalesce(j.status in ('failed', 'timed_out') and v.verdict is distinct from 'fail'
                       and (select sum(p.usd) from cost_entries p where p.job_id = ce.job_id and p.kind <> 'llm') > 0, false) as fail_status
         from cost_entries ce
         left join monthly_rates r on r.month = ce.month
         left join users u on u.id = ce.user_id
         left join teams t on t.id = ce.team_id
         left join teams rt on rt.id = u.team_id
         left join stores s on s.id = ce.store_id
         left join jobs j on j.id = ce.job_id
         left join model_configs mc on mc.id = ce.model
         left join job_costs jc on jc.job_id = ce.job_id
         left join verdicts v on v.job_id = ce.job_id
        where ${IN_PERIOD} and ce.id <= $5 order by ce.id`,
      [...periodParams(p), asOf],
    )
  ).rows;

/** The cut-off for `upTo` inside a REPEATABLE READ transaction. */
async function cutOff(tx: Queryable, upTo: number | null) {
  await tx.query('set transaction isolation level repeatable read read only');
  const latest = (await tx.query('select coalesce(max(id), 0)::int as n from cost_entries')).rows[0].n as number;
  return upTo === null ? latest : Math.min(upTo, latest);
}

/** Only the ledger rows of the period up to `upTo`: what a job list needs, without the caps, invoices and the comparison of the full snapshot. */
export const periodRows = (p: Period, upTo: number | null): Promise<Row[]> => withTransaction(pool, async (tx) => readRows(tx, p, await cutOff(tx, upTo)));

const DAY_MS = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10);

/**
 * The period a total is compared with: previousPeriod, cut to as many days as have passed when the period runs past today, so a month in
 * progress meets the same days of the month before rather than all of it.
 */
export function comparedPeriod(p: Period, today = todayIct()): Period {
  const prev = previousPeriod(p);
  if (p.to <= today || p.from > today) return prev;
  const to = addDays(prev.from, (Date.parse(today) - Date.parse(p.from)) / DAY_MS);
  return to < prev.to ? (parsePeriod(new URLSearchParams({ from: prev.from, to })) as Period) : prev;
}

/**
 * Reads the period's ledger rows, rates, the month's cap usage and invoices in one REPEATABLE READ transaction (the month is the one of
 * `period.to`). `upTo` keeps only the rows with an id up to it, so a CSV can show the rows the Costs page showed (the page's as_of).
 * shortcut: bigserial ids can commit out of order, so a row with a lower id committed after the page load would appear; upgrade to a stored snapshot if that matters
 */
export function snapshot(period: Period, upTo: number | null = null): Promise<Snapshot> {
  const month = period.to.slice(0, 7);
  return withTransaction(pool, async (tx) => {
    const asOf = await cutOff(tx, upTo);
    const rates = await tx.query('select month, vnd_per_usd::text as rate from monthly_rates where month = any($1::text[])', [period.months]);
    const cap = await tx.query(
      // LLM calls never count toward a cap (owner decision, 2026-11-04), except a Smart Remake's, which is video spend (limits.ts capRow).
      `with b as (select ce.usd, exists (select 1 from jobs j where j.id = ce.job_id and j.feature not in ('video', 'marketing')) as budget
                    from cost_entries ce where ce.month = $1 and (ce.kind <> 'llm' or ce.ref like 'llm:remake:%'))
       select coalesce((select sum(usd) from b where not budget), 0)::numeric(12, 4)::text as used,
              coalesce((select sum(usd) from b where budget), 0)::numeric(12, 4)::text as features_used,
              s.monthly_cap_usd::text as cap, s.features_monthly_cap_usd::text as features_cap
         from settings s where s.id = 1`,
      [month],
    );
    // A soft cap's spend: the month's job rows of the feature without LLM calls, as the page counted them from the month's rows before.
    const featureCaps = await tx.query(
      `select f.feature, f.monthly_usd::text as "monthlyUsd",
              (select coalesce(sum(ce.usd), 0)::numeric(12, 4)::text from cost_entries ce join jobs j on j.id = ce.job_id
                where ce.month = $1 and ce.id <= $2 and ce.kind <> 'llm' and j.feature = f.feature) as "spentUsd"
         from feature_caps f order by f.feature`,
      [month, asOf],
    );
    const rows = await readRows(tx, period, asOf);
    const compared = comparedPeriod(period);
    const previous = await tx.query(
      `select coalesce(sum(ce.usd), 0)::numeric(12, 4)::text as usd,
              coalesce(sum(ce.usd) filter (where (ce.job_id is not null or ce.kind = 'llm') and ${realUserSql('u', 'rt')}), 0)::numeric(12, 4)::text as real_usd
         from cost_entries ce left join users u on u.id = ce.user_id left join teams rt on rt.id = u.team_id
        where ${IN_PERIOD}`,
      periodParams(compared),
    );
    return {
      period, month, asOf, rate: period.months.length === 1 ? (rates.rows[0]?.rate ?? null) : null, hasRate: rates.rows.length === period.months.length,
      rows, capUsageUsd: cap.rows[0].used, monthlyCapUsd: cap.rows[0].cap,
      featuresCapUsageUsd: cap.rows[0].features_used, featuresMonthlyCapUsd: cap.rows[0].features_cap, featureCaps: featureCaps.rows,
      invoices: await invoiceRows(tx, month), previous: { period: compared, usd: previous.rows[0].usd, realUsd: previous.rows[0].real_usd },
    };
  });
}

const units = (usd: string) => BigInt(usd.replace('.', ''));
/** A row of a job, or an llm row (a suggestion or translation has no job), counts for its user, team and store; the rest are shared. */
const attributed = (r: Row) => r.job_id !== null || r.kind === 'llm';
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

/** The features whose results are clips: the cost per accepted clip counts only their provider rows (no LLM call) and their Pass verdicts. */
const CLIP_FEATURES = new Set(['video', 'marketing']);
const isClip = (r: Row) => r.job_id !== null && r.kind !== 'llm' && CLIP_FEATURES.has(r.feature ?? '');

interface Agg {
  usd: bigint; vnd: bigint; fvUsd: bigint; fvVnd: bigint; fsUsd: bigint; fsVnd: bigint;
  /** Pass verdicts on any feature, and on clips only, with the clip rows' spend. */
  passes: number; accepted: number; clipUsd: bigint; clipVnd: bigint;
}
const blank = (): Agg => ({ usd: 0n, vnd: 0n, fvUsd: 0n, fvVnd: 0n, fsUsd: 0n, fsVnd: 0n, passes: 0, accepted: 0, clipUsd: 0n, clipVnd: 0n });

/** Sums the job rows per `rowKey`; each job with a Pass verdict counts once for its `jobKey`, as an accepted clip when it is a clip. */
function aggregate(rows: Row[], rowKey: (r: Row) => string, jobKey: (r: Row) => string): Map<string, Agg> {
  const out = new Map<string, Agg>();
  const at = (k: string) => out.get(k) ?? out.set(k, blank()).get(k)!;
  const counted = new Set<string>();
  for (const r of rows) {
    if (!attributed(r)) continue;
    const a = at(rowKey(r));
    const usd = units(r.usd);
    const vnd = BigInt(r.vnd ?? 0);
    a.usd += usd;
    a.vnd += vnd;
    if (r.verdict === 'fail') { a.fvUsd += usd; a.fvVnd += vnd; }
    if (r.fail_status) { a.fsUsd += usd; a.fsVnd += vnd; }
    if (isClip(r)) { a.clipUsd += usd; a.clipVnd += vnd; }
    if (r.verdict === 'pass' && r.job_id && !counted.has(r.job_id)) {
      counted.add(r.job_id);
      const j = at(jobKey(r));
      j.passes++;
      if (CLIP_FEATURES.has(r.feature ?? '')) j.accepted++;
    }
  }
  return out;
}

const hasRate = (s: Snapshot) => s.hasRate;
const display = (usd: bigint) => fixed(divEven(usd, 100n), 2);
/** USD at 4 decimals and as a 2-decimal display value, and VND (null while a month of the period has no rate). */
const money = (s: Snapshot, usd: bigint, vnd: bigint) => ({ usd: fixed(usd, 4), usdDisplay: display(usd), vnd: hasRate(s) ? String(vnd) : null });

function figures(s: Snapshot, a: Agg) {
  const n = BigInt(a.accepted);
  return {
    ...money(s, a.usd, a.vnd),
    failedByVerdict: money(s, a.fvUsd, a.fvVnd),
    failedByStatus: money(s, a.fsUsd, a.fsVnd),
    acceptedResults: a.passes,
    acceptedClips: a.accepted,
    // Only the clip rows: an image or an LLM call is not part of what a clip cost.
    costPerAcceptedUsd: a.accepted ? fixed(divEven(a.clipUsd, n), 4) : null,
    costPerAcceptedVnd: a.accepted && hasRate(s) ? String(divEven(a.clipVnd, n)) : null,
  };
}

function groups(s: Snapshot, rowKey: (r: Row) => string, jobKey: (r: Row) => string, label: (r: Row) => Record<string, unknown>) {
  const labels = new Map<string, Record<string, unknown>>();
  for (const r of s.rows) if (attributed(r) && !labels.has(rowKey(r))) labels.set(rowKey(r), label(r));
  return [...aggregate(s.rows, rowKey, jobKey)]
    .sort(([ka, a], [kb, b]) => (a.usd === b.usd ? ka.localeCompare(kb) : a.usd < b.usd ? 1 : -1))
    .map(([id, a]) => ({ id, ...labels.get(id), ...figures(s, a) }));
}

/** The shared rows (bake-off, manual adjustments, invoice differences): the general-cost line. */
function sharedLine(s: Snapshot) {
  const shared = s.rows.filter((r) => !attributed(r));
  const sum = (rows: Row[]) => ({ usd: rows.reduce((t, r) => t + units(r.usd), 0n), vnd: rows.reduce((t, r) => t + BigInt(r.vnd ?? 0), 0n) });
  const byKind = Object.fromEntries(['bakeoff', 'manual_adjustment', 'invoice_diff'].map((k) => [k, fixed(sum(shared.filter((r) => r.kind === k)).usd, 4)]));
  return { ...money(s, sum(shared).usd, sum(shared).vnd), rows: shared.length, byKind };
}

/** How each breakdown of the page keys a row; the job list of one group uses the same keys. */
export const GROUP_KEYS = {
  user: (r: Row) => r.user_id ?? '',
  /** The team when the job ran (the Theo team tab and the CSVs). */
  team: (r: Row) => r.team_id ?? '',
  /** The user's team now, which owners read the page by. */
  teamNow: (r: Row) => r.team_now_id ?? '',
  store: (r: Row) => r.store_id ?? '',
  // Every LLM call (Enhance on a job too) is one line.
  feature: (r: Row) => (r.kind === 'llm' ? 'llm' : (r.feature ?? '')),
  model: (r: Row) => `${r.provider ?? ''}:${r.model ?? ''}`,
} as const;
export type GroupBy = keyof typeof GROUP_KEYS;

/** The rows a report shows: with `realOnly`, only the job and LLM rows of real users (realUserSql, by the user's team now). */
export const shownRows = (rows: Row[], realOnly: boolean) => (realOnly ? rows.filter((r) => attributed(r) && r.real) : rows);

/** The `real` query parameter: on unless it is '0'; undefined when it is neither '0' nor '1'. */
export function realParam(url: URL): boolean | undefined {
  const v = url.searchParams.get('real');
  return v === null || v === '1' ? true : v === '0' ? false : undefined;
}

/** A model id the model table has no label for, made readable: no fal-ai/ prefix, spaces for slashes. */
const modelName = (id: string | null) => (id ? id.replace(/^fal-ai\//, '').replaceAll('/', ' ') : 'Không rõ');

/** The job and LLM rows by provider and model, largest first, with how many jobs (provider rows) and LLM calls each holds. */
function byModel(s: Snapshot) {
  const out = new Map<string, { id: string; provider: string | null; model: string | null; label: string; usd: bigint; jobs: Set<string>; calls: number }>();
  for (const r of s.rows) {
    if (!attributed(r)) continue;
    const id = GROUP_KEYS.model(r);
    const g = out.get(id) ?? out.set(id, { id, provider: r.provider, model: r.model, label: r.model_label ?? modelName(r.model), usd: 0n, jobs: new Set(), calls: 0 }).get(id)!;
    g.usd += units(r.usd);
    if (r.kind === 'llm') g.calls++;
    else if (r.job_id) g.jobs.add(r.job_id);
  }
  return [...out.values()]
    .sort((a, b) => (a.usd === b.usd ? a.label.localeCompare(b.label) : a.usd < b.usd ? 1 : -1))
    .map((g) => ({ id: g.id, provider: g.provider, model: g.model, label: g.label, jobs: g.jobs.size, calls: g.calls, usd: fixed(g.usd, 4), usdDisplay: display(g.usd) }));
}

/** The rows by ICT day, one entry per calendar day of the period; rows without a day (some shared rows) are left out. */
function byDay(s: Snapshot) {
  const sums = new Map<string, bigint>();
  for (const r of s.rows) if (r.day) sums.set(r.day, (sums.get(r.day) ?? 0n) + units(r.usd));
  return Array.from({ length: s.period.days }, (_, i) => {
    const day = addDays(s.period.from, i);
    return { day, usd: fixed(sums.get(day) ?? 0n, 4) };
  });
}

const sum = (rows: Row[]) => rows.reduce((t, r) => ({ usd: t.usd + units(r.usd), vnd: t.vnd + BigInt(r.vnd ?? 0) }), { usd: 0n, vnd: 0n });

/**
 * The Costs page for the snapshot's period: totals by user, team (now and at job time), store, feature and model, by day, the grand total
 * with what `realOnly` hides, the period compared with, the general-cost line and the month's cap usage and invoices.
 */
export function costsPage(snap: Snapshot, realOnly = true) {
  const s = { ...snap, rows: shownRows(snap.rows, realOnly) };
  const all = sum(s.rows);
  const jobs = sum(s.rows.filter(attributed));
  const shared = sharedLine(snap);
  const hidden = sum(snap.rows).usd - all.usd;
  const { from, to, label, months, wholeMonths, days } = s.period;
  const prev = units(realOnly ? s.previous.realUsd : s.previous.usd);
  const byUser = groups(s, GROUP_KEYS.user, (r) => r.job_user ?? '', (r) => ({ name: r.user_name, email: r.email }));
  return {
    period: { from, to, label, months, wholeMonths, days },
    /** Shared rows without a day count only when the period is whole months. */
    sharedIncluded: wholeMonths,
    realOnly,
    /** The month of `period.to`: the caps and invoices are of this month. */
    month: s.month,
    asOf: s.asOf,
    provisional: s.rows.some((r) => r.job_id && !r.final),
    rateVndPerUsd: s.rate,
    total: money(s, all.usd, all.vnd),
    /** What `realOnly` leaves out: the other accounts' job and LLM rows, and the shared rows; zero when everything is shown. */
    hidden: {
      usd: fixed(hidden, 4),
      usdDisplay: display(hidden),
      accountsUsd: fixed(realOnly ? sum(snap.rows.filter((r) => attributed(r) && !r.real)).usd : 0n, 4),
      sharedUsd: realOnly ? shared.usd : '0.0000',
    },
    /** The period's shared rows, shown or not. */
    shared,
    previous: { from: s.previous.period.from, to: s.previous.period.to, label: s.previous.period.label, usd: fixed(prev, 4), usdDisplay: display(prev) },
    /** The shown job and LLM rows: the total without the shared line. */
    attributed: money(s, jobs.usd, jobs.vnd),
    /** Jobs with a shown row in the period, and users whose shown rows add up to more than zero. */
    counts: { creations: new Set(s.rows.flatMap((r) => (r.job_id ? [r.job_id] : []))).size, users: byUser.filter((g) => g.id && units(g.usd) > 0n).length },
    byUser,
    byTeam: groups(s, GROUP_KEYS.team, (r) => r.job_team ?? '', (r) => ({ name: r.team_name, costCentreCode: r.cost_centre_code })),
    byTeamNow: groups(s, GROUP_KEYS.teamNow, (r) => r.team_now_id ?? '', (r) => ({ name: r.team_now_name ?? NO_TEAM })),
    byStore: groups(s, GROUP_KEYS.store, (r) => r.job_store ?? '', (r) => ({ name: r.store_name ?? NO_STORE, code: r.store_code })),
    byFeature: groups(s, GROUP_KEYS.feature, (r) => r.feature ?? '', (r) => ({ name: r.kind === 'llm' ? LLM : featureLabel(r.feature) })),
    byModel: byModel(s),
    byDay: byDay(s),
    capUsage: { usd: s.capUsageUsd, monthlyCapUsd: s.monthlyCapUsd },
    featuresCapUsage: { usd: s.featuresCapUsageUsd, monthlyCapUsd: s.featuresMonthlyCapUsd },
    featureCaps: featureCapLines(s),
    invoices: s.invoices,
  };
}

/** The cap on the job list of one group: the CSV holds every row. */
export const JOB_LIST_LIMIT = 200;

/**
 * The jobs behind one line of a breakdown (`by` and the line's id), newest first, each with its rows summed; the group's LLM calls without a
 * job are one more line. At most JOB_LIST_LIMIT jobs; `more` counts the rest.
 */
export function groupJobs(rows: Row[], by: GroupBy, id: string) {
  const key = GROUP_KEYS[by];
  const jobs = new Map<string, { jobId: string; createdAt: string | null; feature: string; model: string; status: string | null; verdict: 'pass' | 'fail' | null; final: boolean; usd: bigint }>();
  let llm = { usd: 0n, calls: 0 };
  for (const r of rows) {
    if (!attributed(r) || key(r) !== id) continue;
    if (!r.job_id) {
      llm = { usd: llm.usd + units(r.usd), calls: llm.calls + 1 };
      continue;
    }
    const j = jobs.get(r.job_id) ?? jobs.set(r.job_id, { jobId: r.job_id, createdAt: r.job_created_at, feature: featureLabel(r.feature), model: r.model_label ?? r.model ?? 'Không rõ', status: r.job_status, verdict: r.verdict, final: r.final, usd: 0n }).get(r.job_id)!;
    j.usd += units(r.usd);
  }
  const all = [...jobs.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return {
    jobs: all.slice(0, JOB_LIST_LIMIT).map((j) => ({ ...j, usd: fixed(j.usd, 4) })),
    more: Math.max(all.length - JOB_LIST_LIMIT, 0),
    llm: llm.calls ? { calls: llm.calls, usd: fixed(llm.usd, 4) } : null,
  };
}

/** Each soft per-feature cap with the month's spend without LLM calls, and 80 or 100 once that share is reached (null below 80%). */
function featureCapLines(s: Snapshot) {
  return s.featureCaps.map(({ feature, monthlyUsd, spentUsd }) => {
    const usd = units(spentUsd);
    const cap = units(monthlyUsd);
    const level = cap > 0n && usd >= cap ? 100 : cap > 0n && usd * 10n >= cap * 8n ? 80 : null;
    return { feature, name: featureLabel(feature), capUsd: monthlyUsd, spentUsd, level };
  });
}

/** A whole month by its 'YYYY-MM', any other period by its two days. */
const periodName = (p: Period) => (p.wholeMonths && p.months.length === 1 ? p.months[0]! : `${p.from}_${p.to}`);

/** A CSV download with a label line holding the period, what it leaves out and as_of. */
const csv = (s: Snapshot, kind: string, header: string[], rows: (string | null)[][], note = '') =>
  csvResponse(`Creative Video Studio ${kind} ${periodName(s.period)}${note} as_of ${s.asOf}`, `cvs-${kind}-${periodName(s.period)}.csv`, header, rows);

/** The ledger detail: one line per ledger row of the period the page shows (`realOnly` as on the page). */
export function detailCsv(s: Snapshot, realOnly: boolean) {
  return csv(
    s, 'ledger-detail',
    ['month', 'date', 'job id', 'user', 'email', 'team', 'cost-centre code', 'store', 'store code', 'provider', 'model', 'entry kind', 'USD', 'VND', 'Tạm tính/Thật', 'Đạt/Không đạt'],
    shownRows(s.rows, realOnly).map((r) => [
      r.month, r.day, r.job_id, text(r.user_name), text(r.email), text(r.team_name), text(r.cost_centre_code), text(r.store_name), text(r.store_code),
      r.provider, r.model, r.kind, r.usd, r.vnd, r.final ? 'Thật' : 'Tạm tính', r.verdict === 'pass' ? 'Đạt' : r.verdict === 'fail' ? 'Không đạt' : null,
    ]),
    realOnly ? ' real users only' : '',
  );
}

/** The summary by team and store, with a general-cost row for the shared rows. */
export function summaryCsv(s: Snapshot) {
  const labels = new Map<string, Row>();
  const key = (team: string | null, store: string | null) => `${team ?? ''}\t${store ?? ''}`;
  for (const r of s.rows) if (attributed(r) && !labels.has(key(r.team_id, r.store_id))) labels.set(key(r.team_id, r.store_id), r);
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
