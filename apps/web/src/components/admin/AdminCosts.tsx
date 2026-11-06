'use client';
import { type CSSProperties, Fragment, useState } from 'react';
import { Icon } from '@/components/Icon';
import { LoadError } from '@/components/LoadError';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';
import { Budget } from './AdminOverview';
import { Empty, PageHead } from './PageHead';

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
type GroupBy = 'user' | 'team' | 'store' | 'feature';
interface ModelLine { provider: string | null; model: string | null; label: string; jobs: number; calls: number; usd: string; usdDisplay: string }
interface JobLine { jobId: string; createdAt: string | null; feature: string; model: string; status: string | null; verdict: 'pass' | 'fail' | null; final: boolean; usd: string }
interface GroupJobs { jobs: JobLine[]; more: number; llm: { calls: number; usd: string } | null }
interface Invoice {
  provider: string;
  totalUsd: string;
  ledgerUsd: string;
  diffUsd: string;
  red: boolean;
  utcMonthUsd: string;
}
interface Costs {
  month: string;
  asOf: number;
  provisional: boolean;
  rateVndPerUsd: string | null;
  total: Money;
  shared: Money & { byKind: Record<string, string> };
  byUser: Group[];
  byTeam: Group[];
  byStore: Group[];
  byFeature: Group[];
  capUsage: { usd: string; monthlyCapUsd: string };
  featuresCapUsage: { usd: string; monthlyCapUsd: string };
  featureCaps: { feature: string; name: string; capUsd: string; spentUsd: string; level: 80 | 100 | null }[];
  invoices: Invoice[];
  previousMonth: Money;
  attributed: Money;
  byModel: ModelLine[];
  byDay: { day: string; usd: string }[];
}

const PROVIDERS = ['fal', 'vertex', 'byteplus'];
const KIND_LABEL: Record<string, string> = { bakeoff: 'Thử nghiệm mô hình', manual_adjustment: 'Điều chỉnh tay', invoice_diff: 'Chênh lệch hóa đơn' };
const vnd = (v: string | null) => (v === null ? '—' : `${Number(v).toLocaleString('vi-VN')} ₫`);

/** A USD amount with its sign before the dollar: -$0.12, not $-0.12. */
export const dollars = (v: string | number, digits = 2) => {
  const s = typeof v === 'number' ? v.toFixed(digits) : v;
  return s.startsWith('-') ? `-$${s.slice(1)}` : `$${s}`;
};
const STATUS: Record<string, string> = { queued: 'Đang chờ', running: 'Đang tạo', succeeded: 'Xong', failed: 'Lỗi', timed_out: 'Quá giờ', failed_unknown: 'Lỗi', canceled: 'Đã huỷ' };
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

/** The jobs behind one line, loaded when the line is opened. */
function JobList({ month, asOf, by, id }: { month: string; asOf: number; by: GroupBy; id: string }) {
  const { data, failed, reload } = useFetch<GroupJobs>(`/api/admin/costs/jobs?month=${month}&asOf=${asOf}&by=${by}&id=${encodeURIComponent(id)}`);
  if (!data) return failed ? <LoadError text="Không tải được danh sách job." onRetry={reload} /> : <p role="status">Đang tải job...</p>;
  if (data.jobs.length === 0 && !data.llm) return <p className="muted">Không có job nào.</p>;
  return (
    <>
      <table className="jobs" role="table" aria-label="Job của dòng này">
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
              <td role="cell" className="num">{dollars(j.usd, 4)}</td>
            </tr>
          ))}
          {data.llm && (
            <tr role="row">
              <td role="cell" colSpan={4}>LLM không gắn job (Gợi ý, Dịch): {data.llm.calls} lượt</td>
              <td role="cell" className="num">{dollars(data.llm.usd, 4)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {data.more > 0 && <p className="muted">Còn {data.more} job cũ hơn; tải CSV chi tiết sổ cái để xem đủ.</p>}
    </>
  );
}

interface BreakdownProps {
  title: string;
  by: GroupBy;
  groups: Group[];
  label: (g: Group) => string;
  /** A second, muted line under the name. */
  sub?: (g: Group) => string | null | undefined;
  month: string;
  asOf: number;
  withVnd: boolean;
}

/** One breakdown table; a line's name opens the jobs behind it under the line. */
function Breakdown({ title, by, groups, label, sub, month, asOf, withVnd }: BreakdownProps) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section aria-label={title}>
      <h2>{title}</h2>
      {groups.length === 0 ? (
        <Empty title="Chưa có chi phí nào trong tháng này." />
      ) : (
        <div className="table-wrap">
          <table className="sticky-first">
            <thead>
              <tr>
                <th scope="col">Tên</th>
                <th scope="col" className="num">USD</th>
                {withVnd && <th scope="col" className="num">VND</th>}
                <th scope="col" className="num">Không đạt</th>
                <th scope="col" className="num">Lỗi hoặc quá giờ</th>
                <th scope="col" className="num">Đạt</th>
                <th scope="col" className="num">Mỗi clip đạt</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const rowId = `${by}-jobs-${g.id || 'none'}`;
                const expanded = open === g.id;
                return (
                  <Fragment key={g.id}>
                    <tr>
                      <td>
                        <button type="button" className="link-button" aria-expanded={expanded} aria-controls={expanded ? rowId : undefined} onClick={() => setOpen(expanded ? null : g.id)}>
                          <span aria-hidden="true">{expanded ? '▾' : '▸'}</span> {label(g)}
                        </button>
                        {sub?.(g) && <span className="muted who">{sub(g)}</span>}
                      </td>
                      <td className="num"><Usd m={g} /></td>
                      {withVnd && <td className="num">{vnd(g.vnd)}</td>}
                      <td className="num"><Usd m={g.failedByVerdict} dashZero /></td>
                      <td className="num"><Usd m={g.failedByStatus} dashZero /></td>
                      <td className="num">{g.acceptedResults || <span className="muted">—</span>}</td>
                      <td className="num">{g.costPerAcceptedUsd === null ? <span className="muted">—</span> : dollars(g.costPerAcceptedUsd, 4)}</td>
                    </tr>
                    {expanded && (
                      <tr id={rowId} className="drill">
                        <td colSpan={withVnd ? 7 : 6}>
                          <JobList month={month} asOf={asOf} by={by} id={g.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** One bar per day of the month; the table under it holds the same figures for screen readers and exact amounts. */
export function DailySpend({ days }: { days: { day: string; usd: string }[] }) {
  const max = Math.max(...days.map((d) => Number(d.usd)), 0);
  if (max <= 0) return null;
  const date = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}`;
  return (
    <section aria-label="Chi theo ngày">
      <h2>Chi theo ngày</h2>
      <ol className="day-bars" aria-hidden="true" style={{ '--days': days.length } as CSSProperties}>
        {days.map((d) => {
          const n = Number(d.day.slice(8));
          return (
            <li key={d.day} title={`${date(d.day)}: ${dollars(d.usd, 4)}`}>
              <span style={{ height: `${(Math.max(Number(d.usd), 0) / max) * 100}%` }} />
              {(n === 1 || n % 5 === 0) && <small>{n}</small>}
            </li>
          );
        })}
      </ol>
      <p className="muted">Theo ngày chạy job. Chi phí chung (thử nghiệm, điều chỉnh tay, chênh lệch hóa đơn) không gắn ngày nên không có trong biểu đồ.</p>
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
                  <td>{date(d.day)}</td>
                  <td className="num">{dollars(d.usd, 4)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/** Every ledger row of the month by provider and model, shared rows included, largest first. */
export function ByModel({ lines }: { lines: ModelLine[] }) {
  if (lines.length === 0) return null;
  return (
    <section aria-label="Theo nhà cung cấp và mô hình">
      <h2>Theo nhà cung cấp và mô hình</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Mô hình</th>
              <th scope="col">Nhà cung cấp</th>
              <th scope="col" className="num">Số lượng</th>
              <th scope="col" className="num">USD</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={`${l.provider}-${l.model ?? l.label}`}>
                <td>{l.label}</td>
                <td>{l.provider ? (PROVIDER[l.provider] ?? l.provider) : '—'}</td>
                <td className="num">{[l.jobs && `${l.jobs} job`, l.calls && `${l.calls} lượt`].filter(Boolean).join(' · ') || '—'}</td>
                <td className="num" title={dollars(l.usd, 4)}>
                  {dollars(l.usdDisplay)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
            <p className="muted">Phần chênh là tiền nhà cung cấp tính ngoài các job của app (chạy thử, canary trên cùng tài khoản) và đã được tính vào Chi phí chung.</p>
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
const usd4 = (n: number | null) => (n === null ? '—' : dollars(n, 4));
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
  return `Còn ${n(p.tokensLeft)} / ${n(p.totalTokens)} token (${p.percentLeft.toFixed(1)}%) · ≈ $${p.usdLeft.toFixed(2)} · hết hạn ${p.expiresAt.slice(0, 10)}${why}`;
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

/** Google's own figures, read live from each account's billing export; loaded on its own so a Google failure leaves the rest of the page. */
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
            Google tính Vertex tháng {month}: <strong>{usd4(data.totalMonthUsd)}</strong> (mọi tài khoản, trước khi trừ credits; billing export trễ vài giờ).
          </p>
          {data.accounts.map((a) => (
            <div key={a.projectId}>
              <h3>
                {a.projectId}
                {a.active && <span className="tag">Đang dùng</span>}
                {a.credit.unverified && <span className="tag">Chưa xác minh credits</span>}
              </h3>
              {a.error && <VertexError projectId={a.projectId} reason={a.error.reason} message={a.error.message} />}
              <ul className="lines">
                <li>
                  Chi phí tháng: {usd4(a.monthUsd)} · Credits đã trừ: {usd4(a.monthCreditsUsd)}
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
                          <td className="num">{usd4(s.costUsd)}</td>
                          <td className="num">{usd4(s.creditsUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
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

function CostsBody({ data, reload }: { data: Costs; reload: () => void }) {
  const { problem, pending, run } = useAction(reload);
  const [rate, setRate] = useState(data.rateVndPerUsd ?? '');
  const [adjustUsd, setAdjustUsd] = useState('');
  const [note, setNote] = useState('');
  const month = data.month;

  async function adjust() {
    const ok = await run(() => api('/api/admin/costs/adjustments', sendJson('POST', { month, usd: adjustUsd.trim(), note })), 'Không thêm được điều chỉnh.');
    if (ok) {
      setAdjustUsd('');
      setNote('');
    }
  }

  const breakdowns: [string, GroupBy, Group[], (g: Group) => string, ((g: Group) => string | null | undefined)?][] = [
    ['Theo người dùng', 'user', data.byUser, (g) => g.name ?? g.id, (g) => g.email],
    ['Theo nhóm', 'team', data.byTeam, (g) => g.name ?? g.id],
    ['Theo cửa hàng', 'store', data.byStore, (g) => g.name ?? g.id],
    ['Theo mục', 'feature', data.byFeature, (g) => g.name ?? g.id],
  ];
  const withVnd = data.rateVndPerUsd !== null;

  return (
    <>
      <div className="kpis" role="group" aria-label="Tổng tháng">
        <div className="kpi" role="group" aria-label="Tổng chi phí">
          <p className="kpi-label">
            Tổng chi phí tháng {month}
            {data.provisional && <span className="tag">Tạm tính</span>}
          </p>
          <p className="kpi-value">{dollars(data.total.usdDisplay)}</p>
          <p className="kpi-sub">
            {dollars(data.total.usd)}
            {withVnd && ` · ${vnd(data.total.vnd)}`}
          </p>
          <p className="kpi-sub">
            Job và LLM {dollars(data.attributed.usdDisplay)} · Chi phí chung {dollars(data.shared.usdDisplay)}
          </p>
          <p className="kpi-sub">Tháng trước: {dollars(data.previousMonth.usdDisplay)}</p>
        </div>
        <Budget title="Ngân sách video" used={data.capUsage.usd} cap={data.capUsage.monthlyCapUsd} />
        <Budget title="Ngân sách ảnh và ứng dụng" used={data.featuresCapUsage.usd} cap={data.featuresCapUsage.monthlyCapUsd} />
      </div>
      <p className="muted">Số liệu tính đến dòng sổ cái #{data.asOf}; rê chuột lên một số tiền để xem số lẻ 4 chữ số.</p>
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
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}

      <div className="row">
        <label>
          Tỉ giá VND/USD của tháng {month}
          <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
        <button type="button" disabled={pending || rate.trim() === ''} onClick={() => void run(() => api(`/api/admin/rates/${month}`, sendJson('PUT', { vndPerUsd: rate.trim() })), 'Không lưu được tỉ giá.')}>
          Lưu tỉ giá
        </button>
      </div>
      {!withVnd && <p className="muted">Tháng này chưa có tỉ giá; nhập tỉ giá để thêm cột VND.</p>}

      <DailySpend days={data.byDay} />

      {breakdowns.every(([, , groups]) => groups.length === 0) ? (
        <section aria-label="Chi phí theo người dùng, nhóm, cửa hàng và mục">
          <h2>Chi tiết chi phí</h2>
          <Empty title={`Chưa có chi phí nào trong tháng ${month}.`}>Khi có job chạy, chi phí hiện ở đây theo người dùng, nhóm, cửa hàng và mục.</Empty>
        </section>
      ) : (
        <>
          <p className="muted">
            Bấm một tên để xem các job của dòng đó. Không đạt: tiền của kết quả bị chấm Không đạt. Lỗi hoặc quá giờ: job lỗi mà vẫn bị tính tiền. Đạt: số kết quả được chấm Đạt.
            Mỗi clip đạt: tiền của Tạo video và Marketing Studio chia cho số clip được chấm Đạt.
          </p>
          {breakdowns.map(([title, by, groups, label, sub]) => (
            <Breakdown key={title} title={title} by={by} groups={groups} label={label} sub={sub} month={month} asOf={data.asOf} withVnd={withVnd} />
          ))}
        </>
      )}
      <ByModel lines={data.byModel} />

      <div className="cost-cards">
        <section className="panel" aria-label="Chi phí chung">
          <h2>Chi phí chung</h2>
          <p className="panel-figure">
            <Usd m={data.shared} />
            {withVnd && <span className="muted"> · {vnd(data.shared.vnd)}</span>}
          </p>
          <ul className="lines">
            {Object.entries(data.shared.byKind).map(([kind, usd]) => (
              <li key={kind}>
                {KIND_LABEL[kind] ?? kind}: {dollars(usd, 4)}
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

export function AdminCosts() {
  const [month, setMonth] = useState('');
  const { data, failed, reload } = useFetch<Costs>(`/api/admin/costs${month ? `?month=${month}` : ''}`, { onTabReturn: true });
  return (
    <section aria-labelledby="costs-title">
      <PageHead id="costs-title" title="Chi phí" lead="Chi phí theo tháng (giờ Việt Nam): ngân sách, chi tiết theo người, nhóm, cửa hàng, tỉ giá và hóa đơn nhà cung cấp.">
        {data && (
          <>
            <label>
              Tháng
              <input type="month" value={month || data.month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            </label>
            <a className="button" href={`/api/admin/costs/detail?month=${data.month}&asOf=${data.asOf}`} download>
              <Icon name="download" />
              Tải CSV chi tiết sổ cái
            </a>
            <a className="button" href={`/api/admin/costs/summary?month=${data.month}&asOf=${data.asOf}`} download>
              <Icon name="download" />
              Tải CSV tổng hợp theo nhóm và cửa hàng
            </a>
          </>
        )}
      </PageHead>
      {!data ? (
        failed ? <LoadError text="Không tải được chi phí." onRetry={reload} /> : <p role="status">Đang tải...</p>
      ) : (
        <>
          {failed && <LoadError text="Không tải được tháng này, đang hiện tháng trước đó." onRetry={reload} />}
          <CostsBody key={`${data.month}-${data.asOf}`} data={data} reload={reload} />
          <ProviderSections month={data.month} />
        </>
      )}
    </section>
  );
}
