'use client';
// The frame of every signed-in page: navigation, the "My jobs" tray and the toasts.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { api, errorText, sendJson, type JobStatus, type TrayJob } from '@/lib/api';
import { appBySlug } from '@/lib/apps';
import { COLLAPSED_COOKIE } from '@/lib/sidebar';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { Icon, type IconName } from './Icon';
import { JobsProvider, useJobs } from './jobs';
import { type Account, Settings } from './Settings';
import { VetLogo } from './VetLogo';

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
const FAILURE_TEXT = (noun: string): Partial<Record<JobStatus, string>> => ({
  failed: `Không tạo được ${noun}. Hãy thử lại, hoặc đổi ảnh hay mô hình.`,
  failed_unknown: `Không rõ ${noun} đã được tạo hay chưa. Hãy thử lại.`,
  timed_out: `Việc tạo ${noun} mất quá nhiều thời gian. Hãy thử lại.`,
});

const fmtTime = (iso: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));

function TrayItem({ job, isAdmin }: { job: TrayJob; isAdmin: boolean }) {
  const { refresh } = useJobs();
  const [problem, setProblem] = useState('');
  const failure = FAILURE_TEXT(job.resolution ? 'ảnh' : 'clip')[job.status];
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
          {job.ratio} · {job.resolution ?? `${job.durationSec}s`} · {fmtTime(job.createdAt)}
        </p>
        {failure && <p className="error">{failure}</p>}
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

/** The "My jobs" list. It sits beside the page, or in the History tab of Create. With `feature`, only the jobs of that feature (the History tab of Try On and Image Generation). */
export function Tray({ feature }: { feature?: string }) {
  const isAdmin = useContext(AdminContext);
  const all = useJobs();
  const { workerOffline, loaded } = all;
  const jobs = feature ? all.jobs.filter((j) => j.feature === feature) : all.jobs;
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

// The sidebar in the live order; later features slot in where the live sidebar has them.
const NAV: { href: string; text: string; icon: IconName }[] = [
  { href: '/explore', text: 'Khám phá', icon: 'home' },
  { href: '/try-on', text: 'Thử đồ', icon: 'tryon' },
  { href: '/image-generation', text: 'Tạo ảnh', icon: 'image' },
  { href: '/create', text: 'Tạo video', icon: 'create' },
  { href: '/marketing-studio', text: 'Marketing Studio', icon: 'megaphone' },
  { href: '/apps', text: 'Ứng dụng', icon: 'apps' },
  { href: '/library', text: 'Thư viện', icon: 'library' },
];

/** The pages that show their own History tab instead of the tray beside them. */
const OWN_HISTORY = ['/create', '/try-on', '/image-generation', '/marketing-studio'];

/** Explore and the Apps index give the full width to their card grids, as on the live site; the jobs show in Library and in the History tabs. */
const NO_TRAY = ['/explore', '/apps'];

/** The app pages have a History tab too; the coming-soon pages keep the tray. */
const hasOwnHistory = (path: string): boolean => {
  if (NO_TRAY.includes(path) || OWN_HISTORY.some((p) => path.startsWith(p))) return true;
  const app = path.startsWith('/apps/') ? appBySlug(path.split('/')[2]!) : undefined;
  return app !== undefined && !app.soon;
};

const PAGE_TITLES: [prefix: string, title: string][] = [
  ['/explore', 'Khám phá'],
  ['/try-on', 'Thử đồ'],
  ['/image-generation', 'Tạo ảnh'],
  ['/create', 'Tạo video'],
  ['/marketing-studio', 'Marketing Studio'],
  ['/apps', 'Ứng dụng'],
  ['/library', 'Thư viện'],
  ['/admin', 'Quản trị'],
  ['/account', 'Phương thức đăng nhập'],
];

export function Shell({ userId, userName, isAdmin, account, initialCollapsed, children }: { userId: string; userName: string; isAdmin: boolean; account: Account; initialCollapsed: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const narrow = useMediaQuery(NARROW);
  const [open, setOpen] = useState(false); // the drawer, below 1024 px
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(initialCollapsed); // the icon rail, from 1024 px
  const [settingsOpen, setSettingsOpen] = useState(false);
  const link = (href: string, text: string, icon: IconName, current = pathname === href) => (
    <Link key={href} href={href} aria-current={current ? 'page' : undefined} title={collapsed ? text : undefined}>
      <span className="nav-icon">
        <Icon name={icon} />
      </span>
      <span className="nav-label">{text}</span>
    </Link>
  );
  function toggleRail() {
    document.cookie = `${COLLAPSED_COOKIE}=${collapsed ? '0' : '1'}; path=/; max-age=31536000; samesite=lax`;
    setCollapsed(!collapsed);
  }

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!narrow) setOpen(false); // the drawer is for narrow screens only
  }, [narrow]);
  useEffect(() => {
    if (!open) return;
    sidebar.current?.querySelector<HTMLElement>('nav a')?.focus();
    document.body.style.overflow = 'hidden'; // the page behind the drawer does not scroll
    // Esc inside a dialog opened from the drawer (Settings) closes only that dialog.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target instanceof Element && e.target.closest('dialog')) && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      menuButton.current?.focus(); // runs once the drawer has closed and the page is no longer inert
    };
  }, [open]);

  const title = PAGE_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'Creative Video Studio';
  return (
    <JobsProvider userId={userId}>
      <AdminContext value={isAdmin}>
        <div className="app" data-collapsed={collapsed}>
          <div className="scrim" data-open={open} onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            ref={sidebar}
            className="sidebar"
            id="sidebar"
            data-open={open}
            role={narrow && open ? 'dialog' : undefined}
            aria-modal={narrow && open ? true : undefined}
            aria-label={narrow && open ? 'Menu' : undefined}
            onClick={(e) => e.target instanceof Element && e.target.closest('a') && setOpen(false)} // any link, even to the page already open
          >
            <div className="brand">
              <span className="logo" aria-hidden="true">
                <VetLogo size={28} />
              </span>
              <strong className="who">{userName}</strong>
              <span className="brand-tools">
                <button type="button" className="rail-toggle" aria-label="Thu gọn thanh bên" title="Thu gọn thanh bên" aria-pressed={collapsed} onClick={toggleRail}>
                  <Icon name="panel" size={16} />
                </button>
                <button type="button" className="settings-button" aria-label="Cài đặt" title="Cài đặt" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>
                  <Icon name="gear" size={16} />
                </button>
              </span>
              <button type="button" className="drawer-close" aria-label="Đóng menu" onClick={() => setOpen(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>
            <nav aria-label="Điều hướng chính">
              {NAV.map((n) => link(n.href, n.text, n.icon, pathname === n.href || pathname.startsWith(`${n.href}/`)))}
              {isAdmin && link('/admin/users', 'Quản trị', 'admin', pathname.startsWith('/admin'))}
            </nav>
          </div>
          <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} userName={userName} account={account} />
          <div className="content" inert={narrow && open}>
            <header className="topbar">
              <button ref={menuButton} type="button" className="menu-button" aria-label="Mở menu" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(true)}>
                <Icon name="menu" size={20} />
              </button>
              <strong>{title}</strong>
              <VetLogo size={28} />
            </header>
            <div className="frame">
              <main>{children}</main>
              {!hasOwnHistory(pathname) && <Tray />}
            </div>
          </div>
          <Toasts />
        </div>
      </AdminContext>
    </JobsProvider>
  );
}
