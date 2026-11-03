'use client';
import Link from 'next/link';
import { LoadError } from '@/components/LoadError';
import { auditLabel, useFetch } from '@/lib/admin-ui';
import type { AdminOverview as Data } from '@/lib/overview';
import { Empty, PageHead } from './PageHead';

const usd = (v: string) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtTime = (iso: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));

/** Spend against a monthly cap: the amount, a bar that turns amber from 80% and red at the cap, and what is left. A cap of 0 locks that budget. */
export function Budget({ title, used, cap }: { title: string; used: string; cap: string }) {
  const share = Number(cap) > 0 ? Number(used) / Number(cap) : 1;
  const level = share >= 1 ? 'full' : share >= 0.8 ? 'high' : 'ok';
  return (
    <div className="kpi budget" data-level={level}>
      <p className="kpi-label">{title}</p>
      <p className="kpi-value">
        {usd(used)} <span>/ {usd(cap)}</span>
      </p>
      <div className="meter" aria-hidden="true">
        <span style={{ width: `${Math.min(share, 1) * 100}%` }} />
      </div>
      <p className="kpi-sub">
        {Number(cap) === 0 ? 'Đang khoá (ngân sách 0)' : `Đã dùng ${Math.round(share * 100)}% · còn ${usd(String(Math.max(Number(cap) - Number(used), 0)))}`}
      </p>
    </div>
  );
}

export function AdminOverview() {
  const { data, failed, reload } = useFetch<Data>('/api/admin/overview', { onTabReturn: true });
  return (
    <section aria-labelledby="overview-title">
      <PageHead id="overview-title" title="Tổng quan" lead={data ? `Ngân sách, job và hoạt động gần đây của tháng ${data.month} (giờ Việt Nam).` : 'Ngân sách, job và hoạt động gần đây.'} />
      {!data ? (
        failed ? <LoadError text="Không tải được tổng quan." onRetry={reload} /> : <p role="status">Đang tải...</p>
      ) : (
        <>
          <div className="kpis kpis-wide" aria-label="Ngân sách tháng" role="group">
            <Budget title="Ngân sách video" used={data.video.usd} cap={data.video.monthlyCapUsd} />
            <Budget title="Ngân sách ảnh và ứng dụng" used={data.features.usd} cap={data.features.monthlyCapUsd} />
          </div>
          <div className="kpis" aria-label="Hôm nay" role="group">
            <div className="kpi">
              <p className="kpi-label">Job hôm nay</p>
              <p className="kpi-value">{data.jobs.today}</p>
              <p className="kpi-sub">
                {data.jobs.succeeded} xong · {data.jobs.failed} lỗi
              </p>
            </div>
            <div className="kpi" data-live={data.jobs.running > 0}>
              <p className="kpi-label">
                <span className="rec" aria-hidden="true" />
                Đang chạy
              </p>
              <p className="kpi-value">{data.jobs.running}</p>
              <p className="kpi-sub">{data.jobs.running > 0 ? 'Job đang xếp hàng hoặc đang tạo' : 'Không có job nào đang chạy'}</p>
            </div>
            <Link className="kpi" href="/admin/users">
              <p className="kpi-label">Người dùng hoạt động</p>
              <p className="kpi-value">{data.users.active}</p>
              <p className="kpi-sub">{data.users.locked} tài khoản đã khoá</p>
            </Link>
            <Link className="kpi" href="/admin/settings">
              <p className="kpi-label">Mô hình đang bật</p>
              <p className="kpi-value">
                {data.models.enabled} <span>/ {data.models.total}</span>
              </p>
              <p className="kpi-sub">Bật, tắt ở trang Cài đặt</p>
            </Link>
          </div>
          <section className="panel" aria-labelledby="recent-title">
            <div className="panel-head">
              <h2 id="recent-title">Hoạt động gần đây</h2>
              <Link href="/admin/audit">Xem nhật ký</Link>
            </div>
            {data.audit.length === 0 ? (
              <Empty title="Chưa có hoạt động nào" />
            ) : (
              <ol className="recent">
                {data.audit.map((e) => (
                  <li key={e.id}>
                    <time dateTime={e.createdAt}>{fmtTime(e.createdAt)}</time>
                    <span className="recent-who">{e.actorName}</span>
                    <code className="event" title={e.action}>
                      {auditLabel(e.action)}
                    </code>
                    <span className="recent-target" title={e.target}>
                      {e.target}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <p className="muted">
            Tổng chi phí tháng: {usd(data.totalUsd)}
            {data.provisional && ' (tạm tính)'} · <Link href="/admin/costs">Xem chi phí</Link>
          </p>
        </>
      )}
    </section>
  );
}
