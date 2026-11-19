'use client';
import { LoadError } from '@/components/LoadError';
import { useFetch } from '@/lib/admin-ui';
import type { AdminRatings as Data } from '@/lib/rating';
import { Empty } from './PageHead';

const fmtDate = (iso: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));
const one = (n: number) => n.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** The Overview's satisfaction section: the last 30 days of the members' 1-10 scores (GET /api/admin/ratings). */
export function AdminRatings() {
  const { data, failed, reload } = useFetch<Data>('/api/admin/ratings', { onTabReturn: true });
  return (
    <section className="panel" aria-labelledby="ratings-title">
      <div className="panel-head">
        <h2 id="ratings-title">Điểm hài lòng</h2>
        <span className="muted">{data?.days ?? 30} ngày qua</span>
      </div>
      {!data ? (
        failed ? <LoadError text="Không tải được điểm hài lòng." onRetry={reload} /> : <p role="status">Đang tải...</p>
      ) : data.count === 0 || data.average === null || data.highShare === null ? (
        <Empty title="Chưa có đánh giá nào" />
      ) : (
        <>
          <div className="kpis" role="group" aria-label="Điểm hài lòng">
            <div className="kpi">
              <p className="kpi-label">Điểm trung bình</p>
              <p className="kpi-value">
                {one(data.average)} <span>/ 10</span>
              </p>
            </div>
            <div className="kpi">
              <p className="kpi-label">Số lượt chấm</p>
              <p className="kpi-value">{data.count}</p>
            </div>
            <div className="kpi">
              <p className="kpi-label">Chấm từ 8 điểm</p>
              <p className="kpi-value">{Math.round(data.highShare * 100)}%</p>
            </div>
          </div>
          <h3>Theo nhóm</h3>
          <table aria-label="Điểm hài lòng theo nhóm">
            <thead>
              <tr>
                <th scope="col">Nhóm</th>
                <th scope="col" className="num">Điểm trung bình</th>
                <th scope="col" className="num">Số lượt chấm</th>
              </tr>
            </thead>
            <tbody>
              {data.teams.map((t) => (
                <tr key={t.team}>
                  <td>{t.team}</td>
                  <td className="num">{one(t.average)}</td>
                  <td className="num">{t.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.comments.length > 0 && (
            <>
              <h3>Nhận xét mới nhất</h3>
              <ul className="rating-comments">
                {data.comments.map((c, i) => (
                  <li key={i}>
                    <span className="muted">
                      <strong>{c.score}/10</strong> · {c.team}{c.workspace && ` · ${c.workspace}`} · <time dateTime={c.createdAt}>{fmtDate(c.createdAt)}</time>
                    </span>
                    <p>{c.comment}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
