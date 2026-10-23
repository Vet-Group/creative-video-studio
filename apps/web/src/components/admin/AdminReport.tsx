'use client';
import { useState } from 'react';
import { useFetch } from '@/lib/admin-ui';

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
  const { data, failed } = useFetch<Report>(`/api/admin/report${week ? `?week=${week}` : ''}`);
  if (!data) return failed ? <p className="error">Không tải được báo cáo.</p> : <p role="status">Đang tải...</p>;
  return (
    <section aria-labelledby="report-title">
      <h1 id="report-title">Báo cáo tuần</h1>
      <div className="row">
        <label>
          Chọn ngày trong tuần
          <input type="date" value={week || data.week.start} onChange={(e) => setWeek(e.target.value)} />
        </label>
        <a className="button" href={`/api/admin/report/csv?week=${data.week.start}`} download>
          Tải CSV báo cáo
        </a>
      </div>
      <p>
        Tuần từ {data.week.start} đến {data.week.end} (giờ Việt Nam, thứ Hai đến Chủ nhật).
      </p>
      <p className="muted">
        Ngân sách tháng {data.cap.month}: đã dùng ${data.cap.usedUsd} trên ${data.cap.monthlyCapUsd}.
      </p>
      {failed && <p className="error">Không tải được tuần này, đang hiện tuần trước đó.</p>}
      <div className="table-wrap">
        <table>
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
      {data.users.length === 0 && <p className="muted">Không có job nào trong tuần này.</p>}
    </section>
  );
}
