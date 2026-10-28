'use client';
// The "My jobs" state: polls the server every 5 s, raises a toast and changes the tab title when a job finishes.
// What counts as news is kept in localStorage (the newest finish time already shown), so a job that ended while the tab was closed
// is announced when the user returns, and old results are not announced again.
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

  const value = useMemo(() => ({ ...data, toasts, refresh, dismiss }), [data, toasts, refresh, dismiss]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
