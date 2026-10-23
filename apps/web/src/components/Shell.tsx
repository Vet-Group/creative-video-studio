'use client';
// The frame of every signed-in page: navigation, the "My jobs" tray and the toasts.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { api, errorText, sendJson, type JobStatus, type TrayJob } from '@/lib/api';
import { JobsProvider, useJobs } from './jobs';

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Đang chờ',
  submitting: 'Đang gửi',
  running: 'Đang tạo',
  succeeded: 'Hoàn tất',
  failed: 'Thất bại',
  failed_unknown: 'Thất bại (không rõ kết quả)',
  timed_out: 'Quá thời gian',
};
const RETRYABLE: JobStatus[] = ['failed', 'failed_unknown', 'timed_out'];

const fmtTime = (iso: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));

function TrayItem({ job }: { job: TrayJob }) {
  const { refresh } = useJobs();
  const [problem, setProblem] = useState('');
  async function retry() {
    setProblem('');
    try {
      await api('/api/jobs', sendJson('POST', { retryOf: job.id }));
      await refresh();
    } catch (e) {
      setProblem(errorText(e, 'Không thử lại được'));
    }
  }
  return (
    <li className={`job job-${job.status}`}>
      {job.posterAssetId && <img className="job-poster" src={`/api/assets/${job.posterAssetId}/content`} alt="" />}
      <div className="job-body">
        <p>
          <strong>{STATUS_LABEL[job.status]}</strong>
          {job.isMock && <span className="badge">MOCK</span>}
          {job.retryOf && <span className="tag">Thử lại</span>}
        </p>
        <p className="muted">
          {job.ratio} · {job.durationSec}s · {fmtTime(job.createdAt)}
        </p>
        {job.error && <p className="error">{job.error}</p>}
        {job.status === 'succeeded' && <Link href="/library">Xem trong Thư viện</Link>}
        {RETRYABLE.includes(job.status) && !job.retried && !job.retryOf && (
          <button type="button" onClick={() => void retry()}>
            Thử lại
          </button>
        )}
        {job.retried && <p className="muted">Đã thử lại</p>}
        {problem && <p className="error">{problem}</p>}
      </div>
    </li>
  );
}

function Tray() {
  const { jobs, workerOffline, loaded } = useJobs();
  return (
    <aside className="tray" aria-label="Job của tôi">
      <h2>Job của tôi</h2>
      {workerOffline && <p className="warn">Worker offline: chưa nhận được tín hiệu từ máy xử lý, job sẽ chạy khi worker hoạt động lại.</p>}
      {loaded && jobs.length === 0 && <p className="muted">Chưa có job nào.</p>}
      <ul>
        {jobs.map((j) => (
          <TrayItem key={j.id} job={j} />
        ))}
      </ul>
    </aside>
  );
}

function Toasts() {
  const { toasts, dismiss } = useJobs();
  return (
    <div className="toasts" role="region" aria-label="Thông báo" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={t.ok ? 'toast' : 'toast toast-bad'}>
          <span>{t.text}</span>
          {t.ok && <Link href="/library">Xem</Link>}
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Đóng thông báo">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function Shell({ userName, children }: { userName: string; children: ReactNode }) {
  const pathname = usePathname();
  const link = (href: string, text: string) => (
    <Link href={href} aria-current={pathname === href ? 'page' : undefined}>
      {text}
    </Link>
  );
  async function signOut() {
    await api('/api/auth/sign-out', sendJson('POST', {})).catch(() => null);
    window.location.assign('/login');
  }
  return (
    <JobsProvider>
      <header className="bar">
        <strong>Creative Video Studio</strong>
        <nav aria-label="Điều hướng chính">
          {link('/create', 'Tạo video')}
          {link('/library', 'Thư viện')}
        </nav>
        <span className="who">{userName}</span>
        <button type="button" onClick={() => void signOut()}>
          Đăng xuất
        </button>
      </header>
      <div className="frame">
        <main>{children}</main>
        <Tray />
      </div>
      <Toasts />
    </JobsProvider>
  );
}
