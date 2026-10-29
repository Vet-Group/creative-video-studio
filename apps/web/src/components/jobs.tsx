'use client';
// The "My jobs" state: polls the server every 5 s, raises a toast and changes the tab title when a job finishes.
// What counts as news is kept in localStorage (the newest finish time already shown), so a job that ended while the tab was closed
// is announced when the user returns, and old results are not announced again.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, type TrayJob } from '@/lib/api';

const POLL_MS = 5_000;
const SEEN_KEY = 'cvs.tray.seenUntil';
/** How long the tab title keeps announcing a result in a tab the user is looking at. */
const TITLE_NEWS_MS = 8_000;
const BASE_TITLE = 'Creative Video Studio';
const FINISHED = ['succeeded', 'failed', 'failed_unknown', 'timed_out'];

export interface Toast {
  id: number;
  ok: boolean;
  text: string;
  /** A short note (a History chip applied) rather than a finished job: no Library link, and it goes by itself. */
  note?: boolean;
}

const NOTE_MS = 3_000;

/** A setting a History card's chip carries (Fash's chips, checked 2026-10-29): a click sets it on the form beside the History. */
export interface Setting {
  durationSec?: number;
  ratio?: string;
  resolution?: string;
}

/** After a form is refilled from a job or a sample (not a saved template): a note, as Fash's "Ready to Recreate" toast. */
export function useRecreated(): (from: string) => void {
  const { notify } = useJobs();
  return (from) => {
    if (!from.startsWith('/api/templates/')) notify('Sẵn sàng tạo lại');
  };
}

/** What a page's form offers the History, the Examples and their details beside it: Recreate in place (Fash's keeps the URL) and a chip's setting. */
export interface FormActions {
  recreate: (from: string) => void;
  apply?: (s: Setting) => void;
  /** A photo of a detail put on the form in its role, as a click on one of Fash's inputs does. */
  photo?: (p: Photo, role: PhotoRole) => void;
  /** A detail's words put in the form's prompt (Fash's "Prompt copied"). */
  prompt?: (text: string) => void;
  /** Fash's Use Result: the result on the form (Try On's model photo, Image Generation's inputs). */
  result?: (p: Photo) => void;
}
/** A photo a detail hands the form: a sample (uploaded as the member's own first, as a picked sample is) or an asset (a job's input or result). */
export type Photo = { sample: string } | { asset: string };
export type PhotoRole = 'model' | 'garment' | 'background' | 'product' | 'input';

/** The role of a job's or a sample's n-th photo: Try On sends the person, the garments, then the background; UGC the person, then the product. */
export function roleOf(feature: string, n: number, opts: { garments?: number | null; advanced?: boolean }): PhotoRole {
  if (feature === 'try_on') return n === 0 ? 'model' : n <= (opts.garments ?? Infinity) ? 'garment' : 'background';
  if (feature === 'marketing' && !opts.advanced) return n === 0 ? 'model' : 'product';
  return 'input';
}

/** One of a detail's pieces: a button that puts it on the form beside it, or the plain piece where there is none. */
export function Tap({ on, label, className, children }: { on?: () => void; label?: string; className?: string; children: ReactNode }) {
  if (!on) return className ? <span className={className}>{children}</span> : <>{children}</>;
  return (
    <button type="button" className={className ? `tap ${className}` : 'tap'} aria-label={label} title={label} onClick={on}>
      {children}
    </button>
  );
}
export const FormContext = createContext<FormActions | null>(null);
export const useForm = (): FormActions | null => useContext(FormContext);

/** The reuse action (Fash's Recreate): beside a form it refills that form in place and the URL stays; elsewhere (the Library) it opens the page that made it.
 * `from` is the API path the form refills from (lib/reuse.ts), `href` the page link; `onDone` runs after an in-place refill starts. */
export function Recreate({ href, from, className, label, onDone, children }: { href: string; from: string; className?: string; label?: string; onDone?: () => void; children: ReactNode }) {
  const form = useForm();
  if (!form)
    return (
      <Link href={href} className={className} aria-label={label}>
        {children}
      </Link>
    );
  return (
    <button type="button" className={className} aria-label={label} onClick={() => (form.recreate(from), onDone?.())}>
      {children}
    </button>
  );
}

/** The form's side of a chip click: sets what the chip carries and says so, as Fash's "Duration selected" and "Ratio selected" toasts. */
export function useApplier(set: (s: Setting) => void): (s: Setting) => void {
  const { notify } = useJobs();
  return (s) => {
    set(s);
    notify(s.durationSec ? `Đã chọn thời lượng ${s.durationSec}s` : s.ratio ? `Đã chọn tỉ lệ ${s.ratio}` : `Đã chọn độ phân giải ${s.resolution}`);
  };
}

interface JobsState {
  jobs: TrayJob[];
  workerOffline: boolean;
  /** The video clips made today against the daily clip cap; null until the first load. */
  clips: { today: number; cap: number } | null;
  loaded: boolean;
  toasts: Toast[];
  refresh: () => Promise<void>;
  dismiss: (id: number) => void;
  notify: (text: string) => void;
}

const Ctx = createContext<JobsState | null>(null);

export function useJobs(): JobsState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useJobs needs the app shell');
  return v;
}

/** As on Fash (checked 2026-10-29): beside the form, a page opens on History once its feature has a job, else on Examples. */
export function useHasHistory(feature: string): boolean {
  return useJobs().jobs.some((j) => j.feature === feature);
}

export function JobsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [data, setData] = useState({ jobs: [] as TrayJob[], workerOffline: false, clips: null as JobsState['clips'], loaded: false });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [news, setNews] = useState(false);
  const nextId = useRef(0);
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    const r = await api<{ jobs: TrayJob[]; workerOffline: boolean; clips: { today: number; cap: number } }>('/api/jobs?mine').catch(() => null);
    if (!r) return;
    setData({ jobs: r.jobs, workerOffline: r.workerOffline, clips: r.clips, loaded: true });
    const finished = r.jobs.filter((j) => FINISHED.includes(j.status) && j.finishedAt);
    const times = finished.map((j) => Date.parse(j.finishedAt!));
    const seenKey = `${SEEN_KEY}.${userId}`; // per user, so two accounts in one browser do not hide each other's news
    const stored = localStorage.getItem(seenKey);
    if (stored === null) {
      // First visit of this user in this browser: results that already exist are not news.
      localStorage.setItem(seenKey, String(Math.max(0, ...times)));
      return;
    }
    const fresh = finished.filter((j) => Date.parse(j.finishedAt!) > Number(stored));
    if (fresh.length === 0) return;
    localStorage.setItem(seenKey, String(Math.max(...times)));
    setNews(true);
    setToasts((cur) => [
      ...cur,
      ...fresh.map((j) => ({ id: nextId.current++, ok: j.status === 'succeeded', text: j.status === 'succeeded' ? (j.resolution ? 'Ảnh đã xong' : 'Clip đã xong') : 'Một job không thành công' })),
    ]);
  }, [userId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // A tab brought back to the front has delivered its news.
  useEffect(() => {
    const seen = () => document.visibilityState === 'visible' && setNews(false);
    document.addEventListener('visibilitychange', seen);
    return () => document.removeEventListener('visibilitychange', seen);
  }, []);

  // In a tab the user is already looking at, the title announcement lapses by itself (a hidden tab keeps it until it is shown).
  useEffect(() => {
    if (!news || document.visibilityState === 'hidden') return;
    const t = setTimeout(() => setNews(false), TITLE_NEWS_MS);
    return () => clearTimeout(t);
  }, [news]);

  const active = data.jobs.filter((j) => !FINISHED.includes(j.status)).length;
  useEffect(() => {
    document.title = news ? `Đã xong · ${BASE_TITLE}` : active > 0 ? `Đang tạo (${active}) · ${BASE_TITLE}` : BASE_TITLE;
  }, [news, active, pathname]);

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
    setNews(false);
  }, []);

  const notify = useCallback((text: string) => {
    const id = nextId.current++;
    setToasts((cur) => [...cur, { id, ok: true, text, note: true }]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), NOTE_MS);
  }, []);

  const value = useMemo(() => ({ ...data, toasts, refresh, dismiss, notify }), [data, toasts, refresh, dismiss, notify]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
