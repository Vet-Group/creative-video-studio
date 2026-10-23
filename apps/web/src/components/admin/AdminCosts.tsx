'use client';
import { useState } from 'react';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';

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

const PROVIDERS = ['fal', 'replicate'];
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
      <div className="table-wrap">
        <table>
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
            {groups.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">Chưa có chi phí nào trong tháng này.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
    </li>
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

  return (
    <>
      <p>
        Tổng chi phí: <strong><Usd m={data.total} withVnd /></strong>
        {data.provisional && <span className="tag">Tạm tính</span>}
      </p>
      <p className="muted">
        Số liệu tính đến bút toán #{data.asOf} (as_of). Ngân sách tháng cho video: ${data.capUsage.usd} trên ${data.capUsage.monthlyCapUsd}. Ngân sách tháng cho ảnh
        và ứng dụng: ${data.featuresCapUsage.usd} trên ${data.featuresCapUsage.monthlyCapUsd}.
      </p>
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

      <Breakdown title="Theo người dùng" groups={data.byUser} label={(g) => `${g.name ?? g.id} (${g.email ?? ''})`} />
      <Breakdown title="Theo nhóm" groups={data.byTeam} label={(g) => g.name ?? g.id} />
      <Breakdown title="Theo cửa hàng" groups={data.byStore} label={(g) => g.name ?? g.id} />
      <Breakdown title="Theo mục" groups={data.byFeature} label={(g) => g.name ?? g.id} />

      <section aria-label="Chi phí chung">
        <h2>Chi phí chung</h2>
        <p>
          <Usd m={data.shared} withVnd />
        </p>
        <ul>
          {Object.entries(data.shared.byKind).map(([kind, usd]) => (
            <li key={kind}>
              {KIND_LABEL[kind] ?? kind}: ${usd}
            </li>
          ))}
        </ul>
        <fieldset>
          <legend>Thêm điều chỉnh tay</legend>
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
        </fieldset>
      </section>

      <section aria-label="Hóa đơn nhà cung cấp">
        <h2>Hóa đơn nhà cung cấp</h2>
        <p className="muted">Nhập tổng hóa đơn của tháng; hệ thống ghi phần chênh lệch với sổ cái. Chênh lệch quá 5% hóa đơn được tô đỏ.</p>
        <ul>
          {PROVIDERS.map((p) => (
            <InvoiceForm key={p} provider={p} month={month} invoice={data.invoices.find((i) => i.provider === p)} run={run} />
          ))}
        </ul>
      </section>

      <div className="actions">
        <a className="button" href={`/api/admin/costs/detail?month=${month}&asOf=${data.asOf}`} download>
          Tải CSV chi tiết sổ cái
        </a>
        <a className="button" href={`/api/admin/costs/summary?month=${month}&asOf=${data.asOf}`} download>
          Tải CSV tổng hợp theo nhóm và cửa hàng
        </a>
      </div>
    </>
  );
}

export function AdminCosts() {
  const [month, setMonth] = useState('');
  const { data, failed, reload } = useFetch<Costs>(`/api/admin/costs${month ? `?month=${month}` : ''}`);
  if (!data) return failed ? <p className="error">Không tải được chi phí.</p> : <p role="status">Đang tải...</p>;
  return (
    <section aria-labelledby="costs-title">
      <h1 id="costs-title">Chi phí</h1>
      <label>
        Tháng
        <input type="month" value={month || data.month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </label>
      {failed && <p className="error">Không tải được tháng này, đang hiện tháng trước đó.</p>}
      <CostsBody key={`${data.month}-${data.asOf}`} data={data} reload={reload} />
    </section>
  );
}
