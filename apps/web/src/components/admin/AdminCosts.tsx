'use client';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
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
  acceptedClips: number;
  costPerAcceptedUsd: string | null;
}
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
}

const PROVIDERS = ['fal', 'replicate', 'vertex'];
const KIND_LABEL: Record<string, string> = { bakeoff: 'Thử nghiệm mô hình', manual_adjustment: 'Điều chỉnh tay', invoice_diff: 'Chênh lệch hóa đơn' };
const vnd = (v: string | null) => (v === null ? '—' : `${Number(v).toLocaleString('vi-VN')} ₫`);

/** The 2-decimal display value with the exact 4-decimal amount beside it, and the VND when asked for. */
function Usd({ m, withVnd = false }: { m: Money; withVnd?: boolean }) {
  return (
    <span>
      ${m.usdDisplay} <span className="muted">(${m.usd}{withVnd && ` · ${vnd(m.vnd)}`})</span>
    </span>
  );
}

function Breakdown({ title, groups, label }: { title: string; groups: Group[]; label: (g: Group) => string }) {
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
                <th scope="col" className="num">VND</th>
                <th scope="col" className="num">Trong đó: clip Không đạt (USD)</th>
                <th scope="col" className="num">Trong đó: job lỗi hoặc quá giờ (USD)</th>
                <th scope="col" className="num">Clip đạt</th>
                <th scope="col" className="num">Chi phí mỗi clip đạt (USD)</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>{label(g)}</td>
                  <td className="num"><Usd m={g} /></td>
                  <td className="num">{vnd(g.vnd)}</td>
                  <td className="num"><Usd m={g.failedByVerdict} withVnd /></td>
                  <td className="num"><Usd m={g.failedByStatus} withVnd /></td>
                  <td className="num">{g.acceptedClips}</td>
                  <td className="num">{g.costPerAcceptedUsd ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function InvoiceForm({ provider, month, invoice, run }: { provider: string; month: string; invoice?: Invoice; run: ReturnType<typeof useAction>['run'] }) {
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
          disabled={total.trim() === ''}
          onClick={() => void run(() => api('/api/admin/invoices', sendJson('PUT', { month, provider, totalUsd: total.trim() })), 'Không ghi được hóa đơn.')}
        >
          Ghi hóa đơn {provider}
        </button>
      </div>
      {invoice && (
        <p>
          Sổ cái: ${invoice.ledgerUsd} · Chênh lệch:{' '}
          <strong className={invoice.red ? 'error' : undefined}>
            ${invoice.diffUsd}
            {invoice.red && ' (lệch quá 5%)'}
          </strong>{' '}
          · Tổng theo tháng UTC: ${invoice.utcMonthUsd}
        </p>
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
  | { configured: false }
  | { configured: true; accounts: VertexAccountCosts[]; totalMonthUsd: number; prices: { label: string; appUsd: number | null; googleUsd: number | null; red: boolean }[] };

const VERTEX_ERROR: Record<string, (project: string) => string> = {
  no_access: (p) => `Chưa có quyền đọc billing export của ${p}.`,
  no_export: (p) => `${p} chưa có bảng billing export (dataset billing_export).`,
  failed: (p) => `Không đọc được billing của ${p}.`,
};
const usd4 = (n: number | null) => (n === null ? '—' : `$${n.toFixed(4)}`);
const credits = (n: number | null, currency: string) => (n === null ? '—' : `${n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ${currency}`);

/** Google's own figures, read live from each account's billing export; loaded on its own so a Google failure leaves the rest of the page. */
function VertexCosts({ month }: { month: string }) {
  const { data, failed } = useFetch<VertexCostsData>(`/api/admin/costs/vertex?month=${month}`);
  return (
    <section className="panel" aria-label="Vertex (Google Cloud)">
      <h2>Vertex (Google Cloud)</h2>
      {!data ? (
        failed ? <p className="error">Không tải được số liệu Vertex từ Google.</p> : <p role="status">Đang đọc số liệu từ Google...</p>
      ) : !data.configured ? (
        <p className="muted">Máy chủ chưa có khóa Vertex nào.</p>
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
              {a.error && (
                <p className="error">
                  {VERTEX_ERROR[a.error.reason]!(a.projectId)} <span className="muted">({a.error.message.slice(0, 200)})</span>
                </p>
              )}
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
                        <th scope="col">SKU</th>
                        <th scope="col" className="num">Lượng dùng</th>
                        <th scope="col" className="num">USD</th>
                        <th scope="col" className="num">Credits (USD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.skus.map((s) => (
                        <tr key={s.skuId}>
                          <td>
                            {s.sku} <span className="muted">({s.skuId})</span>
                          </td>
                          <td className="num">
                            {s.usage.toLocaleString('vi-VN')} {s.unit}
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
  const { problem, run } = useAction(reload);
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

  const breakdowns: [string, Group[], (g: Group) => string][] = [
    ['Theo người dùng', data.byUser, (g) => `${g.name ?? g.id} (${g.email ?? ''})`],
    ['Theo nhóm', data.byTeam, (g) => g.name ?? g.id],
    ['Theo cửa hàng', data.byStore, (g) => g.name ?? g.id],
    ['Theo mục', data.byFeature, (g) => g.name ?? g.id],
  ];

  return (
    <>
      <div className="kpis" role="group" aria-label="Tổng tháng">
        <div className="kpi" role="group" aria-label="Tổng chi phí">
          <p className="kpi-label">
            Tổng chi phí tháng {month}
            {data.provisional && <span className="tag">Tạm tính</span>}
          </p>
          <p className="kpi-value">${data.total.usdDisplay}</p>
          <p className="kpi-sub">
            ${data.total.usd} · {vnd(data.total.vnd)}
          </p>
        </div>
        <Budget title="Ngân sách video" used={data.capUsage.usd} cap={data.capUsage.monthlyCapUsd} />
        <Budget title="Ngân sách ảnh và ứng dụng" used={data.featuresCapUsage.usd} cap={data.featuresCapUsage.monthlyCapUsd} />
      </div>
      <p className="muted">Số liệu tính đến bút toán #{data.asOf} (as_of).</p>
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
        <button type="button" disabled={rate.trim() === ''} onClick={() => void run(() => api(`/api/admin/rates/${month}`, sendJson('PUT', { vndPerUsd: rate.trim() })), 'Không lưu được tỉ giá.')}>
          Lưu tỉ giá
        </button>
      </div>
      {data.rateVndPerUsd === null && <p className="warn">Tháng này chưa có tỉ giá nên cột VND để trống.</p>}

      {breakdowns.every(([, groups]) => groups.length === 0) ? (
        <section aria-label="Chi phí theo người dùng, nhóm, cửa hàng và mục">
          <h2>Chi tiết chi phí</h2>
          <Empty title={`Chưa có chi phí nào trong tháng ${month}.`}>Khi có job chạy, chi phí hiện ở đây theo người dùng, nhóm, cửa hàng và mục.</Empty>
        </section>
      ) : (
        breakdowns.map(([title, groups, label]) => <Breakdown key={title} title={title} groups={groups} label={label} />)
      )}

      <div className="cost-cards">
        <section className="panel" aria-label="Chi phí chung">
          <h2>Chi phí chung</h2>
          <p className="panel-figure">
            <Usd m={data.shared} withVnd />
          </p>
          <ul className="lines">
            {Object.entries(data.shared.byKind).map(([kind, usd]) => (
              <li key={kind}>
                {KIND_LABEL[kind] ?? kind}: ${usd}
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
            <button type="button" disabled={adjustUsd.trim() === '' || note.trim() === ''} onClick={() => void adjust()}>
              Thêm điều chỉnh
            </button>
          </div>
        </section>

        <section className="panel" aria-label="Hóa đơn nhà cung cấp">
          <h2>Hóa đơn nhà cung cấp</h2>
          <p className="muted">Nhập tổng hóa đơn của tháng; hệ thống ghi phần chênh lệch với sổ cái. Lệch quá 5% được tô đỏ.</p>
          <ul className="invoices">
            {PROVIDERS.map((p) => (
              <InvoiceForm key={p} provider={p} month={month} invoice={data.invoices.find((i) => i.provider === p)} run={run} />
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
        failed ? <p className="error">Không tải được chi phí.</p> : <p role="status">Đang tải...</p>
      ) : (
        <>
          {failed && <p className="error">Không tải được tháng này, đang hiện tháng trước đó.</p>}
          <CostsBody key={`${data.month}-${data.asOf}`} data={data} reload={reload} />
          <VertexCosts month={data.month} />
        </>
      )}
    </section>
  );
}
