'use client';
// The "My jobs" state: polls the server (every 5 s while a job is in flight, every 30 s otherwise: lib/tray-poll), raises a toast and changes the tab title when a job finishes (and, if switched on in Settings, a system notification and a chime).
// What counts as news is kept in localStorage (the newest finish time already shown), so a job that ended while the tab was closed
// is announced when the user returns, and old results are not announced again.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, type DragEvent, type ReactNode,useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CANCELED_ERROR } from '@cvs/core/ledger';
import { api, ApiError, sendJson, type TrayJob } from '@/lib/api';
import { featureLabel } from '@/lib/features';
import { announce } from '@/lib/preferences';
import { pageOf } from '@/lib/reuse';
import { pollTray } from '@/lib/tray-poll';
import { useTabReturn } from '@/lib/use-tab-return';
import type { UploadSlot } from '@/lib/upload-slots';
import { confirmDialog } from './Confirm';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { BusyNote, isVietnamese, useTranslate } from './Suggestions';

const SEEN_KEY = 'cvs.tray.seenUntil';
/** How long the tab title keeps announcing a result in a tab the user is looking at. */
const TITLE_NEWS_MS = 8_000;
const BASE_TITLE = 'Creative Video Studio';
const FINISHED = ['succeeded', 'failed', 'failed_unknown', 'timed_out'];

// elapsedLabel lives in lib/explore (server-safe) so the Explore server page can call it; re-exported here for the tray and History.
export { elapsedLabel, providerQueueLabel } from '@/lib/explore';

/** Cancel on a queued job, which no provider has been sent yet, so it costs nothing; the tray refreshes after, and a job that started meanwhile says so. */
export function CancelButton({ job }: { job: TrayJob }) {
  const { refresh } = useJobs();
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState('');
  if (job.status !== 'queued') return null;
  const cancel = async () => {
    if (!(await confirmDialog({ title: 'Huỷ lượt tạo này?', body: 'Lượt tạo chưa chạy nên không mất chi phí.', confirmLabel: 'Huỷ lượt tạo', danger: true }))) return;
    setSending(true);
    setProblem('');
    try {
      await api(`/api/jobs/${job.id}/cancel`, sendJson('POST', {}));
    } catch (e) {
      setProblem(e instanceof ApiError && e.status === 409 ? e.message : 'Không huỷ được.');
    }
    await refresh();
    setSending(false);
  };
  return (
    <>
      <div className="job-main">
        <button type="button" className="job-reuse" disabled={sending} onClick={() => void cancel()}>
          <Icon name="x" /> Huỷ
        </button>
      </div>
      {problem && <p className="error">{problem}</p>}
    </>
  );
}

/** Cancels each job in turn through the one-job cancel; a 409 means it started meanwhile (left running), any other error is counted as not canceled. */
export async function cancelEach(ids: readonly string[], cancel = (id: string) => api(`/api/jobs/${id}/cancel`, sendJson('POST', {}))): Promise<{ started: number; failed: number }> {
  let started = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await cancel(id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) started++;
      else failed++;
    }
  }
  return { started, failed };
}

/** One button for every queued job of the member at once (InvokeAI's clear-queue idea), shown from two up: each goes through the same cancel as CancelButton, one after
 * another, and a job that started meanwhile is left running and counted in the note. */
export function CancelAllQueued({ jobs, refresh }: { jobs: readonly TrayJob[]; refresh: () => Promise<unknown> }) {
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');
  const queued = jobs.filter((j) => j.status === 'queued');
  if (queued.length < 2 && !note) return null;
  const cancelAll = async () => {
    const n = queued.length;
    if (!(await confirmDialog({ title: `Huỷ cả ${n} lượt đang chờ?`, body: 'Các lượt này chưa chạy nên không mất chi phí.', confirmLabel: `Huỷ ${n} lượt`, danger: true }))) return;
    setSending(true);
    setNote('');
    const { started, failed } = await cancelEach(queued.map((j) => j.id));
    await refresh();
    setSending(false);
    setNote([started > 0 && `${started} lượt đã bắt đầu chạy nên không huỷ được.`, failed > 0 && `${failed} lượt không huỷ được.`].filter(Boolean).join(' '));
  };
  return (
    <p className="tray-cancel-all">
      {queued.length >= 2 && (
        <button type="button" className="notice-link" disabled={sending} onClick={() => void cancelAll()}>
          Huỷ cả {queued.length} lượt đang chờ
        </button>
      )}{' '}
      <span aria-live="polite">{note}</span>
    </p>
  );
}

export interface Toast {
  id: number;
  ok: boolean;
  text: string;
  /** A short note (a History chip applied) rather than a finished job: no Library link, and it goes by itself. */
  note?: boolean;
  /** A note said again while still shown (four garments put on the form one by one): how many times, shown as ×N instead of a stack. */
  count?: number;
  /** A loading note, which its caller takes away; a new note never replaces it. */
  wait?: boolean;
  /** A finished job's link: its result in the Library, or for a failure the page that made it. */
  href?: string;
}

/** Where a finished job's toast and tray link go: a result opens itself in the Library (as Explore's cards do), a failure its page's History. */
export const resultHref = (job: { id: string; status: string; feature: string }): string => (job.status === 'succeeded' ? `/library?item=${encodeURIComponent(job.id)}` : (pageOf(job.feature) ?? '/library'));

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
  /** `recipe`: a company example, whose words and settings go on the form but not its photos. */
  recreate: (from: string, recipe?: boolean) => void;
  apply?: (s: Setting) => void;
  /** The settings `apply` takes, where the form has only some (an app with a ratio but no resolution); absent, it takes them all. */
  settings?: (keyof Setting)[];
  /** A photo of a detail put on the form in its role, as a click on one of Fash's inputs does. */
  photo?: (p: Photo, role: PhotoRole) => void;
  /** Whether the form already has this asset in a slot: its History input is ticked and not added twice. */
  has?: (asset: string) => boolean;
  /** A detail's words put in the form's prompt (Fash's "Prompt copied"). */
  prompt?: (text: string) => void;
  /** Fash's Use Result: the result on the form (Try On's model photo, Image Generation's inputs). */
  result?: (p: Photo) => void;
  /** The Fashion Model Generator's save-as-model button on a finished image: its asset id and the job's own traits (JSON), for the save dialog. */
  saveModel?: (assetId: string, traits: string | null) => void;
  /** Whether that image was saved as a model already, so its button says so instead of offering a second copy. */
  savedModel?: (assetId: string) => boolean;
  /** Marketing Studio's use-this-hook button: an example's hook (a library hook id, else its own words) and its ending on the form; the photos and the rest stay. */
  hook?: (h: ExampleHook) => void;
  /** Marketing Studio's save-as-my-hook button: the example's hook saved as the member's own and chosen, with the example's poster (a sample name) as its photo. */
  saveHook?: (h: ExampleHook & { name: string; poster: string }) => Promise<void>;
  /** Marketing Advanced's use-as-reference-video button: an example clip (a sample name) as the reference video; absent where the form takes none. */
  video?: (sample: string) => Promise<void>;
}
/** The hook and the ending of an example's details file. */
export interface ExampleHook {
  hook?: string | null;
  hookText?: string | null;
  ending?: string | null;
}
/** A photo a detail hands the form: a sample (uploaded as the member's own first, as a picked sample is) or an asset (a job's input or result). */
export type Photo = { sample: string } | { asset: string };
export type PhotoRole = 'model' | 'garment' | 'background' | 'product' | 'packaging' | 'input';

/** The role of a job's or a sample's n-th photo: Try On sends the person, the garments, then the background; UGC and Review the person, then the product; the other formats' photos are plain inputs. */
export function roleOf(feature: string, n: number, opts: { garments?: number | null; format?: string | null; roles?: string | null }): PhotoRole {
  if (feature === 'try_on') return n === 0 ? 'model' : n <= (opts.garments ?? Infinity) ? 'garment' : 'background';
  if (feature === 'marketing' && (!opts.format || opts.format === 'review')) return n === 0 ? 'model' : 'product';
  // Unboxing names its photos in the job's roles (model, product, packaging); a sample has none, so its photos are plain inputs.
  const role = feature === 'marketing' && opts.format === 'unboxing' ? opts.roles?.split(',')[n] : undefined;
  if (role === 'model' || role === 'product' || role === 'packaging') return role;
  return 'input';
}

/** What a photo dropped on a form slot becomes, by the slot's key (lib/upload-slots.ts): the slot decides, not where the photo came from. The end frame and a hook's picture take none. */
const DROP_ROLE: Partial<Record<UploadSlot, PhotoRole>> = { garment: 'garment', model: 'model', background: 'background', product: 'product', packaging: 'packaging', reference: 'input', image: 'input', video: 'input' };
export const dropRole = (slot: UploadSlot | undefined): PhotoRole | undefined => (slot ? DROP_ROLE[slot] : undefined);

/** Set on a drag that carries a photo from History or the Examples, so a slot can tell it from a dragged file. */
export const PHOTO_DRAG = 'application/x-cvs-photo';
export const isPhotoDrag = (e: { dataTransfer: Pick<DataTransfer, 'types'> }) => e.dataTransfer.types.includes(PHOTO_DRAG);
// The photo being dragged, as the put a click would run: the drop calls it with the slot's role, so the form does what a click does (its limit, its note, no copy twice).
let dragged: ((role: PhotoRole) => void) | null = null;
export const dropPhoto = (role: PhotoRole): void => dragged?.(role);

/** Props that make a photo draggable to a form slot (a pointer extra: the click is the keyboard and touch way); none where no form takes photos. */
export function photoDrag(put: ((role: PhotoRole) => void) | undefined) {
  if (!put) return {};
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      dragged = put;
      e.dataTransfer.setData(PHOTO_DRAG, '1'); // Firefox starts a drag only with data
      e.dataTransfer.effectAllowed = 'copy';
    },
    onDragEnd: () => {
      dragged = null;
    },
  };
}

/**
 * One of a detail's pieces: a button that puts it on the form beside it, or the plain piece where there is none. The button is named by the piece it
 * shows (WCAG 2.5.3 Label in Name); `label` says what a click does, as its title and so its description.
 */
export function Tap({ on, label, className, children }: { on?: () => void; label?: string; className?: string; children: ReactNode }) {
  if (!on) return className ? <span className={className}>{children}</span> : <>{children}</>;
  return (
    <button type="button" className={className ? `tap ${className}` : 'tap'} title={label} onClick={on}>
      {children}
    </button>
  );
}

/** Each photo role by the name a History input's hover and its viewer's button give it. */
const ROLE_NAME: Record<PhotoRole, string> = { model: 'người mẫu', garment: 'trang phục', background: 'bối cảnh', product: 'sản phẩm', packaging: 'bao bì', input: 'đầu vào' };

/**
 * A History card's or an Example's input photo. Beside a form a click puts it there in its role, which a hover names; a photo the form already has
 * is ticked and not added twice; the corner button shows it large. With no form beside it, a click shows it large.
 */
export function InputThumb({ photo, n, role, thumb, full }: { photo: Photo; n: number; role: PhotoRole; thumb: string; full: string }) {
  const form = useForm();
  const { notify } = useJobs();
  const [viewing, setViewing] = useState(false);
  const used = 'asset' in photo && !!form?.has?.(photo.asset);
  const name = ROLE_NAME[role];
  const put = form?.photo;
  // A drag to a slot puts the photo in that slot's role; a click, in this photo's own.
  const use = put && ((to: PhotoRole = role) => (used ? notify('Ảnh này đã có trong biểu mẫu') : put(photo, to)));
  return (
    <li className="input-thumb">
      <button type="button" className="tap" aria-label={use ? `Ảnh đầu vào ${n + 1}: dùng làm ${name}${used ? ', đã có trong biểu mẫu' : ''}` : `Xem lớn ảnh ${n + 1}`} onClick={use ? () => use() : () => setViewing(true)}>
        <img src={thumb} alt="" loading="lazy" {...photoDrag(use)} />
        {used && (
          <span className="input-used" aria-hidden="true">
            <Icon name="check" size={10} />
          </span>
        )}
        {use && (
          <span className="input-use" aria-hidden="true">
            {used ? 'Đã có' : `+ ${name[0]!.toUpperCase()}${name.slice(1)}`}
          </span>
        )}
      </button>
      {use && (
        <button type="button" className="input-zoom" aria-label={`Xem lớn ảnh ${n + 1}`} title="Xem ảnh lớn" onClick={() => setViewing(true)}>
          <Icon name="expand" size={12} />
        </button>
      )}
      {viewing && (
        <Modal open onClose={() => setViewing(false)} label={`Ảnh đầu vào ${n + 1}`} className="input-viewer">
          {/* The thumbnail, already loaded, stands in while the original comes. */}
          <img src={full} alt={`Ảnh đầu vào ${n + 1}`} style={{ background: `center / contain no-repeat url("${thumb}")` }} />
          {use && !used && (
            <button type="button" className="lightbox-reuse input-viewer-use" onClick={() => (use(), setViewing(false))}>
              <Icon name="plus" /> Dùng làm {name}
            </button>
          )}
        </Modal>
      )}
    </li>
  );
}
/** A job's or an example's words: four lines with show more for the rest (no inner scroll bar), copy, and beside a form a click puts them in its prompt box. */
export function JobPrompt({ text, onUse }: { text: string; onUse?: () => void }) {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const tr = useTranslate(text.trim());
  const [long, setLong] = useState(false);
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Show more only when the four-line clamp really cuts the text (measured; once open, the clamp is off and the button stays).
  // shortcut: measured on mount and on a new text, not on resize; a card does not change width while it shows.
  useLayoutEffect(() => {
    const t = box.current?.querySelector('.job-text');
    if (t && !open) setLong(t.scrollHeight > t.clientHeight + 1);
  }, [text, open]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = () => {
    const done = (r: 'ok' | 'failed') => {
      setCopied(r);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 1500);
    };
    // No clipboard outside a secure context (the LAN address over http): say so rather than do nothing.
    if (!navigator.clipboard) return done('failed');
    void navigator.clipboard.writeText(text).then(
      () => done('ok'),
      () => done('failed'),
    );
  };
  const copyText = copied === 'ok' ? 'Đã chép' : copied === 'failed' ? 'Không chép được' : 'Sao chép';
  return (
    <div ref={box} className="job-prompt" data-open={open || undefined}>
      <Tap on={onUse} label="Chép vào ô mô tả" className="job-text">
        {text}
      </Tap>
      <div className="job-prompt-tools">
        {long && (
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Thu gọn' : 'Xem thêm'}
          </button>
        )}
        <button type="button" onClick={copy} aria-label={`${copyText} mô tả`}>
          <Icon name={copied === 'ok' ? 'check' : 'copy'} size={12} />
          {copyText}
        </button>
        {/* A Vietnamese reading of English words, to read only; the job keeps its prompt. */}
        {!isVietnamese(text) && (
          <button type="button" aria-expanded={reading} onClick={() => (setReading(!reading), !reading && tr.translate())}>
            <Icon name="translate" size={12} />
            {reading ? 'Ẩn bản dịch' : 'Dịch'}
          </button>
        )}
        {/* aria-live without role status: the card keeps its own status line (the save-as-template note), found by role. */}
        <span className="sr-only" aria-live="polite">
          {copied === 'ok' ? 'Đã chép mô tả.' : copied === 'failed' ? 'Không sao chép được.' : ''}
        </span>
      </div>
      {reading && (
        <div className="job-translation" role="group" aria-label="Bản dịch tiếng Việt" aria-busy={tr.busy}>
          {tr.busy ? <BusyNote text="Đang dịch sang tiếng Việt…" /> : tr.vi}
          {tr.error && (
            <span role="alert">
              {tr.error}{' '}
              <button type="button" className="link-button" onClick={tr.translate}>
                Thử lại
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Full screen for a result, and out again on a second press. iPhone Safari has no element full screen: a video takes its own player, a picture opens in a new tab. */
export function toggleFullscreen(el: HTMLElement | null): void {
  if (!el) return;
  if (document.fullscreenElement) return void document.exitFullscreen().catch(() => undefined);
  if (el.requestFullscreen) return void el.requestFullscreen().catch(() => undefined);
  const video = el as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
  if (video.webkitEnterFullscreen) return video.webkitEnterFullscreen();
  if (el instanceof HTMLImageElement) window.open(el.src, '_blank', 'noreferrer');
}

export const FormContext = createContext<FormActions | null>(null);
export const useForm = (): FormActions | null => useContext(FormContext);

/** The reuse action (Fash's Recreate): beside a form it refills that form in place and the URL stays; elsewhere (the Library) it opens the page that made it.
 * `from` is the API path the form refills from (lib/reuse.ts), `href` the page link; `onDone` runs after an in-place refill starts; `recipe` as FormActions.recreate. */
export function Recreate({ href, from, className, label, title, onDone, recipe, children }: { href: string; from: string; className?: string; label?: string; title?: string; onDone?: () => void; recipe?: boolean; children: ReactNode }) {
  const form = useForm();
  if (!form)
    return (
      <Link href={href} className={className} aria-label={label} title={title} data-from={from}>
        {children}
      </Link>
    );
  return (
    <button type="button" className={className} aria-label={label} title={title} data-from={from} onClick={() => (form.recreate(from, recipe), onDone?.())}>
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
  /** The whole app's queued and running jobs (counts only); null until the first load. */
  queue: { queued: number; running: number } | null;
  loaded: boolean;
  /** The last read of the list failed (the list, if one was read before, stays as it was); the next poll or refresh tries again. */
  failed: boolean;
  /** The newest finish time among the user's jobs (ms), 0 until one has finished: pages that list results reload when it moves. */
  lastFinished: number;
  toasts: Toast[];
  refresh: () => Promise<void>;
  dismiss: (id: number) => void;
  notify: (text: string) => void;
  /** A note that stays until the call it returns (the work is done): a refill or a picked photo uploading. */
  loading: (text: string) => () => void;
}

const Ctx = createContext<JobsState | null>(null);

export function useJobs(): JobsState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useJobs needs the app shell');
  return v;
}

/** Runs `run` when one of the user's jobs finishes (after the first poll, so what had already finished does not count) or the tab comes back to the front. */
export function useFreshResults(run: () => void): void {
  const { lastFinished, loaded } = useJobs();
  const seen = useRef<number | null>(null);
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    if (!loaded) return;
    if (seen.current !== null && lastFinished > seen.current) latest.current();
    seen.current = lastFinished;
  }, [lastFinished, loaded]);
  useTabReturn(run);
}

/** `page`: the page's name, which leads the tab title (WCAG 2.4.2) before the site's. */
export function JobsProvider({ userId, page, children }: { userId: string; page?: string; children: ReactNode }) {
  const [data, setData] = useState({ jobs: [] as TrayJob[], workerOffline: false, clips: null as JobsState['clips'], queue: null as JobsState['queue'], loaded: false, failed: false, lastFinished: 0 });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [news, setNews] = useState(false);
  const nextId = useRef(0);
  const pathname = usePathname();
  /** Whether the last read found one of the user's jobs in flight, or failed: the poll then comes back in 5 s rather than 30. */
  const inFlight = useRef(false);
  const poll = useRef<ReturnType<typeof pollTray>>(null);

  const load = useCallback(async () => {
    // A read that hangs is given up, so the poll goes on; a failed read is tried again in 5 s, as while a job is in flight.
    const r = await api<{ jobs: TrayJob[]; workerOffline: boolean; clips: { today: number; cap: number }; queue?: JobsState['queue'] }>('/api/jobs?mine', { signal: AbortSignal.timeout?.(20_000) }).catch(() => null);
    if (!r) {
      inFlight.current = true;
      return setData((cur) => (cur.failed ? cur : { ...cur, failed: true }));
    }
    inFlight.current = r.jobs.some((j) => !FINISHED.includes(j.status));
    const finished = r.jobs.filter((j) => FINISHED.includes(j.status) && j.finishedAt);
    const times = finished.map((j) => Date.parse(j.finishedAt!));
    setData({ jobs: r.jobs, workerOffline: r.workerOffline, clips: r.clips, queue: r.queue ?? null, loaded: true, failed: false, lastFinished: Math.max(0, ...times) });
    const seenKey = `${SEEN_KEY}.${userId}`; // per user, so two accounts in one browser do not hide each other's news
    let fresh: TrayJob[];
    try {
      const stored = localStorage.getItem(seenKey);
      if (stored === null) {
        // First visit of this user in this browser: results that already exist are not news.
        localStorage.setItem(seenKey, String(Math.max(0, ...times)));
        return;
      }
      fresh = finished.filter((j) => Date.parse(j.finishedAt!) > Number(stored) && j.error !== CANCELED_ERROR); // a cancel the member made is no news
      if (fresh.length === 0) return;
      localStorage.setItem(seenKey, String(Math.max(...times)));
    } catch {
      return; // storage blocked (a privacy setting, a full quota): no news toasts, but the tray still updates
    }
    setNews(true);
    const done = fresh.map((j) => ({ ok: j.status === 'succeeded', href: resultHref(j), text: j.status === 'succeeded' ? (j.resolution ? 'Ảnh đã xong' : 'Clip đã xong') : `${featureLabel(j.feature)}: một lượt tạo không thành công` }));
    setToasts((cur) => [...cur, ...done.map((n) => ({ id: nextId.current++, ...n }))]);
    announce(done.map((n) => n.text));
  }, [userId]);

  useEffect(() => {
    const p = pollTray(async () => (await load(), inFlight.current));
    poll.current = p;
    const back = () => void p.now(); // the network is back: do not wait for the next poll
    window.addEventListener('online', back);
    return () => {
      p.stop();
      window.removeEventListener('online', back);
    };
  }, [load]);
  // A form that started a job refreshes through the poll, so the new job is watched every 5 s at once; a tab brought back to the front reads at once too.
  const refresh = useCallback(() => poll.current?.now() ?? load(), [load]);
  useTabReturn(() => void refresh());

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
    const base = page ? `${page} · ${BASE_TITLE}` : BASE_TITLE;
    const want = news ? `Đã xong · ${base}` : active > 0 ? `Đang tạo (${active}) · ${base}` : base;
    document.title = want;
    // The layout's metadata title can land after this (Next streams it in after the page): put the page's name back when it does.
    const watch = new MutationObserver(() => document.title === BASE_TITLE && want !== BASE_TITLE && (document.title = want));
    watch.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => watch.disconnect();
  }, [news, active, pathname, page]);

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
    setNews(false);
  }, []);

  // One note at a time: a new note takes the last one's place, and the same note again counts up (×2) instead of stacking over the page.
  const notify = useCallback((text: string) => {
    const id = nextId.current++;
    setToasts((cur) => {
      const last = cur.findLast((t) => t.note && !t.wait);
      const count = last?.text === text ? (last.count ?? 1) + 1 : 1;
      return [...cur.filter((t) => !t.note || t.wait), { id, ok: true, text, note: true, count }];
    });
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), NOTE_MS);
  }, []);

  const loading = useCallback((text: string) => {
    const id = nextId.current++;
    setToasts((cur) => [...cur, { id, ok: true, text, note: true, wait: true }]);
    return () => setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => ({ ...data, toasts, refresh, dismiss, notify, loading }), [data, toasts, refresh, dismiss, notify, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
