'use client';
// The frame of every signed-in page: navigation, the "My jobs" tray and the toasts.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { api, errorText, sendJson, type JobStatus, type TrayJob } from '@/lib/api';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
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
// What a Member reads about a job that did not finish; the raw error is for Admins.
const FAILURE_TEXT: Partial<Record<JobStatus, string>> = {
  failed: 'Không tạo được clip. Hãy thử lại, hoặc đổi ảnh hay mô hình.',
  failed_unknown: 'Không rõ clip đã được tạo hay chưa. Hãy thử lại.',
  timed_out: 'Việc tạo clip mất quá nhiều thời gian. Hãy thử lại.',
};

const fmtTime = (iso: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));

function TrayItem({ job, isAdmin }: { job: TrayJob; isAdmin: boolean }) {
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
        {FAILURE_TEXT[job.status] && <p className="error">{FAILURE_TEXT[job.status]}</p>}
        {isAdmin && job.error && <p className="muted">{job.error}</p>}
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

const AdminContext = createContext(false);

/** The "My jobs" list. It sits beside the page, or in the History tab of Create. */
export function Tray() {
  const isAdmin = useContext(AdminContext);
  const { jobs, workerOffline, loaded } = useJobs();
  return (
    <aside className="tray" aria-label="Job của tôi">
      <h2>Job của tôi</h2>
      {workerOffline && <p className="warn">Worker offline: chưa nhận được tín hiệu từ máy xử lý, job sẽ chạy khi worker hoạt động lại.</p>}
      {loaded && jobs.length === 0 && <p className="muted">Chưa có job nào.</p>}
      <ul>
        {jobs.map((j) => (
          <TrayItem key={j.id} job={j} isAdmin={isAdmin} />
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

const PAGE_TITLES: [prefix: string, title: string][] = [
  ['/create', 'Tạo video'],
  ['/library', 'Thư viện'],
  ['/admin', 'Quản trị'],
  ['/account', 'Phương thức đăng nhập'],
];

export function Shell({ userId, userName, isAdmin, children }: { userId: string; userName: string; isAdmin: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const narrow = useMediaQuery(NARROW);
  const [open, setOpen] = useState(false); // the drawer, below 1024 px
  const menuButton = useRef<HTMLButtonElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);
  const link = (href: string, text: string, ref?: typeof firstLink) => (
    <Link href={href} ref={ref} aria-current={pathname === href ? 'page' : undefined}>
      {text}
    </Link>
  );
  async function signOut() {
    await api('/api/auth/sign-out', sendJson('POST', {})).catch(() => null);
    window.location.assign('/login');
  }

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    firstLink.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const title = PAGE_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'Creative Video Studio';
  return (
    <JobsProvider userId={userId}>
      <AdminContext value={isAdmin}>
        <div className="app">
          <div className="scrim" data-open={open} onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="sidebar" id="sidebar" data-open={open}>
            <div className="brand">
              <span className="logo" aria-hidden="true">
                CV
              </span>
              <strong>Creative Video Studio</strong>
            </div>
            <nav aria-label="Điều hướng chính">
              {link('/create', 'Tạo video', firstLink)}
              {link('/library', 'Thư viện')}
              {isAdmin && (
                <Link href="/admin/users" aria-current={pathname.startsWith('/admin') ? 'page' : undefined}>
                  Quản trị
                </Link>
              )}
            </nav>
            <div className="account">
              <span className="who">{userName}</span>
              {link('/account/sign-in-methods', 'Phương thức đăng nhập')}
              <button type="button" onClick={() => void signOut()}>
                Đăng xuất
              </button>
            </div>
          </div>
          <div className="content" inert={narrow && open}>
            <header className="topbar">
              <button ref={menuButton} type="button" aria-label="Mở menu" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(true)}>
                ☰
              </button>
              <strong>{title}</strong>
            </header>
            <div className="frame">
              <main>{children}</main>
              {!pathname.startsWith('/create') && <Tray />}
            </div>
          </div>
          <Toasts />
        </div>
      </AdminContext>
    </JobsProvider>
  );
}
