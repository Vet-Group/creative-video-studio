'use client';
// The frame of every signed-in page: navigation, the "My jobs" tray and the toasts.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, errorText, sendJson, type JobStatus, type TrayJob } from '@/lib/api';
import { appBySlug } from '@/lib/apps';
import { featureLabel } from '@/lib/features';
import { cardTitleOfFormat } from '@/lib/marketing';
import { canReuse, refillFrom, reuseHref } from '@/lib/reuse';
import { userAvatarColor } from '@/lib/profile';
import { COLLAPSED_COOKIE, isMac, isSettingsShortcut, navGroups } from '@/lib/sidebar';
import { confirmRun } from '@/lib/run-guard';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { AccountMenu } from './AccountMenu';
import { ConfirmHost, confirmDialog } from './Confirm';
import { Icon, type IconName } from './Icon';
import { JobFailureNote, canRetry, canRetryOnTwin, twinRetryText } from './JobFailure';
import { JobPrompt, JobsProvider, Recreate, roleOf, Tap, toggleFullscreen, useForm, useJobs } from './jobs';
import { LoadError } from './LoadError';
import { type Account, type Section, Settings } from './Settings';
import { SaveTemplateDialog, type Scope } from './Templates';
import { OpenToolGuide, ToolGuide, ToolGuideButton } from './ToolGuide';
import { VetLogo } from './VetLogo';
import { useZipDownload } from './ZipDownload';

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Đang chờ',
  submitting: 'Đang gửi',
  running: 'Đang tạo',
  succeeded: 'Hoàn tất',
  failed: 'Không thành công',
  failed_unknown: 'Không thành công (không rõ kết quả)',
  timed_out: 'Quá thời gian',
};

const fmtTime = (iso: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));

function TrayItem({ job, isAdmin }: { job: TrayJob; isAdmin: boolean }) {
  const { refresh } = useJobs();
  const [problem, setProblem] = useState('');
  const [sending, setSending] = useState(false);
  const thumb = job.posterAssetId ?? (job.resolution ? job.outputAssetId : null); // an image job's output is its own picture
  async function retry(onTwin = false) {
    setSending(true); // from the click on, so a double click cannot send two paid jobs
    if (await confirmRun(onTwin ? job.twin!.estimateUsd : job.estimateUsd, onTwin ? twinRetryText(job).ask : `Thử lại lượt tạo này với giá khoảng $${job.estimateUsd}?`)) {
      setProblem('');
      try {
        await api('/api/jobs', sendJson('POST', { retryOf: job.id, ...(onTwin && { onTwin }) }));
        await refresh();
      } catch (e) {
        setProblem(errorText(e, 'Không thử lại được'));
      }
    }
    setSending(false);
  }
  return (
    <li className={`job job-${job.status}`}>
      {thumb && <img className="job-poster" src={`/api/assets/${thumb}/content`} alt="" />}
      <div className="job-body">
        <p>
          <strong>{STATUS_LABEL[job.status]}</strong>
          {job.isMock && <span className="badge">MOCK</span>}
          {job.retryOf && <span className="tag">Thử lại</span>}
        </p>
        <p className="muted">
          {job.ratio} · {job.resolution ?? `${job.durationSec}s`} · {fmtTime(job.createdAt)}
        </p>
        <JobFailureNote job={job} isAdmin={isAdmin} />
        {job.status === 'succeeded' && (
          <p className="job-links">
            <Link href="/library">Xem trong Thư viện</Link>
          </p>
        )}
        {(canRetry(job) || canRetryOnTwin(job) || reuseHref(job)) && (
          <div className="job-main">
            {canRetry(job) && (
              <button type="button" className="job-reuse job-primary" disabled={sending} onClick={() => void retry()}>
                <Icon name="arrow" /> Thử lại
              </button>
            )}
            {canRetryOnTwin(job) && (
              <button type="button" className="job-reuse job-primary" disabled={sending} onClick={() => void retry(true)}>
                <Icon name="arrow" /> {twinRetryText(job).button}
              </button>
            )}
            {reuseHref(job) && (
              <Link href={reuseHref(job)!} className="job-reuse">
                <Icon name="copy" /> Dùng lại
              </Link>
            )}
          </div>
        )}
        {job.retried && <p className="muted">Đã thử lại</p>}
        {problem && <p className="error">{problem}</p>}
      </div>
    </li>
  );
}

/** The History card's title: the page's own name for what made it, as Fash titles its cards ("UGC Try On"). */
const cardTitle = (job: TrayJob): string => (job.feature === 'marketing' ? cardTitleOfFormat(job.format) : featureLabel(job.feature));

/**
 * One job in a page's History tab, laid out as Fash's History card: the result on the left; on the right the title, the member's own words,
 * the inputs, the ratio and length chips, the status and date, the icon actions and Dùng lại (Fash's Recreate, without the run).
 */
function HistoryCard({ job, isAdmin, select }: { job: TrayJob; isAdmin: boolean; select?: ReactNode }) {
  const form = useForm();
  const apply = form?.apply;
  const { refresh } = useJobs();
  const [problem, setProblem] = useState('');
  const [sending, setSending] = useState(false);
  const [favorite, setFavorite] = useState(job.favorite);
  /** Save template: null while closed, else whether the member may share it with the company (asked when the dialog opens). */
  const [saving, setSaving] = useState<{ canShare: boolean } | null>(null);
  const [saved, setSaved] = useState(false);
  const media = useRef<HTMLVideoElement & HTMLImageElement>(null);
  const image = job.resolution !== null;
  const out = job.status === 'succeeded' ? job.outputAssetId : null;
  const content = (id: string) => `/api/assets/${id}/content`;

  async function act(what: () => Promise<unknown>, fail: string) {
    setProblem('');
    try {
      await what();
    } catch (e) {
      setProblem(errorText(e, fail));
    }
  }
  const retry = async (onTwin = false) => {
    setSending(true); // from the click on, so a double click cannot send two paid jobs
    if (await confirmRun(onTwin ? job.twin!.estimateUsd : job.estimateUsd, onTwin ? twinRetryText(job).ask : `Thử lại lượt tạo này với giá khoảng $${job.estimateUsd}?`)) await act(async () => (await api('/api/jobs', sendJson('POST', { retryOf: job.id, ...(onTwin && { onTwin }) })), await refresh()), 'Không thử lại được');
    setSending(false);
  };
  const toggleFavorite = () => act(async () => setFavorite((await api<{ favorite: boolean }>(`/api/jobs/${job.id}/favorite`, sendJson('PUT', { favorite: !favorite }))).favorite), 'Không lưu được mục yêu thích.');
  const remove = async () => {
    if (!(await confirmDialog({ title: `Xoá ${image ? 'ảnh' : 'clip'} này?`, body: 'Nó cũng biến khỏi Thư viện.', confirmLabel: 'Xoá', danger: true }))) return;
    void act(async () => (await api(`/api/jobs/${job.id}`, { method: 'DELETE' }), await refresh()), `Không xoá được ${image ? 'ảnh' : 'clip'}.`);
  };
  // Save template from a card: the job's own uploads, words and settings become a template of its page (POST /api/templates fromJob).
  // Its name carries the time, not the card title, so it never matches a Run button's name such as 'Tạo video'.
  const savable = canReuse(job.feature) && (job.inputAssetIds.length > 0 || job.text !== null);
  const openSave = () =>
    act(async () => {
      setSaved(false);
      setSaving({ canShare: (await api<{ canShare: boolean }>(`/api/templates?feature=${job.feature}`)).canShare });
    }, 'Không mở được Lưu thiết lập.');
  async function saveTemplate(name: string, scope: Scope) {
    await api('/api/templates', sendJson('POST', { name, fromJob: job.id, ...(scope === 'company' && { isCompany: true }) }));
    setSaving(null);
    setSaved(true);
  }
  const download = () =>
    act(async () => {
      const a = document.createElement('a');
      a.href = (await api<{ downloadUrl: string }>(`/api/assets/${out}`)).downloadUrl;
      document.body.append(a);
      a.click();
      a.remove();
    }, 'Không tải xuống được.');

  return (
    <li className={`job job-card job-${job.status}`}>
      {out && select}
      <div className="job-media">
        {out ? (
          image ? (
            // A click on the picture is the eye's full screen; the eye stays the keyboard and screen-reader way in.
            <img ref={media} src={content(out)} alt={cardTitle(job)} loading="lazy" onClick={() => toggleFullscreen(media.current)} />
          ) : (
            // F opens full screen, as in most players; Space and the arrows are the video's own keys.
            <video ref={media} controls playsInline preload="metadata" poster={job.posterAssetId ? content(job.posterAssetId) : undefined} src={content(out)} onKeyDown={(e) => e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.preventDefault(), toggleFullscreen(media.current))} />
          )
        ) : (
          <span className="job-media-empty">{STATUS_LABEL[job.status]}</span>
        )}
        {/* On the picture, where the eye already is: full screen and a new tab; they show on hover or focus. */}
        {out && (
          <div className="job-media-tools">
            <button type="button" className="icon-button" onClick={() => toggleFullscreen(media.current)} aria-label="Toàn màn hình" title="Toàn màn hình (F)">
              <Icon name="eye" />
            </button>
            <a className="icon-button" href={content(out)} target="_blank" rel="noreferrer" aria-label="Mở trong tab mới" title="Mở trong tab mới">
              <Icon name="external" />
            </a>
          </div>
        )}
      </div>
      <div className="job-body">
        <h3>
          {cardTitle(job)}
          {job.isMock && <span className="badge">MOCK</span>}
          {job.retryOf && <span className="tag">Thử lại</span>}
        </h3>
        <p className="job-when" data-status={job.status}>
          <strong>{STATUS_LABEL[job.status]}</strong> · {fmtTime(job.createdAt)}
        </p>
        {/* As on Fash, the words, each input and the result can go on the form beside the History. */}
        {job.text && <JobPrompt text={job.text} onUse={form?.prompt && (() => form.prompt!(job.text!))} />}
        {job.inputAssetIds.length > 0 && job.feature !== 'motion_control' && (
          <ul className="job-inputs" aria-label="Ảnh đầu vào">
            {job.inputAssetIds.map((id, n) => (
              <li key={id}>
                <Tap on={form?.photo && (() => form.photo!({ asset: id }, roleOf(job.feature, n, { garments: job.garments, format: job.format, roles: job.roles })))} label={`Dùng ảnh đầu vào ${n + 1}`}>
                  <img src={content(id)} alt="" loading="lazy" />
                </Tap>
              </li>
            ))}
          </ul>
        )}
        {apply ? (
          // As on Fash, a chip sets its value on the form beside the History.
          <p className="job-chips">
            {image ? (
              job.resolution && (
                <button type="button" onClick={() => apply({ resolution: job.resolution! })} title="Dùng độ phân giải này">
                  {job.resolution}
                </button>
              )
            ) : (
              <button type="button" onClick={() => apply({ durationSec: job.durationSec })} title="Dùng thời lượng này">
                {job.durationSec}s
              </button>
            )}
            <button type="button" onClick={() => apply({ ratio: job.ratio })} title="Dùng tỉ lệ này">
              {job.ratio}
            </button>
          </p>
        ) : (
          <p className="job-chips">
            <span>{image ? job.resolution : `${job.durationSec}s`}</span>
            <span>{job.ratio}</span>
          </p>
        )}
        <JobFailureNote job={job} isAdmin={isAdmin} />
        {job.retried && <p className="muted">Đã thử lại</p>}
        {problem && <p className="error">{problem}</p>}
        {saved && <p role="status">Đã lưu thiết lập.</p>}
        <div className="job-main">
          {canRetry(job) && (
            <button type="button" className="job-reuse job-primary" disabled={sending} onClick={() => void retry()}>
              <Icon name="arrow" /> Thử lại
            </button>
          )}
          {canRetryOnTwin(job) && (
            <button type="button" className="job-reuse job-primary" disabled={sending} onClick={() => void retry(true)}>
              <Icon name="arrow" /> {twinRetryText(job).button}
            </button>
          )}
          {reuseHref(job) && (
            <Recreate href={reuseHref(job)!} from={refillFrom({ reuse: job.id })!} className={out ? 'job-reuse job-primary' : 'job-reuse'}>
              <Icon name="copy" /> Dùng lại
            </Recreate>
          )}
          {out && (
            <button type="button" className="job-reuse" onClick={() => void download()}>
              <Icon name="download" /> Tải xuống
            </button>
          )}
          {out && image && form?.result && (
            <button type="button" className="job-reuse job-result" onClick={() => form.result!({ asset: out })}>
              <Icon name="right" /> Dùng kết quả
            </button>
          )}
          {/* Fash's Generate Video on an image: Create video opens with the picture as its first image. */}
          {out && image && (
            <Link href={`/create?image=${out}`} className="job-reuse">
              <Icon name="film" /> Tạo video
            </Link>
          )}
        </div>
        {(savable || out) && (
          <div className="job-actions" role="group" aria-label="Thao tác khác">
            {out && (
              <button type="button" className="favorite icon-button" aria-pressed={favorite} onClick={() => void toggleFavorite()} aria-label="Yêu thích" title={favorite ? 'Bỏ yêu thích' : 'Yêu thích'}>
                <Icon name="star" filled={favorite} />
              </button>
            )}
            {savable && (
              <button type="button" className="icon-button" onClick={() => void openSave()} aria-label={`Lưu thiết lập từ lượt tạo lúc ${fmtTime(job.createdAt)}`} title="Lưu thành thiết lập">
                <Icon name="plus" />
              </button>
            )}
            {out && (
              <button type="button" className="danger icon-button" onClick={() => void remove()} aria-label="Xoá" title="Xoá">
                <Icon name="x" />
              </button>
            )}
          </div>
        )}
      </div>
      {savable && <SaveTemplateDialog open={saving !== null} onClose={() => setSaving(null)} onSave={saveTemplate} canShare={saving?.canShare ?? false} name={cardTitle(job)} />}
    </li>
  );
}

const AdminContext = createContext(false);

/** The History of a page with no job yet, in the Library's empty style: one line and a way to the form. On a phone the form is its own tab, which this opens first. */
function HistoryEmpty() {
  const toForm = () => {
    const form = document.querySelector<HTMLElement>('.form-card, .imagebar');
    if (!form) return;
    if (form.hidden) document.getElementById(form.getAttribute('aria-labelledby') ?? '')?.click();
    // After the tab has rendered the form.
    requestAnimationFrame(() => form.querySelector<HTMLElement>('textarea, select, input:not([type=file]):not([hidden]), button:not(:disabled)')?.focus());
  };
  return (
    <div className="library-empty">
      <p className="muted">Chưa có lượt tạo nào.</p>
      <p className="library-empty-actions">
        <button type="button" onClick={toForm}>
          Bắt đầu ngay
        </button>
      </p>
    </div>
  );
}

/** The "My jobs" list. It sits beside the page, or in the History tab of Create. With `feature`, only the jobs of that feature (the History tab of Try On and Image Generation).
 * Beside a form (FormContext), the cards' chips set their value on it and Dùng lại refills it in place. */
export function Tray({ feature }: { feature?: string }) {
  const isAdmin = useContext(AdminContext);
  const all = useJobs();
  const { workerOffline, loaded, failed, refresh } = all;
  const jobs = feature ? all.jobs.filter((j) => j.feature === feature) : all.jobs;
  const zip = useZipDownload();
  return (
    <aside className={feature ? 'tray history' : 'tray'} aria-label="Lượt tạo của tôi">
      <h2>Lượt tạo của tôi</h2>
      {workerOffline && <p className="warn">Máy xử lý đang tạm ngừng: chưa nhận được tín hiệu, lượt tạo sẽ chạy khi máy hoạt động lại.</p>}
      {failed && <LoadError text={loaded ? 'Không cập nhật được danh sách lượt tạo.' : 'Không tải được danh sách lượt tạo.'} onRetry={refresh} />}
      {loaded && jobs.length === 0 && (feature ? <HistoryEmpty /> : <p className="muted">Chưa có lượt tạo nào.</p>)}
      <ul>
        {jobs.map((j) => (feature ? <HistoryCard key={j.id} job={j} isAdmin={isAdmin} select={zip.check(j.id, `${cardTitle(j)} ${fmtTime(j.createdAt)}`)} /> : <TrayItem key={j.id} job={j} isAdmin={isAdmin} />))}
      </ul>
      {/* Under the cards, so turning History into a tool row does not move them. */}
      {feature && jobs.some((j) => j.status === 'succeeded' && j.outputAssetId) && (
        <div className="zip-tools">
          {zip.toggle}
          {zip.bar}
        </div>
      )}
    </aside>
  );
}

function Toasts() {
  const { toasts, dismiss } = useJobs();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el?.showPopover) return;
    if (el.matches(':popover-open')) el.hidePopover();
    if (toasts.length > 0) el.showPopover(); // shown last, so above a dialog opened before it
  }, [toasts]);
  return (
    <div ref={ref} popover="manual" className="toasts" role="region" aria-label="Thông báo" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={t.ok ? 'toast' : 'toast toast-bad'}>
          <span>{t.text}</span>
          {t.ok && !t.note && <Link href="/library">Xem</Link>}
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Đóng thông báo">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * A thin bar along the top while any link of the app opens another page (Explore cards, Dùng lại, Dùng ví dụ này, the sidebar too), shown after 150 ms.
 * The App Router has no navigation events: a plain click on a same-site link to another address starts it, the new page showing (Next then sets the
 * address and a new history.state, also when a redirect lands back on the current address) or Back ends it, and it gives up after 15 s in case a link handled the click without navigating.
 */
function NavProgress() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let timer = 0;
    let poll = 0;
    const stop = () => {
      clearTimeout(timer);
      cancelAnimationFrame(poll);
      setOn(false);
    };
    const click = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || a.origin !== location.origin) return;
      if (a.pathname === location.pathname && a.search === location.search) return; // the same page, or only its #fragment
      const from = location.href;
      const state = history.state;
      stop();
      setOn(true);
      const watch = () => {
        // The router writes a new history.state each time a page commits, even when a redirect lands on the address already shown.
        if (location.href !== from || history.state !== state) return stop();
        poll = requestAnimationFrame(watch);
      };
      poll = requestAnimationFrame(watch);
      timer = window.setTimeout(stop, 15_000);
    };
    document.addEventListener('click', click, true); // capture: Next's Link cancels the click's default before the bubble phase
    window.addEventListener('popstate', stop);
    return () => {
      document.removeEventListener('click', click, true);
      window.removeEventListener('popstate', stop);
      stop();
    };
  }, []);
  return <div className="nav-progress" data-on={on} aria-hidden="true" />;
}

/** The pages that show their own History tab instead of the tray beside them. */
const OWN_HISTORY = ['/create', '/try-on', '/image-generation', '/marketing-studio'];

/** Explore, the Apps index and the Library give the full width to their grids (the Library already lists every result), and the Admin pages to their tables; the jobs show in Library and in the History tabs. */
const NO_TRAY = ['/explore', '/apps', '/library'];

/** The app pages have a History tab too; the coming-soon pages keep the tray. */
const hasOwnHistory = (path: string): boolean => {
  if (NO_TRAY.includes(path) || path.startsWith('/admin') || OWN_HISTORY.some((p) => path.startsWith(p))) return true;
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
  const [settings, setSettings] = useState<Section | null>(null); // the open Settings dialog's first section
  const [guide, setGuide] = useState(false); // the "Chọn công cụ nào?" dialog
  const openGuide = useCallback(() => (setOpen(false), setGuide(true)), []);
  const [hintOff, setHintOff] = useState(false); // Esc hides a sidebar line until focus or the pointer moves on
  const link = (href: string, text: string, icon: IconName, current = pathname === href, badge?: string, hint?: string) => {
    const a = (
      <Link key={href} href={href} aria-current={current ? 'page' : undefined} aria-describedby={hint ? `nav-hint-${icon}` : undefined} title={collapsed && !hint ? text : undefined}>
        <span className="nav-icon">
          <Icon name={icon} size={16} filled />
        </span>
        <span className="nav-label">{text}</span>
        {badge && <span className="nav-badge" aria-hidden="true">{badge}</span>}
      </Link>
    );
    if (!hint) return a;
    // Beside the link, not in it, so the link's name stays the page's name.
    return (
      <div key={href} className="nav-item">
        {a}
        <span className="nav-hint">
          <strong>{text}</strong>
          <span id={`nav-hint-${icon}`}>{hint}</span>
        </span>
      </div>
    );
  };
  function toggleRail() {
    document.cookie = `${COLLAPSED_COOKIE}=${collapsed ? '0' : '1'}; path=/; max-age=31536000; samesite=lax`;
    setCollapsed(!collapsed);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isSettingsShortcut(e, isMac()) || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      setSettings('profile');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
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

  const current = (href: string) => (href.startsWith('/admin') ? pathname.startsWith('/admin') : pathname === href || pathname.startsWith(`${href}/`));
  const accountMenu = (variant: 'chip' | 'avatar') => (
    <AccountMenu name={userName} email={account.email} color={userAvatarColor(userName, account.avatarColor)} variant={variant} onSettings={setSettings} />
  );
  const title = PAGE_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'Creative Video Studio';
  return (
    <JobsProvider userId={userId}>
      <AdminContext value={isAdmin}>
        <OpenToolGuide value={openGuide}>
          <div className="app" data-collapsed={collapsed}>
            <NavProgress />
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
                <strong>Video Studio</strong>
                <span className="brand-tools">
                  <button type="button" className="rail-toggle" aria-label="Thu gọn thanh bên" title="Thu gọn thanh bên" aria-pressed={collapsed} onClick={toggleRail}>
                    <Icon name="panel" size={16} />
                  </button>
                </span>
                <button type="button" className="drawer-close" aria-label="Đóng menu" onClick={() => setOpen(false)}>
                  <Icon name="x" size={16} />
                </button>
              </div>
              <nav aria-label="Điều hướng chính" data-hint-off={hintOff || undefined} onKeyDown={(e) => e.key === 'Escape' && setHintOff(true)} onFocus={() => setHintOff(false)} onPointerOver={() => hintOff && setHintOff(false)}>
                {navGroups(isAdmin).map((g, i) => (
                  <div key={g.label ?? 'home'} className="nav-group" role={g.label ? 'group' : undefined} aria-labelledby={g.label ? `nav-group-${i}` : undefined}>
                    {g.label && (
                      <div className="nav-group-head">
                        <p className="nav-group-label" id={`nav-group-${i}`}>
                          {g.label}
                        </p>
                        {g.items.some((n) => n.hint) && <ToolGuideButton className="nav-guide">Chọn công cụ nào?</ToolGuideButton>}
                      </div>
                    )}
                    {g.items.map((n) => link(n.href, n.text, n.icon, current(n.href), n.badge, n.hint))}
                  </div>
                ))}
              </nav>
              {accountMenu('chip')}
            </div>
            <Settings open={settings !== null} onClose={() => setSettings(null)} userName={userName} account={account} start={settings ?? 'profile'} />
            <div className="content" inert={narrow && open}>
              <header className="topbar">
                <button ref={menuButton} type="button" className="menu-button" aria-label="Mở menu" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(true)}>
                  <Icon name="menu" size={20} />
                </button>
                <strong>{title}</strong>
                {accountMenu('avatar')}
              </header>
              <div className="frame">
                <main>{children}</main>
                {!hasOwnHistory(pathname) && <Tray />}
              </div>
            </div>
            <Toasts />
          </div>
          <ToolGuide open={guide} onClose={() => setGuide(false)} />
          <ConfirmHost />
        </OpenToolGuide>
      </AdminContext>
    </JobsProvider>
  );
}
