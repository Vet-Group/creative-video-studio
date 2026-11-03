'use client';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { LoadError } from '@/components/LoadError';
import { useFetch } from '@/lib/admin-ui';
import { Budget } from './AdminOverview';
import { Empty, PageHead } from './PageHead';

interface Report {
  week: { start: string; end: string };
  cap: { month: string; monthlyCapUsd: string; usedUsd: string; memberDailyClipCap: number };
  users: {
    userId: string;
    name: string;
    email: string;
    team: string;
    jobs: number;
    acceptedClips: number;
    spendUsd: string;
    costPerAcceptedUsd: string | null;
    medianRunSeconds: number | null;
    failureRate: number | null;
    spendOfCap: string;
  }[];
}

const percent = (fraction: number | string, digits: number) => `${(Number(fraction) * 100).toFixed(digits)}%`;

export function AdminReport() {
  const [week, setWeek] = useState('');
  const { data, failed, reload } = useFetch<Report>(`/api/admin/report${week ? `?week=${week}` : ''}`, { onTabReturn: true });
  return (
    <section aria-labelledby="report-title">
      <PageHead id="report-title" title="Báo cáo tuần" lead="Job, clip đạt, chi phí và tỉ lệ lỗi của từng người trong một tuần (giờ Việt Nam, thứ Hai đến Chủ nhật).">
        {data && (
          <>
            <label>
              Chọn ngày trong tuần
              <input type="date" value={week || data.week.start} onChange={(e) => setWeek(e.target.value)} />
            </label>
            <a className="button" href={`/api/admin/report/csv?week=${data.week.start}`} download>
              <Icon name="download" />
              Tải CSV báo cáo
            </a>
          </>
        )}
      </PageHead>
      {!data ? (
        failed ? <LoadError text="Không tải được báo cáo." onRetry={reload} /> : <p role="status">Đang tải...</p>
      ) : (
        <>
          {failed && <LoadError text="Không tải được tuần này, đang hiện tuần trước đó." onRetry={reload} />}
          <div className="kpis">
            <div className="kpi">
              <p className="kpi-label">Tuần</p>
              <p className="kpi-value small">
                {data.week.start} → {data.week.end}
              </p>
              <p className="kpi-sub">{data.users.reduce((n, u) => n + u.jobs, 0)} job · {data.users.reduce((n, u) => n + u.acceptedClips, 0)} clip đạt</p>
            </div>
            <Budget title={`Ngân sách video tháng ${data.cap.month}`} used={data.cap.usedUsd} cap={data.cap.monthlyCapUsd} />
          </div>
          {data.users.length === 0 ? (
            <Empty title="Không có job nào trong tuần này">Chọn một ngày của tuần khác để xem.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="sticky-first">
                <thead>
                  <tr>
                    <th scope="col">Người dùng</th>
                    <th scope="col">Nhóm</th>
                    <th scope="col" className="num">Job</th>
                    <th scope="col" className="num">Clip đạt</th>
                    <th scope="col" className="num">Chi phí (USD)</th>
                    <th scope="col" className="num">Chi phí mỗi clip đạt (USD)</th>
                    <th scope="col" className="num">Thời gian chạy trung vị</th>
                    <th scope="col" className="num">Tỉ lệ job lỗi</th>
                    <th scope="col" className="num">Chi phí so với ngân sách</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.userId}>
                      <td>
                        {u.name}
                        <br />
                        <span className="muted">{u.email}</span>
                      </td>
                      <td>{u.team}</td>
                      <td className="num">{u.jobs}</td>
                      <td className="num">{u.acceptedClips}</td>
                      <td className="num">{u.spendUsd}</td>
                      <td className="num">{u.costPerAcceptedUsd ?? '—'}</td>
                      <td className="num">{u.medianRunSeconds === null ? '—' : `${Math.round(u.medianRunSeconds)} giây`}</td>
                      <td className="num">{u.failureRate === null ? '—' : percent(u.failureRate, 1)}</td>
                      <td className="num">{percent(u.spendOfCap, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
