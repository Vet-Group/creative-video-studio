'use client';
// Admin > Costs > By team (docs/BILLING.md): what each billing team and partner workspace owes for a month, and the company's own cost.
// One question: who pays what this month, and does it add up to the ledger? The KPI row answers it, the team cards show who is over their
// free allowance (the warm segment), and every block's sums meet in the in-balance check. Explanations sit in titles, not sentences.
import { Fragment, useState } from 'react';
import { AllowanceBar } from '@/components/AllowanceBar';
import { confirmDialog } from '@/components/Confirm';
import { Icon } from '@/components/Icon';
import { LoadError } from '@/components/LoadError';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';
import { CostViews } from './CostViews';
import { Empty, PageHead } from './PageHead';

interface Line { bucket: string; userId: string | null; userName: string | null; storeId: string | null; storeName: string | null; kind: string; model: string | null; usd: string }
interface Team { bucket: string; id: string; name: string; totalUsd: string; freeUsd: string; usedUsd: string; payableUsd: string; members: string[]; stores: string[] }
interface Bucket { bucket: string; id: string; name: string; totalUsd: string; payableUsd: string }
interface Billing {
  month: string;
  asOf: number;
  provisional: boolean;
  closed: { at: string; by: string | null } | null;
  canClose: boolean;
  forecast: { ledgerUsd: string; teams: Record<string, string> } | null;
  teams: Team[];
  partners: Bucket[];
  company: { totalUsd: string; reasons: Bucket[] };
  totals: { ledgerUsd: string; teamsUsd: string; partnersUsd: string; companyUsd: string; payableUsd: string; reconciled: boolean };
  lines: Line[];
}

/** USD at 2 decimals for display; the figures stay exact (4 decimals) in the data and the CSV. */
const usd = (v: string | number) => {
  const n = Number(v);
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
/** Whole 1/10000 USD, so sums of the 4-decimal lines are exact. */
const units = (v: string) => Math.round(Number(v) * 10_000);
const day = (iso: string) => new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

type Mail = { sent: number; failed: string[] } | 'off';

/** What closing a month sent to accounting on Lark (POST /api/admin/billing/close `lark`), as one line; the CSV buttons stay for sending it by hand. */
export function closeMailText(lark: Mail): string {
  if (lark === 'off') return 'Đã chốt tháng. Gửi qua Lark đang tắt: hãy tải CSV và gửi cho kế toán.';
  if (lark.failed.length === 0) return `Đã chốt tháng và gửi bản tóm tắt cùng CSV qua Lark cho ${lark.sent} người.`;
  return `Đã chốt tháng, nhưng gửi qua Lark ${lark.sent === 0 ? 'không được' : `chỉ tới ${lark.sent} người, lỗi ${lark.failed.length}`}: hãy tải CSV và gửi cho kế toán.`;
}

/** A bucket's lines summed per user, store and model, largest first. */
function drill(lines: Line[], bucket: string) {
  const out = new Map<string, { user: string; store: string; model: string; u: number }>();
  for (const l of lines) {
    if (l.bucket !== bucket) continue;
    const key = [l.userId, l.storeId, l.model].join('\t');
    const g = out.get(key) ?? out.set(key, { user: l.userName ?? '—', store: l.storeName ?? 'Không gắn cửa hàng', model: l.model ?? '—', u: 0 }).get(key)!;
    g.u += units(l.usd);
  }
  return [...out.values()].filter((g) => g.u !== 0).sort((a, b) => b.u - a.u);
}

function Drill({ lines, bucket, label }: { lines: Line[]; bucket: string; label: string }) {
  const rows = drill(lines, bucket);
  if (rows.length === 0) return <p className="muted">Chưa có chi phí.</p>;
  return (
    <div className="table-wrap">
      <table className="jobs" aria-label={`Chi tiết của ${label}`}>
        <thead>
          <tr>
            <th scope="col">Người dùng</th>
            <th scope="col">Cửa hàng</th>
            <th scope="col">Mô hình</th>
            <th scope="col" className="num">USD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.user}\t${r.store}\t${r.model}`}>
              <td>{r.user}</td>
              <td>{r.store}</td>
              <td className="model">{r.model}</td>
              <td className="num" title={`$${(r.u / 10_000).toFixed(4)}`}>
                {usd(r.u / 10_000)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamCard({ team, lines, forecastUsd }: { team: Team; lines: Line[]; forecastUsd?: string }) {
  const [open, setOpen] = useState(false);
  const over = Number(team.payableUsd) > 0;
  const id = `billing-drill-${team.id}`;
  return (
    <section className="panel billing-team" aria-label={team.name} data-over={over}>
      <header className="billing-team-head">
        <h3>{team.name}</h3>
        <p className="billing-payable" title="Phải trả = tổng tháng trừ phần miễn phí, không âm">
          <span>Phải trả</span>
          <strong>{usd(team.payableUsd)}</strong>
        </p>
      </header>
      <p className="billing-total">
        Tổng <strong title={`$${team.totalUsd}`}>{usd(team.totalUsd)}</strong>
      </p>
      <AllowanceBar totalUsd={team.totalUsd} freeUsd={team.freeUsd} label={team.name} forecastUsd={forecastUsd} />
      <dl className="billing-who">
        <dt>Thành viên</dt>
        <dd>{team.members.length > 0 ? team.members.join(', ') : '—'}</dd>
        <dt>Cửa hàng</dt>
        <dd>{team.stores.length > 0 ? team.stores.join(', ') : '—'}</dd>
      </dl>
      <button type="button" className="link-button" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span> Chi tiết
      </button>
      {open && (
        <div id={id}>
          <Drill lines={lines} bucket={team.bucket} label={team.name} />
        </div>
      )}
    </section>
  );
}

/** A table of buckets (partners or company reasons) whose rows open their lines. */
function BucketTable({ title, rows, lines, total, nameHead }: { title: string; rows: Bucket[]; lines: Line[]; total: string; nameHead: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="table-wrap">
      <table className="sticky-first" aria-label={title}>
        <thead>
          <tr>
            <th scope="col">{nameHead}</th>
            <th scope="col" className="num">USD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const expanded = open === r.bucket;
            const id = `billing-drill-${r.bucket.replace(':', '-')}`;
            return (
              <Fragment key={r.bucket}>
                <tr>
                  <td>
                    <button type="button" className="link-button" aria-expanded={expanded} aria-controls={expanded ? id : undefined} onClick={() => setOpen(expanded ? null : r.bucket)}>
                      <span aria-hidden="true">{expanded ? '▾' : '▸'}</span> {r.name}
                    </button>
                  </td>
                  <td className="num" title={`$${r.totalUsd}`}>
                    {Number(r.totalUsd) === 0 ? <span className="muted">—</span> : usd(r.totalUsd)}
                  </td>
                </tr>
                {expanded && (
                  <tr id={id} className="drill">
                    <td colSpan={2}>
                      <Drill lines={lines} bucket={r.bucket} label={r.name} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Tổng</th>
            <td className="num" title={`$${total}`}>
              <strong>{usd(total)}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function BillingBody({ data, reload, mailed, onMailed }: { data: Billing; reload: () => void; mailed: string; onMailed: (text: string) => void }) {
  const { problem, pending, run } = useAction(reload);
  const t = data.totals;
  const overTeams = data.teams.filter((x) => Number(x.payableUsd) > 0).length;
  const teamsPayable = data.teams.reduce((s, x) => s + units(x.payableUsd), 0) / 10_000;

  async function close() {
    if (!(await confirmDialog({ title: `Chốt tháng ${data.month}?`, body: 'Số liệu của tháng được giữ nguyên dù sau này đổi nhóm hay cửa hàng. Mở lại được.', confirmLabel: 'Chốt tháng' }))) return;
    void run(async () => onMailed(closeMailText((await api<{ lark: Mail }>('/api/admin/billing/close', sendJson('POST', { month: data.month }))).lark)), 'Không chốt được tháng.');
  }
  async function reopen() {
    if (!(await confirmDialog({ title: `Mở lại tháng ${data.month}?`, body: 'Số liệu sẽ tính lại theo nhóm và cửa hàng hiện tại.', confirmLabel: 'Mở lại' }))) return;
    void run(async () => {
      await api(`/api/admin/billing/close?month=${data.month}`, { method: 'DELETE' });
      onMailed('');
    }, 'Không mở lại được tháng.');
  }

  return (
    <>
      <div className="billing-status" role="group" aria-label="Trạng thái tháng">
        {data.closed ? (
          <span className="tag" title={`Chốt bởi ${data.closed.by ?? 'Hệ thống (tự động)'}`}>
            Đã chốt {day(data.closed.at)}
          </span>
        ) : (
          <span className="tag" title="Tính theo nhóm và cửa hàng hiện tại">
            Đang mở
          </span>
        )}
        {data.provisional && <span className="tag">Tạm tính</span>}
        <span className="billing-check" data-ok={t.reconciled} title={`Sổ cái ${usd(t.ledgerUsd)} = team ${usd(t.teamsUsd)} + đối tác ${usd(t.partnersUsd)} + công ty ${usd(t.companyUsd)}`}>
          <Icon name={t.reconciled ? 'check' : 'x'} />
          {t.reconciled ? 'Khớp sổ' : 'Lệch sổ'}
        </span>
        {data.canClose && (
          <button type="button" disabled={pending} onClick={() => void close()}>
            Chốt tháng
          </button>
        )}
        {data.closed && (
          <button type="button" disabled={pending} onClick={() => void reopen()}>
            Mở lại tháng
          </button>
        )}
      </div>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {mailed && <p role="status">{mailed}</p>}
      <div className="kpis" role="group" aria-label="Tổng tháng">
        <div className="kpi" role="group" aria-label="Sổ cái tháng">
          <p className="kpi-label">Sổ cái tháng {data.month}</p>
          <p className="kpi-value" title={`$${t.ledgerUsd}`}>
            {usd(t.ledgerUsd)}
          </p>
          <p className="kpi-sub">
            Team {usd(t.teamsUsd)} · Đối tác {usd(t.partnersUsd)} · Công ty {usd(t.companyUsd)}
          </p>
          {data.forecast && <p className="kpi-sub" title="Ước tính theo tốc độ dùng từ đầu tháng">Dự báo cuối tháng ~{usd(data.forecast.ledgerUsd)}</p>}
        </div>
        <div className="kpi" role="group" aria-label="Team phải trả">
          <p className="kpi-label">Team phải trả</p>
          <p className="kpi-value">{usd(teamsPayable)}</p>
          <p className="kpi-sub">
            {overTeams}/{data.teams.length} team vượt miễn phí
          </p>
        </div>
        <div className="kpi" role="group" aria-label="Đối tác phải trả">
          <p className="kpi-label">Đối tác phải trả</p>
          <p className="kpi-value">{usd(t.partnersUsd)}</p>
          <p className="kpi-sub">{data.partners.length} không gian</p>
        </div>
        <div className="kpi" role="group" aria-label="Chi phí công ty">
          <p className="kpi-label">Chi phí công ty</p>
          <p className="kpi-value">{usd(t.companyUsd)}</p>
          <p className="kpi-sub">Không tính cho team</p>
        </div>
      </div>

      <h2>Team bán hàng</h2>
      {data.teams.length === 0 ? (
        <Empty title="Chưa có team bán hàng">Đánh dấu ở Quản trị › Nhóm.</Empty>
      ) : (
        <div className="billing-teams">
          {data.teams.map((x) => (
            <TeamCard key={x.id} team={x} lines={data.lines} forecastUsd={data.forecast?.teams[x.id]} />
          ))}
        </div>
      )}

      <div className="cost-cards">
        <section className="panel" aria-labelledby="billing-partners">
          <h2 id="billing-partners">Không gian đối tác</h2>
          {data.partners.length === 0 ? <p className="muted">Chưa có không gian đối tác.</p> : <BucketTable title="Không gian đối tác" nameHead="Không gian" rows={data.partners} lines={data.lines} total={t.partnersUsd} />}
        </section>
        <section className="panel" aria-labelledby="billing-company">
          <h2 id="billing-company">Chi phí công ty</h2>
          <BucketTable title="Chi phí công ty theo lý do" nameHead="Lý do" rows={data.company.reasons} lines={data.lines} total={t.companyUsd} />
        </section>
      </div>
      <p className="muted">Số liệu tính đến dòng sổ cái #{data.asOf}.</p>
    </>
  );
}

export function AdminBilling() {
  const [month, setMonth] = useState('');
  // Kept here, not in BillingBody: the reload after a close remounts the body.
  const [mailed, setMailed] = useState('');
  const { data, failed, reload } = useFetch<Billing>(`/api/admin/billing${month ? `?month=${month}` : ''}`, { onTabReturn: true });
  return (
    <section aria-labelledby="billing-title">
      <CostViews />
      <PageHead id="billing-title" title="Chi phí theo team" lead="Team bán hàng trả phần vượt miễn phí, đối tác trả toàn bộ, còn lại là chi phí công ty.">
        {data && (
          <>
            <label>
              Tháng
              <input type="month" value={month || data.month} onChange={(e) => e.target.value && (setMonth(e.target.value), setMailed(''))} />
            </label>
            <a className="button" href={`/api/admin/billing/csv?month=${data.month}`} download>
              <Icon name="download" />
              Tải CSV chi tiết
            </a>
            <a className="button" href={`/api/admin/billing/csv?month=${data.month}&part=summary`} download>
              <Icon name="download" />
              Tải CSV phải trả
            </a>
          </>
        )}
      </PageHead>
      {!data ? (
        failed ? <LoadError text="Không tải được chi phí theo team." onRetry={reload} /> : <p role="status">Đang tải...</p>
      ) : (
        <BillingBody key={`${data.month}-${data.asOf}-${data.closed?.at ?? ''}`} data={data} reload={reload} mailed={mailed} onMailed={setMailed} />
      )}
    </section>
  );
}
