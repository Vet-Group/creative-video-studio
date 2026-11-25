'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type CSSProperties, Fragment, type KeyboardEvent, type ReactNode, startTransition, useOptimistic, useState } from 'react';
import { Icon } from '@/components/Icon';
import { LoadError } from '@/components/LoadError';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';
import { NO_CAP } from '@/lib/caps';
import { formatDay, formatMonth, parsePeriod, type Period, todayIct } from '@/lib/period';
import { Budget } from './AdminOverview';
import { CostViews } from './CostViews';
import { Empty, PageHead } from './PageHead';
import { PeriodPicker, periodHref } from './PeriodPicker';

interface Money {
  usd: string;
  usdDisplay: string;
  vnd: string | null;
}
interface Group extends Money {
  id: string;
  name?: string | null;
  email?: string | null;
  code?: string | null;
  failedByVerdict: Money;
  failedByStatus: Money;
  acceptedResults: number;
  acceptedClips: number;
  costPerAcceptedUsd: string | null;
}
interface ModelLine { id: string; provider: string | null; model: string | null; label: string; jobs: number; calls: number; usd: string; usdDisplay: string }
interface JobLine { jobId: string; createdAt: string | null; feature: string; model: string; status: string | null; verdict: 'pass' | 'fail' | null; final: boolean; usd: string; usdDisplay: string }
interface GroupJobs { jobs: JobLine[]; more: number; llm: { calls: number; usd: string; usdDisplay: string } | null }
interface Invoice {
  provider: string;
  totalUsd: string;
  ledgerUsd: string;
  diffUsd: string;
  red: boolean;
  utcMonthUsd: string;
}
/** GET /api/admin/costs. */
interface Costs {
  period: Period;
  sharedIncluded: boolean;
  realOnly: boolean;
  /** The month of the period's last day: the caps and invoices are of this month. */
  month: string;
  asOf: number;
  provisional: boolean;
  rateVndPerUsd: string | null;
  total: Money;
  hidden: { usd: string; usdDisplay: string; accountsUsd: string; sharedUsd: string };
  shared: Money & { byKind: Record<string, Money> };
  attributed: Money;
  previous: { from: string; to: string; label: string; usd: string; usdDisplay: string };
  counts: { creations: number; users: number };
  byUser: Group[];
  byTeamNow: Group[];
  byStore: Group[];
  byFeature: Group[];
  byModel: ModelLine[];
  byDay: { day: string; usd: string }[];
  capUsage: { usd: string; monthlyCapUsd: string };
  featuresCapUsage: { usd: string; monthlyCapUsd: string };
  featureCaps: { feature: string; name: string; capUsd: string; spentUsd: string; level: 80 | 100 | null }[];
  invoices: Invoice[];
}

const PROVIDERS = ['fal', 'vertex', 'byteplus'];
const KIND_LABEL: Record<string, string> = { bakeoff: 'Thử nghiệm mô hình', manual_adjustment: 'Điều chỉnh tay', invoice_diff: 'Chênh lệch hóa đơn' };
const vnd = (v: string | null) => (v === null ? '—' : `${Number(v).toLocaleString('vi-VN')} ₫`);

/** A USD amount with its sign before the dollar: -$0.12, not $-0.12. */
export const dollars = (v: string | number, digits = 2) => {
  const s = typeof v === 'number' ? v.toFixed(digits) : v;
  return s.startsWith('-') ? `-$${s.slice(1)}` : `$${s}`;
};
const STATUS: Record<string, string> = { queued: 'Đang chờ', submitting: 'Đang gửi', running: 'Đang tạo', succeeded: 'Xong', failed: 'Lỗi', timed_out: 'Quá giờ', failed_unknown: 'Lỗi', canceled: 'Đã huỷ' };
const PROVIDER: Record<string, string> = { fal: 'fal.ai', vertex: 'Vertex', byteplus: 'BytePlus', openai: 'OpenAI', replicate: 'Replicate', mock: 'Mock' };

/**
 * The 2-decimal amount; the exact 4-decimal amount (and the VND) shows on hover, and is read out to screen readers, which do not read a title.
 * `dashZero` shows a zero as a dash.
 */
export function Usd({ m, dashZero = false }: { m: Money; dashZero?: boolean }) {
  if (dashZero && /^-?0\.0+$/.test(m.usd)) return <span className="muted">—</span>;
  const exact = `${dollars(m.usd)}${m.vnd === null ? '' : ` · ${vnd(m.vnd)}`}`;
  return (
    <span title={exact}>
      {dollars(m.usdDisplay)}
      <span className="sr-only"> ({exact})</span>
    </span>
  );
}

/** The jobs behind one line, loaded when the line is opened; `query` holds the page's period, as_of and filter. */
function JobList({ query, by, id }: { query: string; by: string; id: string }) {
  const { data, failed, reload } = useFetch<GroupJobs>(`/api/admin/costs/jobs?${query}&by=${by}&id=${encodeURIComponent(id)}`);
  if (!data) return failed ? <LoadError text="Không tải được danh sách lượt tạo." onRetry={reload} /> : <p role="status">Đang tải lượt tạo...</p>;
  if (data.jobs.length === 0 && !data.llm) return <p className="muted">Không có lượt tạo nào.</p>;
  return (
    <>
      <table className="jobs" role="table" aria-label="Lượt tạo của dòng này">
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col">Lúc gửi</th>
            <th role="columnheader" scope="col">Mục</th>
            <th role="columnheader" scope="col">Mô hình</th>
            <th role="columnheader" scope="col">Trạng thái</th>
            <th role="columnheader" scope="col" className="num">USD</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {data.jobs.map((j) => (
            <tr key={j.jobId} role="row">
              <td role="cell">
                {j.createdAt ? new Date(j.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }) : '—'}{' '}
                <span className="muted" title={j.jobId}>
                  {j.jobId.slice(0, 8)}
                </span>
              </td>
              <td role="cell">{j.feature}</td>
              <td role="cell" className="model">{j.model}</td>
              <td role="cell">
                {STATUS[j.status ?? ''] ?? j.status ?? '—'}
                {j.verdict && <span className="tag">{j.verdict === 'pass' ? 'Đạt' : 'Không đạt'}</span>}
                {!j.final && <span className="tag">Tạm tính</span>}
              </td>
              <td role="cell" className="num">
                <Usd m={{ usd: j.usd, usdDisplay: j.usdDisplay, vnd: null }} />
              </td>
            </tr>
          ))}
          {data.llm && (
            <tr role="row">
              <td role="cell" colSpan={4}>LLM ngoài lượt tạo (Gợi ý, Dịch): {data.llm.calls} lượt gọi</td>
              <td role="cell" className="num">
                <Usd m={{ ...data.llm, vnd: null }} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {data.more > 0 && <p className="muted">Còn {data.more} lượt tạo cũ hơn; tải CSV chi tiết sổ cái để xem đủ.</p>}
    </>
  );
}

/** A column of a breakdown after its name, USD and share columns; `sort` gives the value it sorts by. */
interface Column<T> {
  label: string;
  className?: string;
  sort: (l: T) => number | string;
  cell: (l: T) => ReactNode;
}

/** A line's part of the shown total, as text: under 1% reads "<1%". */
export const shareText = (pct: number) => (pct <= 0 ? '0%' : pct < 1 ? '<1%' : `${Math.round(pct)}%`);

/**
 * One breakdown table, sortable by any column (largest USD first). A line's name opens the jobs behind it under the line, `title` (an email, a raw
 * model id) shows on hover, and the share bar is the line's part of `total`.
 */
export function Breakdown<T extends { id: string; usd: string; usdDisplay: string; vnd?: string | null }>({ label, lines, name, title, columns, total, jobs }: {
  label: string;
  lines: T[];
  name: (l: T) => string;
  title?: (l: T) => string | null | undefined;
  columns: Column<T>[];
  total: string;
  jobs: (id: string) => ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState({ col: 1, desc: true });
  const pct = (l: T) => (Number(total) > 0 ? (Math.max(Number(l.usd), 0) / Number(total)) * 100 : 0);
  const cols: Column<T>[] = [
    { label, sort: name, cell: () => null },
    { label: 'USD', className: 'num', sort: (l) => Number(l.usd), cell: (l) => <Usd m={{ vnd: null, ...l }} /> },
    {
      label: 'Tỉ lệ',
      className: 'num share',
      sort: (l) => Number(l.usd),
      cell: (l) => (
        <>
          <span className="share-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(pct(l), 100)}%` }} />
          </span>
          <span className="share-pct">{shareText(pct(l))}</span>
        </>
      ),
    },
    ...columns,
  ];
  const key = cols[sort.col]!.sort;
  const sorted = [...lines].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'vi');
    return sort.desc ? -c : c;
  });
  return (
    <div className="table-wrap">
      <table className="sticky-first cost-table" aria-label={label}>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={c.label} scope="col" className={c.className} aria-sort={i === sort.col ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                <button type="button" className="sort" onClick={() => setSort(i === sort.col ? { col: i, desc: !sort.desc } : { col: i, desc: i > 0 })}>
                  {c.label}
                  <span aria-hidden="true">{i === sort.col ? (sort.desc ? '↓' : '↑') : ''}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((l) => {
            const rowId = `cost-jobs-${l.id || 'none'}`;
            const expanded = open === l.id;
            return (
              <Fragment key={l.id}>
                <tr>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      title={title?.(l) ?? undefined}
                      aria-expanded={expanded}
                      aria-controls={expanded ? rowId : undefined}
                      onClick={() => setOpen(expanded ? null : l.id)}
                    >
                      <span aria-hidden="true">{expanded ? '▾' : '▸'}</span> {name(l)}
                    </button>
                  </td>
                  {cols.slice(1).map((c) => (
                    <td key={c.label} className={c.className}>
                      {c.cell(l)}
                    </td>
                  ))}
                </tr>
                {expanded && (
                  <tr id={rowId} className="drill">
                    <td colSpan={cols.length}>{jobs(l.id)}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Round axis steps of 1, 2, 2.5 or 5 times a power of ten, about four of them, from 0 to at least `max`. */
export function axisTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const p = 10 ** Math.floor(Math.log10(max / 4));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s * 4 >= max)!;
  return Array.from({ length: Math.ceil(max / step - 1e-9) + 1 }, (_, i) => i * step);
}

/**
 * One bar per day of the period on a $ axis, with the even daily pace that just meets the monthly video cap as a dashed line. Each bar is a button
 * (one tab stop, the arrow keys move between days) with its date and amount in a tooltip; choosing it filters the page to that day. The table
 * under it holds the same figures.
 */
export function DailyChart({ days, pace, onDay }: { days: { day: string; usd: string }[]; pace: number | null; onDay?(day: string): void }) {
  const values = days.map((d) => Math.max(Number(d.usd), 0));
  const [focus, setFocus] = useState(() => values.reduce((last, v, i) => (v > 0 ? i : last), 0));
  // Drawn even when nothing was spent, so the page keeps its layout and a day can still be chosen.
  const ticks = axisTicks(Math.max(...values, pace ?? 0));
  const at = (v: number) => `${(v / ticks[ticks.length - 1]!) * 100}%`;
  // About eight dates on a wide screen; a phone hides every other one (data-minor).
  const every = Math.ceil(days.length / 8);
  const date = (day: string) => formatDay(day).slice(0, 5);
  function move(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const next = ({ ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: days.length - 1 } as Record<string, number>)[e.key];
    if (next === undefined || next < 0 || next >= days.length) return;
    e.preventDefault();
    setFocus(next);
    (e.currentTarget.parentElement!.children[next] as HTMLElement).focus();
  }
  return (
    <section className="panel day-chart" aria-label="Chi theo ngày">
      <h2>Chi theo ngày</h2>
      <div className="day-plot" style={{ '--days': days.length } as CSSProperties}>
        <div className="day-axis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: at(t) }}>
              ${t.toLocaleString('en-US', { maximumFractionDigits: 4 })}
            </span>
          ))}
        </div>
        <div className="day-area">
          {ticks.map((t) => (
            <span key={t} className="day-grid" style={{ bottom: at(t) }} aria-hidden="true" />
          ))}
          {pace !== null && (
            <p className="day-pace" style={{ bottom: at(pace) }}>
              <span>Mức đều để vừa hạn mức video: {dollars(pace)}/ngày</span>
            </p>
          )}
          <div className="day-cols" role="group" aria-label="Các ngày; chọn một ngày để chỉ xem ngày đó" data-dense={days.length > 62 || undefined}>
            {days.map((d, i) => (
              <button
                key={d.day}
                type="button"
                tabIndex={i === focus ? 0 : -1}
                aria-label={`${formatDay(d.day)}: ${dollars(d.usd)}`}
                data-edge={i < days.length / 6 ? 'start' : i >= (days.length * 5) / 6 ? 'end' : undefined}
                style={{ '--h': at(values[i]!) } as CSSProperties}
                onFocus={() => setFocus(i)}
                onKeyDown={(e) => move(e, i)}
                onClick={() => onDay?.(d.day)}
              >
                <span className="day-tip" aria-hidden="true">
                  {date(d.day)}: {dollars(Number(d.usd))}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="day-x" aria-hidden="true">
          {days.map(
            (d, i) =>
              i % every === 0 && (
                <span key={d.day} style={{ gridColumn: i + 1 }} data-minor={(i / every) % 2 === 1 || undefined}>
                  {date(d.day)}
                </span>
              ),
          )}
        </div>
      </div>
      <details>
        <summary>Xem dạng bảng</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Ngày</th>
              <th scope="col" className="num">USD</th>
            </tr>
          </thead>
          <tbody>
            {days
              .filter((d) => Number(d.usd) !== 0)
              .map((d) => (
                <tr key={d.day}>
                  <td>{formatDay(d.day)}</td>
                  <td className="num">{dollars(d.usd, 4)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/** The total against the period compared with, in words, with an arrow beside it that is not the only cue. */
export function costChange(usd: string, prev: { usd: string; usdDisplay: string; label: string }): { arrow: string; text: string } {
  if (Number(prev.usd) <= 0) return { arrow: '', text: `${prev.label} chưa có chi phí để so sánh` };
  const was = `${prev.label} (${dollars(prev.usdDisplay)})`;
  const pct = Math.round(((Number(usd) - Number(prev.usd)) / Number(prev.usd)) * 100);
  if (pct === 0) return { arrow: '→', text: `Không đổi so với ${was}` };
  return { arrow: pct > 0 ? '↑' : '↓', text: `${pct > 0 ? 'Tăng' : 'Giảm'} ${Math.abs(pct)}% so với ${was}` };
}

/** The detail card's views, kept in the URL as `by` (user when absent): the switch label, the name column and the job list's `by`. */
const VIEWS = {
  user: { tab: 'Người dùng', head: 'Người dùng', by: 'user' },
  team: { tab: 'Team', head: 'Team hiện tại', by: 'teamNow' },
  store: { tab: 'Cửa hàng', head: 'Cửa hàng', by: 'store' },
  feature: { tab: 'Tính năng', head: 'Tính năng', by: 'feature' },
  model: { tab: 'Mô hình', head: 'Mô hình', by: 'model' },
} as const;
type View = keyof typeof VIEWS;

/** How many jobs (provider rows) and LLM calls a model line holds, each in its own unit. */
export const modelUnits = (l: { jobs: number; calls: number }) => [l.jobs && `${l.jobs} lượt tạo`, l.calls && `${l.calls} lượt gọi`].filter(Boolean).join(' · ') || '—';
const providerName = (p: string | null) => (p ? (PROVIDER[p] ?? p) : '—');

const groupColumns = (withVnd: boolean): Column<Group>[] => [
  ...(withVnd ? [{ label: 'VND', className: 'num', sort: (g: Group) => Number(g.vnd), cell: (g: Group) => vnd(g.vnd) }] : []),
  { label: 'Không đạt', className: 'num', sort: (g) => Number(g.failedByVerdict.usd), cell: (g) => <Usd m={g.failedByVerdict} dashZero /> },
  { label: 'Lỗi hoặc quá giờ', className: 'num', sort: (g) => Number(g.failedByStatus.usd), cell: (g) => <Usd m={g.failedByStatus} dashZero /> },
  { label: 'Đạt', className: 'num', sort: (g) => g.acceptedResults, cell: (g) => g.acceptedResults || <span className="muted">—</span> },
  {
    label: 'Mỗi clip đạt',
    className: 'num',
    sort: (g) => Number(g.costPerAcceptedUsd ?? -1),
    cell: (g) => (g.costPerAcceptedUsd === null ? <span className="muted">—</span> : dollars(g.costPerAcceptedUsd, 4)),
  },
];
const MODEL_COLUMNS: Column<ModelLine>[] = [
  { label: 'Nhà cung cấp', sort: (l) => providerName(l.provider), cell: (l) => providerName(l.provider) },
  { label: 'Số lượng', className: 'num', sort: (l) => l.jobs + l.calls, cell: modelUnits },
];

/** The one detail card: a switch between the five breakdowns, each sortable with share bars, and the jobs behind a line under it. */
function Details({ data, view, onView, query }: { data: Costs; view: View; onView(v: View): void; query: string }) {
  const jobs = (id: string) => <JobList query={query} by={VIEWS[view].by} id={id} />;
  const groups = { user: data.byUser, team: data.byTeamNow, store: data.byStore, feature: data.byFeature };
  return (
    <section className="panel cost-detail" aria-label="Chi tiết chi phí">
      <div className="panel-head">
        <h2>Chi tiết chi phí</h2>
        <div className="segmented preset-chips" role="group" aria-label="Xem theo">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <button key={v} type="button" aria-pressed={v === view} onClick={() => onView(v)}>
              {VIEWS[v].tab}
            </button>
          ))}
        </div>
      </div>
      {(view === 'model' ? data.byModel : groups[view]).length === 0 ? (
        <Empty title={`Không có chi phí nào trong ${data.period.label}.`} />
      ) : view === 'model' ? (
        <Breakdown key={view} label={VIEWS.model.head} lines={data.byModel} name={(l) => l.label} title={(l) => l.model} columns={MODEL_COLUMNS} total={data.total.usd} jobs={jobs} />
      ) : (
        <Breakdown key={view} label={VIEWS[view].head} lines={groups[view]} name={(g) => g.name ?? g.id} title={(g) => g.email} columns={groupColumns(data.total.vnd !== null)} total={data.total.usd} jobs={jobs} />
      )}
    </section>
  );
}

/** The overview tab's figures: the KPI row, what the filter hides, the daily chart, the detail card and how it is counted. */
function Overview({ data, view, onView, onDay, reconcile }: { data: Costs; view: View; onView(v: View): void; onDay(day: string): void; reconcile: string }) {
  const p = data.period;
  const today = todayIct();
  const elapsed = p.to <= today || p.from > today ? p.days : (Date.parse(today) - Date.parse(p.from)) / 86_400_000 + 1;
  const cap = Number(data.capUsage.monthlyCapUsd);
  const pace = cap > 0 && cap < NO_CAP ? cap / (parsePeriod(new URLSearchParams({ month: data.month })) as Period).days : null;
  const change = costChange(data.total.usd, data.previous);
  const query = `from=${p.from}&to=${p.to}&asOf=${data.asOf}${data.realOnly ? '' : '&real=0'}`;
  const figures: [string, string, string][] = [
    ['Lượt tạo', data.counts.creations.toLocaleString('vi-VN'), 'Lượt tạo có chi phí trong khoảng này'],
    ['Người dùng có chi phí', data.counts.users.toLocaleString('vi-VN'), data.realOnly ? 'Chỉ người dùng thật' : 'Mọi tài khoản'],
    ['Trung bình mỗi ngày', dollars(Number(data.total.usd) / elapsed), `Trên ${elapsed} ngày`],
  ];
  return (
    <>
      <div className="kpis cost-kpis" role="group" aria-label={`Số liệu ${p.label}`}>
        <div className="kpi" role="group" aria-label="Tổng chi phí">
          <p className="kpi-label">
            Tổng chi phí
            {data.provisional && <span className="tag">Tạm tính</span>}
          </p>
          <p className="kpi-value">{dollars(data.total.usdDisplay)}</p>
          <p className="kpi-sub">
            {dollars(data.total.usd)}
            {data.total.vnd !== null && ` · ${vnd(data.total.vnd)}`}
          </p>
          <p className="kpi-sub cost-change">
            {change.arrow && <span aria-hidden="true">{change.arrow} </span>}
            {change.text}
          </p>
        </div>
        {figures.map(([label, value, sub]) => (
          <div key={label} className="kpi" role="group" aria-label={label}>
            <p className="kpi-label">{label}</p>
            <p className="kpi-value">{value}</p>
            <p className="kpi-sub">{sub}</p>
          </div>
        ))}
        <Budget title={`Hạn mức video ${formatMonth(data.month)}`} used={data.capUsage.usd} cap={data.capUsage.monthlyCapUsd} />
        <Budget title={`Hạn mức ảnh và ứng dụng ${formatMonth(data.month)}`} used={data.featuresCapUsage.usd} cap={data.featuresCapUsage.monthlyCapUsd} />
      </div>
      {data.realOnly && data.hidden.usd !== '0.0000' && (
        <p className="muted cost-note">
          Đang ẩn {dollars(data.hidden.usdDisplay)}: tài khoản hệ thống, tài khoản thử và team không tính báo cáo {dollars(Number(data.hidden.accountsUsd))}
          {data.sharedIncluded && (
            <>
              ; chi phí chung {dollars(Number(data.hidden.sharedUsd))} (xem tab <Link href={reconcile}>Đối soát</Link>)
            </>
          )}
          .
        </p>
      )}
      {!data.realOnly && !data.sharedIncluded && (
        <p className="muted cost-note">Khoảng này không trọn tháng nên chưa gồm chi phí chung không gắn ngày (điều chỉnh tay, chênh lệch hóa đơn).</p>
      )}
      {data.featureCaps.some((c) => c.level !== null) && (
        <ul className="warn" aria-label="Cảnh báo hạn mức theo mục">
          {data.featureCaps
            .filter((c) => c.level !== null)
            .map((c) => (
              <li key={c.feature}>
                {c.name}: ${c.spentUsd} trên hạn mức ${c.capUsd} ({c.level === 100 ? 'đã chạm hạn mức' : 'đã quá 80%'}). Hạn mức này chỉ để cảnh báo, không chặn Run.
              </li>
            ))}
        </ul>
      )}
      <DailyChart key={`${p.from}-${p.to}`} days={data.byDay} pace={pace} onDay={onDay} />
      <Details data={data} view={view} onView={onView} query={query} />
      <p className="muted">Bấm một dòng để xem các lượt tạo của nó; rê chuột lên số tiền để xem số lẻ 4 chữ số.</p>
      <details className="cost-method">
        <summary>Cách tính</summary>
        <ul className="lines">
          <li>Theo ngày phát sinh chi phí, giờ Việt Nam; số liệu tính đến dòng sổ cái #{data.asOf}.</li>
          <li>
            Chỉ người dùng thật: bỏ tài khoản hệ thống, tài khoản thử và các team được đánh dấu không tính báo cáo, theo team hiện tại của mỗi người. Chi phí chung (thử nghiệm
            mô hình, điều chỉnh tay, chênh lệch hóa đơn) nằm ở tab Đối soát và chỉ được tính khi chọn trọn tháng.
          </li>
          <li>Team hiện tại: team của người dùng bây giờ. Tab Theo team và các tệp CSV tính theo team lúc tạo.</li>
          <li>So sánh với cùng số ngày ngay trước khoảng này; tháng đang chạy so với cùng số ngày đầu tháng trước. Hạn mức tính cho cả tháng và mọi tài khoản.</li>
          <li>
            Không đạt: tiền của kết quả bị chấm Không đạt. Lỗi hoặc quá giờ: lượt tạo lỗi mà vẫn bị tính tiền. Đạt: số kết quả được chấm Đạt. Mỗi clip đạt: tiền của Tạo video và
            Marketing Studio chia cho số clip được chấm Đạt.
          </li>
          <li>Mô hình: lượt tạo là số lần tạo dùng mô hình đó, lượt gọi là số lần gọi LLM (Dịch, Gợi ý, Cải thiện, Smart Remake).</li>
        </ul>
      </details>
    </>
  );
}

function InvoiceForm({ provider, month, invoice, run, pending }: { provider: string; month: string; invoice?: Invoice; run: ReturnType<typeof useAction>['run']; pending: boolean }) {
  const [total, setTotal] = useState(invoice ? invoice.totalUsd : '');
  return (
    <li>
      <div className="row">
        <label>
          Tổng hóa đơn {provider} (USD)
          <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={pending || total.trim() === ''}
          onClick={() => void run(() => api('/api/admin/invoices', sendJson('PUT', { month, provider, totalUsd: total.trim() })), 'Không ghi được hóa đơn.')}
        >
          Ghi hóa đơn {provider}
        </button>
      </div>
      {invoice && (
        <>
          <p>
            Trong app ghi: {dollars(invoice.ledgerUsd, 4)} · Chênh lệch:{' '}
            <strong className={invoice.red ? 'error' : undefined}>
              {dollars(invoice.diffUsd, 4)}
              {invoice.red && ' (lệch quá 5%)'}
            </strong>
            {invoice.utcMonthUsd !== invoice.ledgerUsd && ` · Nếu tính theo tháng UTC: ${dollars(invoice.utcMonthUsd, 4)}`}
          </p>
          {Number(invoice.diffUsd) > 0 && (
            <p className="muted">Phần chênh là tiền nhà cung cấp tính ngoài các lượt tạo của app (chạy thử, canary trên cùng tài khoản) và đã được tính vào Chi phí chung.</p>
          )}
        </>
      )}
      {provider === 'vertex' && <p className="muted">Hóa đơn vertex được hệ thống tự ghi mỗi ngày từ billing export của Google (tổng mọi tài khoản Vertex).</p>}
    </li>
  );
}

interface VertexAccountCosts {
  projectId: string;
  active: boolean;
  error?: { reason: 'no_access' | 'no_export' | 'failed'; message: string };
  monthUsd: number;
  monthCreditsUsd: number;
  skus: { skuId: string; sku: string; usage: number; unit: string; costUsd: number; creditsUsd: number }[];
  credit: { total: number | null; currency: string; used: number | null; remaining: number | null; remainingUsd: number | null; expiresOn: string | null; stopWhenCreditsEnd: boolean; unverified: boolean };
}
type VertexCostsData =
  | { configured: false; error?: string }
  | { configured: true; accounts: VertexAccountCosts[]; totalMonthUsd: number; prices: { label: string; appUsd: number | null; googleUsd: number | null; red: boolean }[] };

const VERTEX_ERROR: Record<string, (project: string) => string> = {
  no_access: (p) => `Chưa có quyền đọc billing export của ${p}: cấp BigQuery Data Viewer và BigQuery Job User cho khoá của app.`,
  no_export: (p) => `${p} chưa có bảng billing export (dataset billing_export).`,
  failed: (p) => `Không đọc được billing của ${p}.`,
};

/** One short sentence per Vertex read error; Google's raw answer sits folded under "Chi tiết", so touch screens and keyboards can open it too. */
export const VertexError = ({ projectId, reason, message }: { projectId: string; reason: string; message: string }) => (
  <>
    <p className="error">{(VERTEX_ERROR[reason] ?? VERTEX_ERROR.failed!)(projectId)}</p>
    {message && (
      <details className="raw">
        <summary>Chi tiết</summary>
        <pre>{message.slice(0, 500)}</pre>
      </details>
    )}
  </>
);
const usd2 = (n: number | null) => (n === null ? '—' : dollars(n, 2));
const UNIT: Record<string, string> = { count: 'lượt', second: 'giây', seconds: 'giây' };
const credits = (n: number | null, currency: string) => (n === null ? '—' : `${n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ${currency}`);

interface Balances {
  warningUsd: number;
  fal: ({ ok: true; balance: number; currency: string } | { ok: false; reason: 'no_key' | 'failed'; error: string }) & { billingUrl: string; low: boolean };
  vertex: { billingUrl: string };
  byteplus: { billingUrl: string; pack: BytePlusPackBalance | null };
}
interface BytePlusPackBalance {
  totalTokens: number;
  tokensLeft: number;
  percentLeft: number;
  usdLeft: number;
  expiresAt: string;
  expired: boolean;
  daysLeft: number;
  low: boolean;
}

/** The Seedance 2.0 resource pack: tokens left of the total, ≈ USD at the pack's price, the expiry day, and why it is red when it is. */
export const packText = (p: BytePlusPackBalance) => {
  const n = (v: number) => v.toLocaleString('vi-VN');
  const why = p.expired ? ' (đã hết hạn)' : p.daysLeft < 14 ? ` (còn ${Math.ceil(p.daysLeft)} ngày)` : p.percentLeft < 20 ? ' (dưới 20%)' : '';
  return `Còn ${n(p.tokensLeft)} / ${n(p.totalTokens)} token (${p.percentLeft.toFixed(1)}%) · ≈ $${p.usdLeft.toFixed(2)} theo giá lẻ · hết hạn ${p.expiresAt.slice(0, 10)}${why}`;
};

/** A neutral button, not a red link: red on this panel means a balance under the warning threshold. */
export const TopUp = ({ href }: { href: string }) => (
  <a className="button" href={href} target="_blank" rel="noreferrer">
    Nạp tiền
  </a>
);

/**
 * One row per provider with its billing page: no provider sells credit by API, so the app only shows balances and warns. Loaded on its own, so
 * a failed read leaves the rest of the page; the Vertex rows reuse the Vertex section's answer instead of reading Google twice.
 */
function ProviderBalances({ vertex }: { vertex: VertexCostsData | undefined }) {
  const { data, failed, reload } = useFetch<Balances>('/api/admin/costs/balances');
  const under = (low: boolean) => (low && data ? ` (dưới ngưỡng $${data.warningUsd})` : '');
  return (
    <section className="panel" aria-label="Số dư nhà cung cấp">
      <h2>Số dư nhà cung cấp</h2>
      {!data ? (
        failed ? <LoadError text="Không tải được số dư nhà cung cấp." onRetry={reload} /> : <p role="status">Đang đọc số dư...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Nhà cung cấp</th>
                <th scope="col">Số dư</th>
                <th scope="col">Thanh toán</th>
              </tr>
            </thead>
            <tbody>
              <tr className={data.fal.low ? 'error' : undefined}>
                <td>fal.ai</td>
                <td>
                  {data.fal.ok
                    ? `${data.fal.currency === 'USD' ? '$' : ''}${data.fal.balance.toFixed(2)}${data.fal.currency === 'USD' ? '' : ` ${data.fal.currency}`}${under(data.fal.low)}`
                    : data.fal.reason === 'no_key'
                      ? 'Máy chủ chưa có FAL_KEY.'
                      : `Không đọc được số dư fal (${data.fal.error.slice(0, 200)}).`}
                </td>
                <td>
                  <TopUp href={data.fal.billingUrl} />
                </td>
              </tr>
              {!vertex || !vertex.configured ? (
                <tr>
                  <td>Google Vertex AI</td>
                  <td className="muted">{!vertex ? 'Đang đọc từ Google...' : 'Chưa có số liệu (xem phần Vertex bên dưới).'}</td>
                  <td>
                    <TopUp href={data.vertex.billingUrl} />
                  </td>
                </tr>
              ) : (
                vertex.accounts.map((a) => {
                  const low = a.credit.remainingUsd !== null && a.credit.remainingUsd < data.warningUsd;
                  return (
                    <tr key={a.projectId} className={low ? 'error' : undefined}>
                      <td>Vertex · {a.projectId}</td>
                      <td>
                        {a.credit.remainingUsd === null ? (a.credit.unverified ? 'Chưa xác minh credits' : 'Chưa nhập tổng credits') : `≈ $${a.credit.remainingUsd.toFixed(2)} credits${under(low)}`}
                        {a.credit.expiresOn && ` · hết hạn ${a.credit.expiresOn}`}
                      </td>
                      <td>
                        <TopUp href={data.vertex.billingUrl} />
                      </td>
                    </tr>
                  );
                })
              )}
              <tr>
                <td>BytePlus ModelArk</td>
                <td className="muted">Không có API số dư; xem trên trang thanh toán của BytePlus.</td>
                <td>
                  <TopUp href={data.byteplus.billingUrl} />
                </td>
              </tr>
              {data.byteplus.pack && (
                <tr className={data.byteplus.pack.low ? 'error' : undefined}>
                  <td>BytePlus · Gói Seedance 2.0</td>
                  <td>{packText(data.byteplus.pack)}</td>
                  <td>
                    <TopUp href={data.byteplus.billingUrl} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** The balances and the Vertex section share one read of Google. */
function ProviderSections({ month }: { month: string }) {
  const { data, failed, reload } = useFetch<VertexCostsData>(`/api/admin/costs/vertex?month=${month}`);
  return (
    <>
      <ProviderBalances vertex={data} />
      <VertexCosts month={month} data={data} failed={failed} reload={reload} />
    </>
  );
}

/** Google's own figures, read live from each account's billing export; loaded on its own so a Google failure leaves the rest of the page. The accounts fold under one line. */
function VertexCosts({ month, data, failed, reload }: { month: string; data: VertexCostsData | undefined; failed: boolean; reload: () => void }) {
  return (
    <section className="panel" aria-label="Vertex (Google Cloud)">
      <h2>Vertex (Google Cloud)</h2>
      {!data ? (
        failed ? <LoadError text="Không tải được số liệu Vertex từ Google." onRetry={reload} /> : <p role="status">Đang đọc số liệu từ Google...</p>
      ) : !data.configured ? (
        data.error ? <p className="error">Không đọc được khoá Vertex trên máy chủ ({data.error}).</p> : <p className="muted">Máy chủ chưa có khoá Vertex nào.</p>
      ) : (
        <>
          <p>
            Google tính Vertex {formatMonth(month)}: <strong>{usd2(data.totalMonthUsd)}</strong> (mọi tài khoản, trước khi trừ credits; billing export trễ vài giờ).
          </p>
          {data.accounts.map((a) => a.error && <VertexError key={a.projectId} projectId={a.projectId} reason={a.error.reason} message={a.error.message} />)}
          <details>
            <summary>Chi tiết {data.accounts.length} tài khoản Vertex</summary>
            {data.accounts.map((a) => (
              <div key={a.projectId}>
                <h3>
                  {a.projectId}
                  {a.active && <span className="tag">Đang dùng</span>}
                  {a.credit.unverified && <span className="tag">Chưa xác minh credits</span>}
                </h3>
                <ul className="lines">
                  <li>
                    Chi phí tháng: {usd2(a.monthUsd)} · Credits đã trừ: {usd2(a.monthCreditsUsd)}
                  </li>
                  <li>
                    Credits: đã dùng {credits(a.credit.used, a.credit.currency)} trên {credits(a.credit.total, a.credit.currency)}, còn {credits(a.credit.remaining, a.credit.currency)}
                    {a.credit.remainingUsd !== null && ` (≈ $${a.credit.remainingUsd.toFixed(2)})`} · Hết hạn: {a.credit.expiresOn ?? '—'}
                    {a.credit.stopWhenCreditsEnd && ' · Dừng khi hết credits'}
                  </li>
                </ul>
                {a.skus.length > 0 && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Hạng mục Google</th>
                          <th scope="col" className="num">Lượng dùng</th>
                          <th scope="col" className="num">USD</th>
                          <th scope="col" className="num">Credits đã trừ (USD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.skus.map((s) => (
                          <tr key={s.skuId}>
                            <td>
                              {s.sku} <span className="muted">({s.skuId})</span>
                            </td>
                            <td className="num">
                              {s.usage.toLocaleString('vi-VN')} {UNIT[s.unit] ?? s.unit}
                            </td>
                            <td className="num">{usd2(s.costUsd)}</td>
                            <td className="num">{usd2(s.creditsUsd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </details>
          <h3>Kiểm tra giá với Google</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Mô hình</th>
                  <th scope="col" className="num">Giá trong app (USD/giây)</th>
                  <th scope="col" className="num">Giá Google (USD/giây)</th>
                </tr>
              </thead>
              <tbody>
                {data.prices.map((p) => (
                  <tr key={p.label} className={p.red ? 'error' : undefined}>
                    <td>
                      {p.label}
                      {p.red && ' (lệch quá 1%)'}
                    </td>
                    <td className="num">{p.appUsd ?? '—'}</td>
                    <td className="num">{p.googleUsd ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** The reconciliation tab's forms: the month's VND rate, the shared line with the manual adjustment form, and the provider invoices. */
function ReconcileBody({ data, reload }: { data: Costs; reload: () => void }) {
  const { problem, pending, run } = useAction(reload);
  const [rate, setRate] = useState(data.rateVndPerUsd ?? '');
  const [adjustUsd, setAdjustUsd] = useState('');
  const [note, setNote] = useState('');
  const month = data.month;
  const withVnd = data.rateVndPerUsd !== null;

  async function adjust() {
    const ok = await run(() => api('/api/admin/costs/adjustments', sendJson('POST', { month, usd: adjustUsd.trim(), note })), 'Không thêm được điều chỉnh.');
    if (ok) {
      setAdjustUsd('');
      setNote('');
    }
  }

  return (
    <>
      <p className="muted cost-note">
        Sổ cái {formatMonth(month)}, mọi tài khoản: <Usd m={data.total} /> · Lượt tạo và LLM {dollars(data.attributed.usdDisplay)} · Chi phí chung {dollars(data.shared.usdDisplay)}
        {data.provisional && <span className="tag">Tạm tính</span>}
      </p>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="row">
        <label>
          Tỉ giá VND/USD {formatMonth(month)}
          <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
        <button type="button" disabled={pending || rate.trim() === ''} onClick={() => void run(() => api(`/api/admin/rates/${month}`, sendJson('PUT', { vndPerUsd: rate.trim() })), 'Không lưu được tỉ giá.')}>
          Lưu tỉ giá
        </button>
      </div>
      {!withVnd && <p className="muted">Tháng này chưa có tỉ giá; nhập tỉ giá để thêm cột VND.</p>}

      <div className="cost-cards">
        <section className="panel" aria-label="Chi phí chung">
          <h2>Chi phí chung</h2>
          <p className="panel-figure">
            <Usd m={data.shared} />
            {withVnd && <span className="muted"> · {vnd(data.shared.vnd)}</span>}
          </p>
          <ul className="lines">
            {Object.entries(data.shared.byKind).map(([kind, m]) => (
              <li key={kind}>
                {KIND_LABEL[kind] ?? kind}: <Usd m={m} />
              </li>
            ))}
          </ul>
          <h3>Thêm điều chỉnh tay</h3>
          <div className="row">
            <label>
              Số tiền điều chỉnh (USD, có thể âm)
              <input inputMode="decimal" value={adjustUsd} onChange={(e) => setAdjustUsd(e.target.value)} />
            </label>
            <label>
              Ghi chú (bắt buộc)
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button type="button" disabled={pending || adjustUsd.trim() === '' || note.trim() === ''} onClick={() => void adjust()}>
              Thêm điều chỉnh
            </button>
          </div>
        </section>

        <section className="panel" aria-label="Hóa đơn nhà cung cấp">
          <h2>Hóa đơn nhà cung cấp</h2>
          <p className="muted">Nhập tổng hóa đơn của tháng; hệ thống ghi phần chênh lệch với sổ cái. Lệch quá 5% được tô đỏ.</p>
          <ul className="invoices">
            {PROVIDERS.map((p) => (
              <InvoiceForm key={p} provider={p} month={month} invoice={data.invoices.find((i) => i.provider === p)} run={run} pending={pending} />
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

/** A month `n` months after `month` ('YYYY-MM'). */
const shiftMonth = (month: string, n: number) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

/**
 * Admin > Costs, the reconciliation tab: the month of the period's last day with every row, as accounting gets it: the rate, the shared costs and manual
 * adjustments, the provider invoices and balances, Vertex and the summary CSV. The month steps keep the address's other parameters.
 */
export function AdminCostReconcile({ search }: { search: string }) {
  const p = parsePeriod(new URLSearchParams(search));
  const month = ('error' in p ? todayIct() : p.to).slice(0, 7);
  const { data, failed, reload } = useFetch<Costs>(`/api/admin/costs?month=${month}&real=0`, { onTabReturn: true });
  const step = (n: number) => {
    const m = parsePeriod(new URLSearchParams({ month: shiftMonth(month, n) })) as Period;
    return { label: formatMonth(m.months[0]!), href: periodHref('/admin/costs/reconcile', search, m) };
  };
  const [prev, next] = [step(-1), step(1)];
  // No month after the current one: it has no costs yet.
  const hasNext = shiftMonth(month, 1) <= todayIct().slice(0, 7);
  return (
    <section aria-labelledby="reconcile-title">
      <CostViews search={search} />
      <PageHead id="reconcile-title" title={`Đối soát ${formatMonth(month)}`} lead="Tỉ giá, chi phí chung, hóa đơn và số dư nhà cung cấp của cả tháng, tính mọi tài khoản: phần gửi kế toán.">
        <nav className="month-step" aria-label="Tháng đối soát">
          <Link className="button" href={prev.href} aria-label={`Tháng trước: ${prev.label}`}>
            <span aria-hidden="true">‹</span> {prev.label}
          </Link>
          {hasNext && (
            <Link className="button" href={next.href} aria-label={`Tháng sau: ${next.label}`}>
              {next.label} <span aria-hidden="true">›</span>
            </Link>
          )}
        </nav>
        {data && (
          <a className="button" href={`/api/admin/costs/summary?month=${data.month}&asOf=${data.asOf}`} download>
            <Icon name="download" />
            Tải CSV tổng hợp theo nhóm và cửa hàng
          </a>
        )}
      </PageHead>
      {!data ? (
        failed ? <LoadError text="Không tải được số liệu đối soát." onRetry={reload} /> : <p role="status">Đang tải...</p>
      ) : (
        <ReconcileBody key={`${data.month}-${data.asOf}`} data={data} reload={reload} />
      )}
      <ProviderSections month={month} />
    </section>
  );
}

/** Admin > Costs, the overview tab: the period's spend (real users only unless switched off), with the period, the filter and the detail view kept in the URL. */
export function AdminCosts({ search: current }: { search: string }) {
  const router = useRouter();
  // The checkbox and the view switch show a click at once, before the server page brings the new address back.
  const [search, setSearch] = useOptimistic(current);
  const q = new URLSearchParams(search);
  const parsed = parsePeriod(q);
  const period = 'error' in parsed ? (parsePeriod(new URLSearchParams()) as Period) : parsed;
  const realOnly = q.get('real') !== '0';
  const by = q.get('by') ?? '';
  const view: View = Object.hasOwn(VIEWS, by) ? (by as View) : 'user';
  const query = `from=${period.from}&to=${period.to}${realOnly ? '' : '&real=0'}`;
  const { data, failed, reload } = useFetch<Costs>(`/api/admin/costs?${query}`, { onTabReturn: true });
  const replace = (href: string) => router.replace(href, { scroll: false });
  function set(key: string, value: string | null) {
    const next = new URLSearchParams(window.location.search);
    if (value === null) next.delete(key);
    else next.set(key, value);
    startTransition(() => {
      setSearch(next.toString());
      replace(`${window.location.pathname}?${next}`);
    });
  }
  return (
    <section aria-labelledby="costs-title">
      <CostViews search={search} />
      <PageHead id="costs-title" title="Chi phí" lead="Chi phí theo ngày (giờ Việt Nam), theo người dùng, team, cửa hàng, tính năng và mô hình.">
        {data && (
          <a className="button" href={`/api/admin/costs/detail?${query}&asOf=${data.asOf}`} download>
            <Icon name="download" />
            Tải CSV chi tiết sổ cái
          </a>
        )}
      </PageHead>
      {'error' in parsed && (
        <p className="error" role="alert">
          Khoảng ngày trong địa chỉ không hợp lệ; đang hiện tháng này.
        </p>
      )}
      <div className="cost-controls">
        <PeriodPicker period={period} />
        <label className="check">
          <input type="checkbox" checked={realOnly} onChange={(e) => set('real', e.target.checked ? null : '0')} />
          Chỉ người dùng thật
        </label>
      </div>
      {!data ? (
        failed ? <LoadError text="Không tải được chi phí." onRetry={reload} /> : <p role="status">Đang tải...</p>
      ) : (
        <>
          {failed && <LoadError text="Không tải được khoảng này, đang hiện số liệu trước đó." onRetry={reload} />}
          <Overview
            data={data}
            view={view}
            onView={(v) => set('by', v === 'user' ? null : v)}
            onDay={(day) => replace(periodHref(window.location.pathname, window.location.search, { from: day, to: day }))}
            reconcile={`/admin/costs/reconcile${search && `?${search}`}`}
          />
        </>
      )}
    </section>
  );
}
