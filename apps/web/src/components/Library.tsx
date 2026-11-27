'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { REFRAME_FILLS, REFRAME_RATIOS, type ReframeFill, type ReframeRatio } from '@cvs/core/queue';
import { JOB_APPS } from '@/lib/apps';
import { api, ApiError, type Clip, errorText, sendJson, thumbUrl } from '@/lib/api';
import { APP_SOURCE_CODE, canOfferApp } from '@/lib/custom-apps';
import { downloadCompressed, downloadCompressedVideo, downloadReframedVideo } from '@/lib/compress-download';
import { confirmRerun, usd } from '@/lib/run-guard';
import { FAULTS } from '@/lib/faults';
import { featureLabel } from '@/lib/features';
import { GALLERY_SAMPLES, numberedSamples } from '@/lib/examples';
import { cardTitleOfFormat, HOOKS, LOCATIONS } from '@/lib/marketing';
import { PRODUCT_TYPES } from '@/lib/product-types';
import { activeFilterChips, activeFilters, type ChipKey, dayGroups, filtersFromParams, type LibraryFilters, type LibraryView, libraryQuery, matchesVerdict, mergeFresh, NO_FILTERS, NO_STORE, readView, saveView, type VerdictFilter } from '@/lib/library-view';
import { alignInputs, reuseHref } from '@/lib/reuse';
import { SWIPE_START_PX, swipeStep } from '@/lib/swipe';
import { useMediaQuery } from '@/lib/use-media-query';
import { useSamples } from '@/lib/use-samples';
import { CompareButton } from './CompareItems';
import { CompareSlider } from './CompareSlider';
import { EmptyArt } from './EmptyArt';
import { Icon } from './Icon';
import { uploadImages } from './image-tools';
import { ImageToolButtons } from './ImageToolButtons';
import { ImageViewer, toggleFullscreen, useFreshResults, useJobs } from './jobs';
import { BoardsModal, BoardTools, type LibraryBoards, useLibraryBoards } from './LibraryBoards';
import boardStyles from './LibraryBoards.module.css';
import { LoadError } from './LoadError';
import { Modal } from './Modal';
import { ProductShelf } from './ProductShelf';
import { UndoNotice, type UndoNote } from './UndoNotice';
import { VerdictGuide } from './VerdictGuide';
import { useZipDownload } from './ZipDownload';

const PLACE_KEY = 'cvs.library.place';
const MAX_RESTORE = 240; // ten pages at most, so a long scroll does not turn into a long wait
function readPlace(): { query: string; count: number; y: number } | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(PLACE_KEY) ?? 'null') as { query?: unknown; count?: unknown; y?: unknown } | null;
    return p && typeof p.query === 'string' && typeof p.count === 'number' && typeof p.y === 'number' ? (p as { query: string; count: number; y: number }) : null;
  } catch {
    return null;
  }
}
/** Today in Vietnam as YYYY-MM-DD (or that many days back), the latest day the calendar offers. */
const today = (daysBack = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() - daysBack * 86_400_000));
const fmtShort = (iso: string) => new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));
const fmtTime = (iso: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));
/** The Library filters in the reference order; the id is the `kind` the API takes, except `products`, the shelf, which is not a kind of clip. */
const KINDS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'images', label: 'Tất cả ảnh' },
  { id: 'videos', label: 'Tất cả video' },
  { id: 'try_on', label: 'Thử đồ' },
  { id: 'image', label: 'Tạo ảnh' },
  { id: 'video', label: 'Tạo video' },
  { id: 'marketing', label: 'Marketing Studio' },
  { id: 'marketing_ugc', label: 'UGC Thử đồ' },
  { id: 'marketing_advanced', label: 'Editorial' },
  { id: 'marketing_unboxing', label: 'Mở hộp' },
  { id: 'marketing_review', label: 'Đánh giá sản phẩm' },
  { id: 'apps', label: 'Ứng dụng' },
  { id: 'products', label: 'Sản phẩm' },
];
/** The kind of each app, for the second row of pills under the Apps pill: the id is the app's feature, the `kind` the API takes. */
const APP_KINDS = JOB_APPS.map((a) => ({ id: a.feature, label: a.name }));
/** The size slider: card widths from small to large, remembered per browser. */
const SIZES = ['12rem', '16rem', '22rem'];
/** The grid's columns on a 1440 px desktop at the default size: that first row's pictures load at once, as one of them is the page's LCP (measured 2026-11-21). */
const FIRST_ROW = 4;
const SIZE_KEY = 'cvs.library.size';
/** The Library's phone layout (globals.css), where the filters open in a sheet. */
const PHONE = '(max-width: 639.98px)';
/** What the empty Library calls its items under a kind filter: photos, clips, or both. */
export const emptyNoun = (kind: string) => (['images', 'try_on', 'image'].includes(kind) ? 'ảnh' : kind === 'videos' || kind === 'video' || kind.startsWith('marketing') ? 'clip' : 'kết quả');
/** The size of the picture the detail view loads instead of the original: the one `w` GET /api/assets/:id/thumb serves besides the tile. */
const PREVIEW_W = 1600;
/** What a screen reader calls a card: what was made, with which model, and when (feature · model · local time). */
export const clipLabel = (c: Pick<Clip, 'feature' | 'modelLabel' | 'createdAt'>) => `${featureLabel(c.feature)} · ${c.modelLabel} · ${fmtShort(c.createdAt)}`;
const faultLabel = (id: string | null) => FAULTS.find((f) => f.id === id)?.label ?? id ?? '';

interface StoreOption {
  id: string;
  name: string;
  hidden: boolean;
}

/** Keys that type into a field are not shortcuts, nor are keys pressed in a dialog stacked over the detail view (its nearest dialog is not the lightbox). */
// A focused player keeps its own keys too: ←/→ seek there.
const typing = (t: EventTarget | null) =>
  (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA', 'VIDEO', 'AUDIO'].includes(t.tagName))) || (t instanceof Element && t.closest('dialog')?.classList.contains('lightbox') === false);

/**
 * The card an arrow key moves to from card `from`, given every card's offsetTop in order: Left/Right step one, Home/End jump to the ends, Up/Down keep the column in the row above or below
 * (a shorter row takes its last card). Rows come from the rendered tops because the grid's column count follows the width. Null when the key does nothing here.
 */
export function gridStep(tops: number[], from: number, key: string): number | null {
  const last = tops.length - 1;
  if (from < 0 || from > last) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  if (key === 'ArrowLeft') return Math.max(from - 1, 0);
  if (key === 'ArrowRight') return Math.min(from + 1, last);
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return null;
  const starts = tops.flatMap((t, i) => (i === 0 || t > tops[i - 1]! + 1 ? [i] : []));
  const row = starts.findLastIndex((s) => s <= from);
  const target = row + (key === 'ArrowUp' ? -1 : 1);
  if (target < 0 || target >= starts.length) return null;
  return Math.min(starts[target]! + (from - starts[row]!), (starts[target + 1] ?? tops.length) - 1);
}

/** Moves focus to a card's main target (the open button) and scrolls the card just into view, without animation under reduced motion. */
function focusCard(card: Element | undefined | null) {
  const open = card?.querySelector<HTMLElement>('button[aria-label="Xem chi tiết"]');
  if (!card || !open) return;
  open.focus({ preventScroll: true });
  card.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/**
 * The Pass, featured Pass and Fail marks (Fail asks for the fault) on an item its viewer may edit: the grid card, the list row and the detail view.
 * With `keys` (the detail view) 1, 2 and 3 press Pass, featured Pass and Fail, which then focuses the fault list.
 */
function VerdictMarks({ clip, onChange, keys = false, describedBy }: { clip: Clip; onChange: (c: Clip) => void; keys?: boolean; describedBy?: string }) {
  const [stop, setStop] = useState(0); // the one button of the group that Tab reaches
  const [failing, setFailing] = useState(false);
  const [fault, setFault] = useState('');
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const faultList = useRef<HTMLSelectElement>(null);
  const noun = clip.mediaType === 'image' ? 'ảnh' : 'clip';
  const latest = useRef({ clip, onChange, saving });
  latest.current = { clip, onChange, saving };

  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || !['1', '2', '3'].includes(e.key)) return;
      e.preventDefault();
      if (e.key === '3') setFailing(true);
      else void mark(e.key === '1' ? { verdict: 'pass' } : { verdict: 'pass', featured: true });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [keys]); // mark reads the latest clip through a ref
  useEffect(() => {
    if (failing && keys) faultList.current?.focus();
  }, [failing, keys]);

  // Roving tabindex: Tab enters the group once, the arrow keys move inside it (and do not also step the detail view to the next item).
  const roving = (i: number) => ({ tabIndex: stop === i ? 0 : -1, onFocus: () => setStop(i), 'aria-describedby': describedBy });
  const arrows = (e: ReactKeyboardEvent<HTMLElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    const buttons = [...e.currentTarget.querySelectorAll('button')];
    buttons[(buttons.indexOf(e.target as HTMLButtonElement) + step + buttons.length) % buttons.length]?.focus();
  };

  async function mark(body: { verdict: 'pass'; featured?: boolean } | { verdict: 'fail'; fault: string }) {
    const { clip: now, onChange: changed, saving: busy } = latest.current; // a shortcut's listener outlives the render that added it
    if (busy) return; // a key pressed again before the answer
    setSaving(true);
    setProblem('');
    try {
      const r = await api<{ verdict: NonNullable<Clip['verdict']> }>(`/api/jobs/${now.id}/verdict`, sendJson('PUT', body));
      changed({ ...now, verdict: r.verdict });
      setFailing(false);
      setFault('');
    } catch {
      setProblem('Không lưu được đánh giá.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="actions verdict-marks">
      <span className="verdict-buttons" role="group" aria-label="Chấm điểm" onKeyDown={arrows}>
        <button type="button" {...roving(0)} aria-pressed={clip.verdict?.verdict === 'pass' && !clip.verdict.featured} disabled={saving} onClick={() => void mark({ verdict: 'pass' })}>
          Đạt
        </button>
        {/* A Pass worth showing the whole company: Explore model cards show these first. */}
        <button type="button" {...roving(1)} aria-pressed={clip.verdict?.featured === true} disabled={saving} title={`Đạt và đẹp, nên làm mẫu: ${noun} nổi bật hiện trước trên thẻ mô hình ở Khám phá`} onClick={() => void mark({ verdict: 'pass', featured: true })}>
          Nổi bật
        </button>
        <button type="button" {...roving(2)} aria-pressed={failing || clip.verdict?.verdict === 'fail'} disabled={saving} onClick={() => setFailing((f) => !f)}>
          Không<span className="verdict-more"> đạt</span>
        </button>
      </span>
      {failing && (
        <>
          <label>
            Lỗi gặp phải
            <select ref={faultList} value={fault} onChange={(e) => setFault(e.target.value)}>
              <option value="">Chọn lỗi</option>
              {FAULTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={saving || !fault} onClick={() => void mark({ verdict: 'fail', fault })}>
            Xác nhận không đạt
          </button>
        </>
      )}
      {problem && <p className="error">{problem}</p>}
    </div>
  );
}

/** An item's mark in a few words, for its badge: Pass, featured, or Fail with the fault. */
const verdictText = (v: Clip['verdict']) => v && (v.verdict === 'fail' ? `Không đạt · ${faultLabel(v.fault)}` : v.featured ? 'Nổi bật' : 'Đạt');
const verdictClass = (v: NonNullable<Clip['verdict']>) => (v.verdict === 'fail' ? ' fail' : v.featured ? ' featured' : '');

/**
 * A grid card puts the result first: its type and length on the media, the mark in its corner, the actions over it on hover (always on touch), two short lines under it and the marks for whoever may edit; Reuse and the store live in the detail view. A `list` row keeps the clip actions and the marks.
 * On both, the picture opens the detail (`onOpen`); while `selecting`, the page makes that click pick the item instead (owner, 2026-11-18), and the checkbox in the picture's corner stays the control a keyboard or screen reader uses.
 */
export function ClipCard({ clip, view, index, lead = false, select, selecting = false, onChange, onDeleted, onOpen }: { clip: Clip; view: LibraryView; index?: number; lead?: boolean; select?: ReactNode; selecting?: boolean; onChange: (c: Clip) => void; onDeleted: (id: string) => void; onOpen: () => void }) {
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const image = clip.mediaType === 'image';
  const noun = image ? 'ảnh' : 'clip';
  const mark = verdictText(clip.verdict);
  const video = useRef<HTMLVideoElement>(null);
  const labelId = useId();
  const about = { 'aria-describedby': labelId }; // each action says which item it acts on

  async function remove() {
    setProblem('');
    setSaving(true);
    try {
      await api(`/api/jobs/${clip.id}`, { method: 'DELETE' });
      onDeleted(clip.id);
    } catch (e) {
      setProblem(e instanceof ApiError && e.code === APP_SOURCE_CODE ? e.message : `Không xoá được ${noun}.`); // the 409 names the app that needs the clip
    } finally {
      setSaving(false);
    }
  }

  async function toggleFavorite() {
    setProblem('');
    setSaving(true); // a second click before the answer would send the same value again
    try {
      const r = await api<{ favorite: boolean }>(`/api/jobs/${clip.id}/favorite`, sendJson('PUT', { favorite: !clip.favorite }));
      onChange({ ...clip, favorite: r.favorite });
    } catch {
      setProblem('Không lưu được mục yêu thích.');
    } finally {
      setSaving(false);
    }
  }

  async function download() {
    setProblem('');
    try {
      const r = await api<{ downloadUrl: string }>(`/api/assets/${clip.videoAssetId}`);
      const a = document.createElement('a');
      a.href = r.downloadUrl;
      a.download = clip.downloadName;
      document.body.append(a);
      a.click();
      a.remove();
    } catch (e) {
      setProblem(errorText(e, 'Không tải xuống được.'));
    }
  }

  const name = clipLabel(clip);
  const opener = selecting ? { tabIndex: -1, 'aria-hidden': true } : { 'aria-label': 'Xem chi tiết', title: 'Xem chi tiết', ...about };
  // Hidden but still readable as a description, so a screen reader reads each action with its item once, not as card text too.
  const labelled = (
    <span id={labelId} hidden>
      {name}
    </span>
  );

  if (view === 'list') {
    const thumb = clip.posterAssetId ?? (image ? clip.videoAssetId : null); // an image's preview, else the image itself
    const prompt = clip.prompt?.replaceAll('**', ''); // Markdown bold pasted into a prompt reads as plain words here and in the detail's Mô tả; Copy and the sent prompt keep it
    return (
      <article className="lib-row" aria-label={name} data-clip-id={clip.id}>
        {labelled}
        {/* The picture opens the detail, as the grid card's does; the checkbox sits in its corner. */}
        <span className="lib-thumb">
          {thumb ? <img src={thumbUrl(thumb)} alt="" loading="lazy" decoding="async" /> : <video preload="metadata" muted playsInline src={`/api/assets/${clip.videoAssetId}/content`} />}
          <button type="button" className="lib-open" onClick={onOpen} {...opener} />
          {select}
          {!image && <span className="lib-thumb-len" aria-hidden="true">{Math.round(clip.lengthSec ?? clip.durationSec)}s</span>}
        </span>
        <div className="lib-row-main">
          <p className="lib-row-title">
            {clip.modelLabel}
            {clip.feature !== 'video' && clip.prompt && <span className="tag feature-tag">{featureLabel(clip.feature)}</span>}
            {clip.isMock && <span className="badge">MOCK</span>}
            {clip.example && <span className="tag">Ví dụ</span>}
            {mark && <span className={`lib-mark${verdictClass(clip.verdict!)}`}>{mark}</span>}
          </p>
          <p className={prompt ? 'lib-row-prompt' : 'lib-row-prompt none'} title={prompt}>
            {prompt ?? featureLabel(clip.feature)}
          </p>
          <p className="lib-row-meta">
            {clip.creator.name}
            {clip.creator.system && <span className="tag">Hệ thống</span>} · {clip.storeName && `${clip.storeName} · `}{fmtTime(clip.createdAt)} · {clip.ratio} · {image ? clip.resolution : `${clip.lengthSec ?? clip.durationSec} giây`}
          </p>
        </div>
        <div className="actions">
          <button type="button" className="favorite icon-button" aria-pressed={clip.favorite} disabled={saving} onClick={() => void toggleFavorite()} aria-label="Yêu thích" title="Yêu thích" {...about}>
            <Icon name="star" />
          </button>
          <button type="button" className="icon-button" onClick={() => void download()} aria-label="Tải xuống" title="Tải xuống" {...about}>
            <Icon name="download" />
          </button>
          {clip.canEdit && (
            <button type="button" className="danger icon-button" disabled={saving} onClick={() => void remove()} aria-label="Xoá" title="Xoá" {...about}>
              <Icon name="x" />
            </button>
          )}
        </div>
        {clip.canEdit && <VerdictMarks clip={clip} onChange={onChange} describedBy={labelId} />}
        {problem && <p className="error">{problem}</p>}
      </article>
    );
  }

  const tools = (
    <div className="lib-tools">
      <button type="button" className="favorite icon-button" aria-pressed={clip.favorite} disabled={saving} onClick={() => void toggleFavorite()} aria-label="Yêu thích" title="Yêu thích" {...about}>
        <Icon name="star" />
      </button>
      <button type="button" className="icon-button" onClick={() => void download()} aria-label="Tải xuống" title="Tải xuống" {...about}>
        <Icon name="download" />
      </button>
      {clip.canEdit && (
        <button type="button" className="danger icon-button" disabled={saving} onClick={() => void remove()} aria-label="Xoá" title="Xoá" {...about}>
          <Icon name="x" />
        </button>
      )}
    </div>
  );
  // A video loads nothing (its poster stands in) until a mouse rests on it or it takes focus, then plays muted, so the grid can be skimmed without opening each item.
  const play = (on: boolean) => {
    const v = video.current;
    if (v) on ? void v.play().catch(() => undefined) : v.pause();
  };
  return (
    <article className="card lib-card" aria-label={name} data-clip-id={clip.id}>
      {labelled}
      {select}
      <div className="lib-media" onPointerEnter={(e) => e.pointerType === 'mouse' && play(true)} onPointerLeave={() => play(false)} onFocus={() => play(true)} onBlur={() => play(false)}>
        {image ? (
          <img
            className="output"
            src={thumbUrl(clip.posterAssetId ?? clip.videoAssetId)}
            alt={clip.downloadName}
            loading={index !== undefined && index < FIRST_ROW ? undefined : 'lazy'}
            fetchPriority={lead ? 'high' : undefined}
            decoding="async"
          />
        ) : (
          <video ref={video} muted loop playsInline preload={clip.posterAssetId ? 'none' : 'metadata'} poster={clip.posterAssetId ? thumbUrl(clip.posterAssetId) : undefined} src={`/api/assets/${clip.videoAssetId}/content`} />
        )}
        {/* Over the media rather than around it, so the picture keeps its own name for screen readers. */}
        <button type="button" className="lib-open" onClick={onOpen} {...opener} />
        <span className="lib-chips">
          {clip.feature !== 'video' && <span className="lib-chip">{featureLabel(clip.feature)}</span>}
          {!image && <span className="lib-chip">{clip.lengthSec ?? clip.durationSec}s</span>}
          {clip.isMock && <span className="badge">MOCK</span>}
          {clip.example && <span className="lib-chip">Ví dụ</span>}
        </span>
        {mark && (
          <span className={`lib-verdict${verdictClass(clip.verdict!)}`} title={`Kết quả: ${mark}`}>
            {mark}
          </span>
        )}
        {tools}
      </div>
      <div className="lib-info">
        <p className="lib-title" title={clip.modelLabel}>{clip.modelLabel}</p>
        <p className="lib-meta">
          {/* One line on a wide card: a long name is cut, never the time or the cost, so the marks below line up across a row.
              The phone's two columns put the name on its own line (globals.css), so its leading dot is drawn by CSS. */}
          <span className="lib-who" title={clip.storeName ? `${clip.creator.name} · ${clip.storeName}` : clip.creator.name}>
            {clip.creator.name}
            {clip.storeName && ` · ${clip.storeName}`}
          </span>
          {clip.creator.system && <span className="tag">Hệ thống</span>}
          <span className="lib-when">
            {fmtShort(clip.createdAt)}
            {clip.costUsd !== null && ' ·'}
          </span>
          {clip.costUsd !== null && (
            <span title={clip.costFinal ? 'Chi phí thật' : 'Chi phí thật, tạm tính'}>
              {usd(clip.costUsd)}
              {!clip.costFinal && '*'}
            </span>
          )}
        </p>
      </div>
      {clip.canEdit && <VerdictMarks clip={clip} onChange={onChange} describedBy={labelId} />}
      {problem && <p className="error">{problem}</p>}
    </article>
  );
}

/** What the detail view reads from GET /api/jobs/:id beyond the Library row: the recipe behind the result. */
interface ClipInputs {
  prompt: string | null;
  presetId: string | null;
  enhance: boolean | null;
  enhancedPrompt: string | null;
  audio: string | null;
  brief: string | null;
  script: string | null;
  hookText: string | null;
  ending: string | null;
  endText: string | null;
  format: string | null;
  hook: string | null;
  location: string | null;
  images: { id: string; filename: string }[];
  /** The job's input ids in the order sent, a deleted one's too (alignInputs). */
  inputIds: string[];
  brand: boolean;
}
const NO_INPUTS: ClipInputs = { prompt: null, presetId: null, enhance: null, enhancedPrompt: null, audio: null, brief: null, script: null, hookText: null, ending: null, endText: null, format: null, hook: null, location: null, images: [], inputIds: [], brand: false };

/** The preset and image style names, read once per page load for the detail view's template row; a failed read is tried again next time. */
let presetNames: Promise<Map<string, string> | null> | null = null;
const loadPresetNames = () =>
  (presetNames ??= Promise.all(['video', 'image'].map((f) => api<{ presets: { id: string; label: string }[] }>(`/api/presets?feature=${f}`))).then(
    (r) => new Map(r.flatMap((l) => l.presets).map((p) => [p.id, p.label])),
    () => ((presetNames = null), null),
  ));
/** A Marketing choice's name; a member's own hook or location shows as their own. */
const choiceName = (list: { id: string; name: string }[], id: string | null) => id && (list.find((c) => c.id === id)?.name ?? 'Tự tạo');

// shortcut: "long" counts characters and lines instead of measuring the drawn text, so a text near the limit may get the show-more button without needing it.
const LONG_TEXT = 220;
/** A text of the recipe: a long one (a Marketing brief) shows its first lines and a show-more button, so the rest of the recipe is not a long scroll away. */
export function RecipeText({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > LONG_TEXT || text.split('\n').length > 4;
  return (
    <div className="recipe-text">
      <h3>{label}</h3>
      <p data-clamped={long && !open ? '' : undefined}>{text}</p>
      {long && (
        <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Thu gọn' : 'Xem thêm'}
        </button>
      )}
    </div>
  );
}

/**
 * The picture repeated tile × tile in a box of its own shape, so no tile is stretched and the edges that meet can be judged. The shape is the picture's
 * own, read once it loads (an 'auto' job, or a model that rounds the size, does not match the ratio asked); until then the asked ratio, else square.
 */
export function RepeatTiles({ src, label, tile, ratio }: { src: string; label: string; tile: number; ratio: string }) {
  const [natural, setNatural] = useState<number | null>(null);
  useEffect(() => {
    const im = new Image();
    im.onload = () => setNatural(im.naturalWidth / im.naturalHeight);
    im.src = src;
    return () => void (im.onload = null);
  }, [src]);
  const [w, h] = ratio.split(':').map(Number);
  const aspect = natural ?? (w! > 0 && h! > 0 ? w! / h! : 1);
  return (
    <div className="lightbox-tile-box">
      <div
        className="lightbox-tile"
        role="img"
        aria-label={`${label}, lặp ${tile}×${tile}`}
        style={{ aspectRatio: aspect, width: `min(100cqw, calc(100cqh * ${aspect}))`, backgroundImage: `url(${src})`, backgroundSize: `calc(100% / ${tile}) calc(100% / ${tile})` }}
      />
    </div>
  );
}

/**
 * Fash's item detail (survey L3), grown into the recipe of the result: the result large on the left; beside it the title and mark, the words behind it
 * (the creator's prompt, or Marketing's brief and script, the enhanced prompt and the prompt the model got), the inputs, the model, template and
 * settings, who made it, when and for how much, the store for an Admin, download / fullscreen / open in a new tab / copy, the marks and Reuse.
 * Arrows and ←/→ step through the loaded items; 1, 2 and 3 mark.
 */
export function ClipDetail({ clips, index, stores, admin, boards, makeApp = false, onIndex, onChange, onUse }: { clips: Clip[]; index: number; stores?: StoreOption[]; admin: boolean; boards?: LibraryBoards; makeApp?: boolean; onIndex: (i: number | null) => void; onChange: (c: Clip) => void; onUse?: (c: Clip) => void }) {
  const clip = clips[index]!;
  const image = clip.mediaType === 'image';
  const [job, setJob] = useState<ClipInputs | null>(null);
  const [presets, setPresets] = useState<Map<string, string> | null>(null); // null until read, or when the read failed
  const [note, setNote] = useState('');
  const [comparing, setComparing] = useState(false);
  const [boardsFor, setBoardsFor] = useState<string | null>(null); // the item whose boards dialog is open; it belongs to that item, so stepping to another closes it
  const [rerunning, setRerunning] = useState(false);
  const [shown, setShown] = useState<{ id: string; filename: string } | null>(null); // an input photo shown large in the result's place, instead of a new tab
  const [full, setFull] = useState<string | null>(null); // the picture in ImageViewer at its own size (the box shows a 1600 px preview)
  const [tile, setTile] = useState(1); // Xem lặp: the picture tiled tile × tile, to check that an all-over print's edges meet; kept while stepping, as the size slider is
  const media = useRef<HTMLVideoElement & HTMLImageElement>(null);
  const side = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const inputs = useRef<HTMLUListElement>(null); // Về kết quả puts focus back on the photo it showed, not on the page
  // A swipe on a touch screen steps to the neighbour like the arrows: the media follows the finger, then opens it or snaps back.
  const box = useRef<HTMLDivElement>(null);
  const fingers = useRef(new Set<number>());
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const slide = (dx: number, animate = false) => {
    if (!box.current) return;
    box.current.style.transition = animate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'transform .15s' : 'none';
    box.current.style.transform = dx ? `translateX(${dx}px)` : '';
  };
  const content = (id: string) => `/api/assets/${id}/content`;
  const resultSrc = thumbUrl(clip.videoAssetId, PREVIEW_W);
  useEffect(() => {
    setJob(null);
    setNote('');
    setComparing(false);
    setBoardsFor(null);
    setShown(null);
    api<ClipInputs>(`/api/jobs/${clip.id}`).then(setJob, () => setJob(NO_INPUTS));
  }, [clip.id]);
  useEffect(() => void loadPresetNames().then(setPresets), []);
  // The pinned footer's height (a note or the fault picker can grow it) is the scroll margin of the side's other controls (--lightbox-foot-h in globals.css), so one the keyboard reaches scrolls clear of it.
  useEffect(() => {
    const el = foot.current;
    if (!el) return;
    const watch = new ResizeObserver(() => side.current?.style.setProperty('--lightbox-foot-h', `${el.offsetHeight}px`));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  // The grid holds small thumbnails only, so the image neighbours' large previews are fetched ahead and an arrow or a swipe shows them at once.
  useEffect(() => {
    for (const n of [clips[index - 1], clips[index + 1]]) if (n?.mediaType === 'image') new Image().src = thumbUrl(n.videoAssetId, PREVIEW_W);
  }, [clips, index]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (full || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return; // the viewer over the item keeps it
      const next = index + (e.key === 'ArrowLeft' ? -1 : 1);
      if (next < 0 || next >= clips.length) return;
      e.preventDefault();
      onIndex(next);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, clips.length, onIndex, full]);

  // The creator's own words: a free prompt on Create video and Image Generation (a brief with an image style); Marketing keeps a brief and a script; the other features compose theirs.
  const own = job && ((clip.feature === 'video' || clip.feature === 'image') && !job.presetId ? job.prompt : null);
  const sent = job?.prompt && job.prompt !== own ? job.prompt : null; // what the model got, when it is not the creator's words as typed
  const title = clip.feature === 'marketing' ? cardTitleOfFormat(job?.format) : featureLabel(clip.feature);
  const copyText = own ?? job?.brief ?? job?.prompt ?? null;
  const mark = verdictText(clip.verdict);
  // Try On's first input is the person: the original the result is compared with (none once it is deleted).
  const original = clip.feature === 'try_on' && image && job ? alignInputs(job.inputIds, job.images)[0] : undefined;

  async function act(what: () => Promise<unknown>, fail: string) {
    setNote('');
    try {
      await what();
    } catch (e) {
      setNote(errorText(e, fail));
    }
  }
  const download = () =>
    act(async () => {
      const a = document.createElement('a');
      a.href = (await api<{ downloadUrl: string }>(`/api/assets/${clip.videoAssetId}`)).downloadUrl;
      a.download = clip.downloadName;
      document.body.append(a);
      a.click();
      a.remove();
    }, 'Không tải xuống được.');
  const [compressing, setCompressing] = useState(false);
  const compress = async () => {
    setCompressing(true);
    await act(async () => {
      if (image) {
        if (!(await downloadCompressed(clip.videoAssetId, clip.downloadName))) setNote('Bản nén không nhẹ hơn nên đã tải ảnh gốc.');
        return;
      }
      setNote('Đang nén video, vui lòng chờ…');
      setNote((await downloadCompressedVideo(clip.videoAssetId, clip.downloadName)) ? '' : 'Bản nén không nhẹ hơn nên đã tải video gốc.');
    }, 'Không nén và tải xuống được.');
    setCompressing(false);
  };
  // Tải theo tỉ lệ khác: the video in a 9:16, 4:5 or 1:1 frame over a blurred copy of itself or black, made by the worker for free, then downloaded as Compress does.
  const [frame, setFrame] = useState<{ ratio: ReframeRatio; fill: ReframeFill }>({ ratio: '9:16', fill: 'blur' });
  const [reframing, setReframing] = useState(false);
  const frameLabel = useId();
  const reframe = async () => {
    setReframing(true);
    await act(async () => {
      setNote('Đang đổi khung video, vui lòng chờ…');
      await downloadReframedVideo(clip.videoAssetId, frame.ratio, frame.fill, clip.downloadName);
      setNote('');
    }, 'Không đổi khung và tải xuống được.');
    setReframing(false);
  };
  // A new paid job with the same inputs, after the same confirm as a Run; the server applies the caps and the ledger as for any other.
  const rerun = async () => {
    setRerunning(true); // from the click on, so a double click cannot send two paid jobs
    await act(async () => {
      if (await confirmRerun(clip.costUsd, (usd) => (usd ? `Chạy lại với giá khoảng $${usd}?` : 'Chạy lại?'), (maxUsd) => api('/api/jobs', sendJson('POST', { rerunOf: clip.id, maxUsd })))) {
        setNote('Đã gửi lượt chạy lại. Theo dõi trong Lịch sử của ứng dụng.');
        void refresh(); // the tray watches the new job at once
      }
    }, 'Không chạy lại được.');
    setRerunning(false);
  };
  const copy = () => act(async () => (await navigator.clipboard.writeText(copyText ?? ''), setNote('Đã sao chép.')), 'Không sao chép được.');
  // Fash's "Use this frame": the video stops on the frame shown, which goes up as a photo and opens Create video as its first image.
  const router = useRouter();
  const { notify, refresh } = useJobs();
  const [grabbing, setGrabbing] = useState(false);
  const takeFrame = async () => {
    const v = media.current;
    if (!v) return;
    v.pause();
    setGrabbing(true);
    await act(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      canvas.getContext('2d')!.drawImage(v, 0, 0);
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.92));
      if (!blob) throw new Error('no frame'); // a video not decoded yet draws nothing
      const [frame] = await uploadImages([new File([blob], `${clip.downloadName.replace(/\.\w+$/, '')}-${v.currentTime.toFixed(1)}s.jpg`, { type: 'image/jpeg' })]);
      notify('Đã tải khung hình lên, đang mở Tạo video'); // the page changes under the member: say why
      router.push(`/create?image=${frame!.id}`);
    }, 'Không lấy được khung hình này.');
    setGrabbing(false);
  };
  const reassign = (storeId: string) =>
    act(async () => {
      await api(`/api/admin/jobs/${clip.id}/store`, sendJson('PUT', { storeId: storeId || null }));
      onChange({ ...clip, storeId: storeId || null });
    }, 'Không đổi được cửa hàng.');

  const words = (label: string, text: string | null | undefined) => text && <RecipeText key={`${clip.id}-${label}`} label={label} text={text} />; // the next item starts collapsed
  const row = (label: string, value: string | null | undefined) =>
    value && (
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    );

  return (
    <Modal open onClose={() => onIndex(null)} label={`Chi tiết: ${title}`} className="lightbox">
      <div
        ref={box}
        className="lightbox-media"
        onPointerDown={(e) => {
          fingers.current.add(e.pointerId);
          swipe.current = null;
          if (fingers.current.size > 1) return slide(0); // a second finger is a pinch, not a swipe
          // The native video controls sit in the bottom strip and keep their own drags.
          const over = e.target instanceof HTMLVideoElement && e.clientY > e.target.getBoundingClientRect().bottom - 56;
          if (e.pointerType !== 'mouse' && !comparing && !over) swipe.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        }}
        onPointerMove={(e) => {
          const s = swipe.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (Math.abs(e.clientY - s.y) > Math.abs(dx) && Math.abs(e.clientY - s.y) >= SWIPE_START_PX) {
            swipe.current = null; // a vertical scroll
            slide(0, true);
          } else if (Math.abs(dx) >= SWIPE_START_PX) slide(dx);
        }}
        onPointerUp={(e) => {
          fingers.current.delete(e.pointerId);
          const s = swipe.current;
          swipe.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          const step = Math.abs(e.clientY - s.y) > Math.abs(dx) ? 0 : swipeStep(dx, e.timeStamp - s.t, e.currentTarget.clientWidth);
          if (step && index + step >= 0 && index + step < clips.length) {
            slide(0);
            onIndex(index + step);
          } else slide(0, true);
        }}
        onPointerCancel={(e) => {
          fingers.current.delete(e.pointerId);
          swipe.current = null;
          slide(0, true);
        }}
      >
        {shown ? (
          <>
            <img ref={media} src={thumbUrl(shown.id, PREVIEW_W)} alt={`Ảnh đầu vào ${shown.filename}`} />
            <button type="button" className="lightbox-back" onClick={() => (inputs.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus(), setShown(null))}>
              <Icon name="left" />
              Về kết quả
            </button>
          </>
        ) : comparing && original ? (
          <CompareSlider before={content(original.id)} after={content(clip.videoAssetId)} beforeAlt={`Ảnh gốc ${original.filename}`} afterAlt={clip.downloadName} />
        ) : image && tile > 1 ? (
          <RepeatTiles src={resultSrc} label={clip.downloadName} tile={tile} ratio={clip.ratio} />
        ) : image ? (
          <img ref={media} src={resultSrc} alt={clip.downloadName} />
        ) : (
          <>
            {/* The player's controls are six Tab stops before the side; this first stop, shown on focus, goes past them. */}
            <button type="button" className="lightbox-skip" onClick={() => side.current?.querySelector<HTMLElement>('a[href], button:not(:disabled), select, summary')?.focus()}>
              Bỏ qua video
            </button>
            <video key={clip.id} ref={media} controls autoPlay muted loop playsInline poster={clip.posterAssetId ? thumbUrl(clip.posterAssetId) : undefined} src={content(clip.videoAssetId)} />
          </>
        )}
      </div>
      <div ref={side} className="lightbox-side">
        <h2>
          {title}
          {mark && <span className={`lib-mark${verdictClass(clip.verdict!)}`}>{mark}</span>}
        </h2>
        {image && (
          <div className="repeat-preview">
            <span aria-hidden="true">Xem lặp</span>
            <div className="segmented preset-chips" role="group" aria-label="Xem lặp">
              {[1, 2, 3].map((n) => (
                <button key={n} type="button" aria-pressed={tile === n} onClick={() => setTile(n)}>
                  {n === 1 ? 'Tắt' : `${n}×${n}`}
                </button>
              ))}
            </div>
          </div>
        )}
        {words('Hook tự viết', job?.hookText)}
        {words('Mô tả', (own ?? job?.brief)?.replaceAll('**', ''))}
        {words('Lời thoại', job?.script)}
        {words('Cảnh kết', job?.ending)}
        {words('Chữ trên khung cuối', job?.endText)}
        {job?.enhance && words('Prompt sau khi AI cải thiện', job.enhancedPrompt)}
        {sent && (
          <details className="recipe-sent">
            <summary>Prompt gửi cho mô hình</summary>
            <p>{sent}</p>
          </details>
        )}
        {job && job.images.length > 0 && clip.feature !== 'motion_control' && (
          <div className="recipe-text">
            <h3>Ảnh đầu vào</h3>
            <ul ref={inputs} className="job-inputs" aria-label="Ảnh đầu vào">
              {job.images.map((i) => (
                <li key={i.id}>
                  <button type="button" className="tap" aria-pressed={shown?.id === i.id} title="Xem lớn ảnh này" onClick={() => (setComparing(false), setShown(shown?.id === i.id ? null : i))}>
                    <img src={thumbUrl(i.id)} alt={i.filename} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <dl className="recipe" aria-label="Cách tạo">
          {row('Mô hình', clip.modelLabel)}
          {row(clip.feature === 'image' ? 'Phong cách' : 'Mẫu chuyển động', job?.presetId && presets && (presets.get(job.presetId) ?? 'Đã xoá'))}
          {row('Hook', choiceName(HOOKS, job?.hook ?? null))}
          {row('Bối cảnh', choiceName(LOCATIONS, job?.location ?? null))}
          {row('Tỉ lệ', clip.ratio)}
          {row(image ? 'Độ phân giải' : 'Thời lượng', image ? clip.resolution : `${clip.durationSec} giây`)}
          {row('Âm thanh', job?.audio === 'on' ? 'Có' : job?.audio === 'off' ? 'Không' : null)}
          {row('AI cải thiện', job?.enhance ? 'Có' : null)}
          {row('Người tạo', `${clip.creator.name} · ${fmtTime(clip.createdAt)}`)}
          {!stores && row('Cửa hàng', clip.storeName)}
          {row('Chi phí thật', clip.costUsd === null ? null : `$${clip.costUsd}${clip.costFinal ? '' : ' (tạm tính)'}`)}
        </dl>
        {stores && (
          <label className="recipe-store">
            Cửa hàng
            <select value={clip.storeId ?? ''} onChange={(e) => void reassign(e.target.value)}>
              <option value="">Không gắn cửa hàng</option>
              {stores
                .filter((s) => !s.hidden || s.id === clip.storeId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="job-actions">
          {/* Download and Use this frame carry their words: the bare glyphs read alike (compress, fullscreen). */}
          <button type="button" className="icon-button labelled" onClick={() => void download()} title="Tải xuống">
            <Icon name="download" />
            Tải xuống
          </button>
          {boards && (
            <>
              <button type="button" className={`icon-button labelled ${boardStyles.boardsButton}`} aria-haspopup="dialog" onClick={() => setBoardsFor(clip.id)}>
                <Icon name="library" />
                {`Bảng${clip.boardIds?.length ? ` (${clip.boardIds.length})` : ''}`}
              </button>
              <BoardsModal open={boardsFor === clip.id} onClose={() => setBoardsFor(null)} ids={[clip.id]} clips={[clip]} boards={boards} onChange={onChange} />
            </>
          )}
          <button type="button" className="icon-button" disabled={compressing} aria-busy={compressing} onClick={() => void compress()} aria-label="Nén & tải về" title="Nén & tải về">
            <Icon name="compress" />
          </button>
          <button type="button" className="icon-button" onClick={() => (media.current instanceof HTMLVideoElement ? toggleFullscreen(media.current) : setFull(shown?.id ?? clip.videoAssetId))} aria-label="Toàn màn hình" title="Toàn màn hình">
            <Icon name="expand" />
          </button>
          {/* The file itself: its own size and a link to copy (Fash keeps it beside download). */}
          <a className="icon-button" href={content(clip.videoAssetId)} target="_blank" rel="noreferrer" aria-label="Mở bản gốc trong tab mới" title="Mở bản gốc trong tab mới">
            <Icon name="external" />
          </a>
          {copyText && (
            <button type="button" className="icon-button" onClick={() => void copy()} aria-label="Sao chép mô tả" title="Sao chép mô tả">
              <Icon name="copy" />
            </button>
          )}
          {!image && !shown && (
            <button type="button" className="icon-button labelled" disabled={grabbing} aria-busy={grabbing} onClick={() => void takeFrame()} title="Dùng khung hình này làm ảnh cho Tạo video">
              <Icon name="image" />
              Dùng khung hình
            </button>
          )}
          {original && (
            <button type="button" className="icon-button" aria-pressed={comparing} onClick={() => (setShown(null), setComparing(!comparing))} aria-label="So sánh trước/sau" title="So sánh trước/sau">
              <Icon name="panel" />
            </button>
          )}
        </div>
        {!image && (
          <div className="reframe" role="group" aria-labelledby={frameLabel}>
            <span id={frameLabel}>Tải theo tỉ lệ khác</span>
            <div className="segmented" role="group" aria-label="Tỉ lệ khung">
              {REFRAME_RATIOS.map((ratio) => (
                <button key={ratio} type="button" aria-pressed={frame.ratio === ratio} onClick={() => setFrame({ ...frame, ratio })}>
                  {ratio}
                </button>
              ))}
            </div>
            <div className="segmented" role="group" aria-label="Nền">
              {REFRAME_FILLS.map((fill) => (
                <button key={fill} type="button" aria-pressed={frame.fill === fill} onClick={() => setFrame({ ...frame, fill })}>
                  {fill === 'blur' ? 'Nền mờ' : 'Nền đen'}
                </button>
              ))}
            </div>
            <button type="button" className="icon-button labelled" disabled={reframing} aria-busy={reframing} onClick={() => void reframe()} title="Tải về theo tỉ lệ đã chọn">
              <Icon name="download" />
              Tải về
            </button>
          </div>
        )}
        {admin && <ExampleControl key={`example-${clip.id}`} clip={clip} onChange={onChange} />}
        {makeApp && job && <MakeAppLink clip={clip} job={{ inputCount: job.inputIds.length, presetId: job.presetId, brand: job.brand }} />}
        {clip.canEdit && <p className="recipe-keys">Phím tắt: 1 Đạt · 2 Nổi bật · 3 Không đạt · ←/→ mục trước, sau</p>}
        {/* As on a History card, on any member's picture: the copy is the viewer's own new input (POST /api/assets/copy takes a Library clip of the workspace). */}
        {image && (
          <div className="lightbox-tools">
            <ImageToolButtons assetId={clip.videoAssetId} feature={clip.feature} className="lightbox-result" act={act} />
          </div>
        )}
        {/* Pinned under the recipe, which scrolls (a Marketing brief ran 1164 px in a 760 px dialog): the last action's note, the marks and Reuse. */}
        <div ref={foot} className="lightbox-foot">
          {note && (
            <p className="muted" role="status">
              {note}
            </p>
          )}
          {clip.canEdit && <VerdictMarks key={clip.id} clip={clip} onChange={onChange} keys />}
          {reuseHref(clip) && (
            <div className="lightbox-foot-actions">
              {/* A new paid job: the quieter button, its price on it, beside Reuse. */}
              {clip.mine && (
                <button type="button" className="lightbox-reuse lightbox-rerun" disabled={rerunning} onClick={() => void rerun()}>
                  Chạy lại{clip.costUsd !== null && ` · $${clip.costUsd}`}
                </button>
              )}
              {onUse ? (
                <button type="button" className="lightbox-reuse" onClick={() => onUse(clip)}>
                  Dùng lại
                </button>
              ) : (
                <Link href={reuseHref(clip)!} className="lightbox-reuse">
                  Dùng lại
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
      {index > 0 && (
        <button type="button" className="lightbox-step lightbox-prev" onClick={() => onIndex(index - 1)} aria-label="Mục trước">
          <Icon name="left" size={20} />
        </button>
      )}
      {index < clips.length - 1 && (
        <button type="button" className="lightbox-step lightbox-next" onClick={() => onIndex(index + 1)} aria-label="Mục tiếp theo">
          <Icon name="right" size={20} />
        </button>
      )}
      {full && <ImageViewer src={content(full)} alt={shown ? `Ảnh đầu vào ${shown.filename}` : clip.downloadName} placeholder={thumbUrl(full, PREVIEW_W)} onClose={() => setFull(null)} />}
    </Modal>
  );
}

/** An Admin's way from a Library result to the app editor (docs/WORKSPACES.md §2). Shown only when the result can become an app; the server still decides. */
export function MakeAppLink({ clip, job }: { clip: Clip; job: { inputCount: number; presetId: string | null; brand: boolean } }) {
  if (!canOfferApp(clip.feature, job)) return null;
  return (
    <p>
      <Link href={`/admin/apps/new?job=${clip.id}`} className="button">
        Biến thành ứng dụng
      </Link>
    </p>
  );
}

/** A result already on an Examples tab, as GET /api/jobs/[id]/example lists it: `match` says why it may repeat the one being checked. */
interface ExampleRow {
  id: string;
  videoAssetId: string;
  posterAssetId: string | null;
  ratio: string;
  modelLabel: string;
  match: 'inputs' | 'prompt' | null;
}
const MATCH_TEXT = { inputs: 'Cùng ảnh đầu vào', prompt: 'Cùng mô tả' } as const;

/**
 * An Admin's "Chọn làm ví dụ mẫu" on a result of a page whose Examples tab shows company results (owner, 2026-11-09: a featured mark only suggests one).
 * It sits in its own panel that says where the result will show; a featured result not yet there gets a stronger panel and the primary button.
 * It first shows what that tab already has, the results that may repeat this one on top and then the fixed samples, so a near copy is seen before it goes up.
 * The Admin may tag it with the product it shows, which the tab filters by, and change that tag once it is there.
 */
function ExampleControl({ clip, onChange }: { clip: Clip; onChange: (c: Clip) => void }) {
  const have = useSamples();
  const [check, setCheck] = useState<ExampleRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [type, setType] = useState(''); // the product type it goes up with
  const prefix = GALLERY_SAMPLES[clip.feature];
  if (!prefix) return null;

  async function run(what: () => Promise<void>, fail: string) {
    setBusy(true);
    setNote('');
    try {
      await what();
    } catch (e) {
      setNote(errorText(e, fail));
    } finally {
      setBusy(false);
    }
  }
  const open = () => run(async () => setCheck((await api<{ examples: ExampleRow[] }>(`/api/jobs/${clip.id}/example`)).examples), 'Không tải được các ví dụ hiện có.');
  const save = (on: boolean, productType = type) =>
    run(
      async () => {
        await api(`/api/jobs/${clip.id}/example`, on ? sendJson('PUT', { productType: productType || null }) : { method: 'DELETE' });
        setCheck(null);
        onChange({ ...clip, example: on, productType: on ? productType || null : null });
      },
      on ? 'Không chọn làm ví dụ được.' : 'Không gỡ khỏi Ví dụ được.',
    );
  const typeSelect = (value: string, pick: (type: string) => void) => (
    <label className="example-type">
      Loại hàng
      <select value={value} disabled={busy} onChange={(e) => pick(e.target.value)}>
        <option value="">Chưa chọn</option>
        {Object.entries(PRODUCT_TYPES).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
  const status = note && (
    <p className="muted" role="status">
      {note}
    </p>
  );
  const suggested = !clip.example && clip.verdict?.featured === true;
  const panel = (body: ReactNode) => (
    <section className={`example-panel${suggested ? ' suggested' : ''}`} aria-labelledby={`example-panel-${clip.id}`}>
      <h3 id={`example-panel-${clip.id}`}>
        <Icon name="users" />
        Ví dụ cho mọi người
      </h3>
      {body}
      {status}
    </section>
  );
  const where = <p className="example-where">Hiện ở tab Ví dụ của trang {featureLabel(clip.feature)}, mọi người đều thấy và dùng lại được.</p>;
  if (clip.example)
    return panel(
      <div className="example-control">
        <span className="lib-mark featured">
          Đang ở tab Ví dụ
          {clip.productType && ` · ${PRODUCT_TYPES[clip.productType] ?? clip.productType}`}
        </span>
        {/* A new tag saves at once, as the store select does; a failed save leaves the select on the saved one. */}
        {typeSelect(clip.productType ?? '', (t) => void save(true, t))}
        <button type="button" disabled={busy} onClick={() => void save(false)}>
          Gỡ khỏi Ví dụ
        </button>
      </div>,
    );
  if (!check)
    return panel(
      <>
        {suggested && <p className="example-hint">Được đánh dấu Nổi bật · nên cân nhắc làm ví dụ</p>}
        <button type="button" className={suggested ? 'primary' : 'example-pick'} disabled={busy} onClick={() => void open()}>
          Chọn làm ví dụ mẫu
        </button>
        {where}
      </>,
    );
  const samples = numberedSamples(have, prefix, clip.feature === 'marketing' || clip.feature === 'video' ? 'mp4' : 'jpg'); // as the tab counts them; a clip shows its still of the same number
  const similar = check.filter((e) => e.match);
  const tile = (e: ExampleRow) => (
    <li key={e.id}>
      <img src={thumbUrl(e.posterAssetId ?? e.videoAssetId)} alt={`${e.modelLabel}, ${e.ratio}`} loading="lazy" decoding="async" />
      {e.match && <span className="example-match">{MATCH_TEXT[e.match]}</span>}
    </li>
  );
  return panel(
    <section className="example-check" aria-label="Kiểm tra trước khi chọn làm ví dụ">
      {where}
      <h4>Có thể trùng</h4>
      {similar.length > 0 ? <ul className="job-inputs">{similar.map(tile)}</ul> : <p className="muted">Không có ví dụ nào cùng ảnh đầu vào hoặc cùng mô tả.</p>}
      <h4>Ví dụ hiện có ({samples.length + check.length})</h4>
      <ul className="job-inputs example-strip" aria-label="Ví dụ hiện có">
        {check.filter((e) => !e.match).map(tile)}
        {samples.map((n, i) => (
          <li key={n}>
            <img src={`/api/samples/${n.replace(/\.mp4$/, '.jpg')}`} alt={`Ví dụ mẫu ${i + 1}`} loading="lazy" />
          </li>
        ))}
      </ul>
      {typeSelect(type, setType)}
      <div className="example-control">
        <button type="button" className="primary" disabled={busy} onClick={() => void save(true)}>
          Xác nhận làm ví dụ mẫu
        </button>
        <button type="button" disabled={busy} onClick={() => setCheck(null)}>
          Huỷ
        </button>
      </div>
    </section>,
  );
}

/**
 * The selection bar's own actions: Pass, or Fail with one fault, for the picked items the viewer may edit, and for an Admin one store for every
 * picked item. Each item is saved on its own, so one refusal does not stop the rest; the note says how many were saved and why others were not.
 */
function BulkActions({ ids, clips, stores, boards, onChange }: { ids: string[]; clips: Clip[]; stores?: StoreOption[]; boards?: LibraryBoards; onChange: (c: Clip) => void }) {
  const [fault, setFault] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const picked = clips.filter((c) => ids.includes(c.id));
  const editable = picked.filter((c) => c.canEdit);

  async function each(items: Clip[], save: (c: Clip) => Promise<Clip>) {
    setBusy(true);
    setNote('');
    let saved = 0;
    for (const c of items) {
      try {
        onChange(await save(c));
        saved++;
      } catch {} // counted below
    }
    setBusy(false);
    const skipped = picked.length - items.length;
    const failed = items.length - saved;
    setNote([`Đã lưu ${saved} mục`, skipped > 0 && `bỏ qua ${skipped} mục không phải của bạn`, failed > 0 && `${failed} mục chưa lưu được`].filter(Boolean).join(', ') + '.');
  }
  // A bulk Pass keeps a featured item featured: the Explore cards show those first.
  const mark = (body: { verdict: 'pass' } | { verdict: 'fail'; fault: string }) =>
    each(editable, async (c) => {
      const sent = body.verdict === 'pass' && c.verdict?.featured ? { verdict: 'pass', featured: true } : body;
      return { ...c, verdict: (await api<{ verdict: NonNullable<Clip['verdict']> }>(`/api/jobs/${c.id}/verdict`, sendJson('PUT', sent))).verdict };
    });
  const store = (storeId: string) =>
    each(picked, async (c) => (await api(`/api/admin/jobs/${c.id}/store`, sendJson('PUT', { storeId: storeId || null })), { ...c, storeId: storeId || null }));

  return (
    <>
    <span className="bulk-actions" role="group" aria-label="Chấm nhiều mục">
      <button type="button" disabled={busy || editable.length === 0} onClick={() => void mark({ verdict: 'pass' })}>
        Đạt
      </button>
      <label>
        <span className="sr-only">Lỗi cho Không đạt</span>
        <select value={fault} disabled={busy || editable.length === 0} onChange={(e) => setFault(e.target.value)}>
          <option value="">Lỗi gặp phải…</option>
          {FAULTS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" disabled={busy || !fault || editable.length === 0} onClick={() => void mark({ verdict: 'fail', fault })}>
        Không đạt
      </button>
      {stores && (
        <label>
          <span className="sr-only">Gắn cửa hàng cho các mục chọn</span>
          <select value="" disabled={busy} onChange={(e) => e.target.value && void store(e.target.value === 'none' ? '' : e.target.value)}>
            <option value="">Gắn cửa hàng…</option>
            <option value="none">Không gắn cửa hàng</option>
            {stores
              .filter((s) => !s.hidden)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <CompareButton clips={picked} />
      {note && (
        <span className="bulk-note" role="status">
          {note}
        </span>
      )}
    </span>
    {boards && (
      <span className="bulk-actions" role="group" aria-label="Bảng">
        <button type="button" className={boardStyles.bulkButton} onClick={() => setBulkOpen(true)}>
          Thêm vào bảng…
        </button>
        {/* Closed once every picked item has left the list (an untick on the open board): an empty selection ticks nothing. */}
        <BoardsModal open={bulkOpen && picked.length > 0} onClose={() => setBulkOpen(false)} ids={ids} clips={clips} boards={boards} onChange={onChange} />
      </span>
    )}
    </>
  );
}

export function Library({ initialFilters = NO_FILTERS }: { initialFilters?: LibraryFilters }) {
  const [detail, setDetail] = useState<number | null>(null); // the item open in the detail view, by its place in the list
  // The filters and search box start from the address (read by the page on the server), so a shared or bookmarked /library?… link opens the same view and the first render matches the server's.
  const [filters, setFilters] = useState<LibraryFilters>(initialFilters);
  const [search, setSearch] = useState(initialFilters.q); // the search box; its words reach the filters once typing pauses
  const boards = useLibraryBoards();
  const [view, setView] = useState<LibraryView>('grid');
  const [size, setSize] = useState(1);
  const [clips, setClips] = useState<Clip[]>([]);
  const [undo, setUndo] = useState<UndoNote | null>(null); // the delete just made, offered back for a few seconds; a newer delete takes its place
  // The day groups of what is loaded; the Examples' own order (as GET /api/library sorts it) is not by date, so it stays one flat grid.
  // The first row's first picture (a video shows its poster instead) is fetched before the rest: the likely LCP.
  const lead = clips.slice(0, FIRST_ROW).findIndex((c) => c.mediaType === 'image');
  const groups = filters.examplesOnly && filters.sort === 'newest' && Object.hasOwn(GALLERY_SAMPLES, filters.kind) ? [{ day: '', label: '', start: 0, items: clips }] : dayGroups(clips);
  const [creators, setCreators] = useState<{ id: string; name: string }[]>([]);
  const [storeNames, setStoreNames] = useState<{ id: string; name: string }[]>([]); // the stores with a live item, for the store filter
  const [ratios, setRatios] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [guide, setGuide] = useState(false);
  const phone = useMediaQuery(PHONE);
  const [filtering, setFiltering] = useState(false); // the phone's filter sheet
  const [copied, setCopied] = useState(false); // the "copy link" button's brief confirmation
  const [unmarked, setUnmarked] = useState(0); // the items the viewer may mark that have no mark yet, for the verdict filter
  const latest = useRef(0);
  const grid = useRef<HTMLDivElement>(null);
  const viewed = useRef<string | null>(null); // the last item the detail view showed, so closing it can bring that card back into sight
  useEffect(() => {
    if (detail !== null) {
      viewed.current = clips[detail]?.id ?? viewed.current;
      return;
    }
    const id = viewed.current;
    viewed.current = null;
    if (id) focusCard([...(grid.current?.querySelectorAll('[data-clip-id]') ?? [])].find((c) => c.getAttribute('data-clip-id') === id));
  }, [detail, clips]);
  // Arrow keys on a card's open button move between cards; any other target (a field, the marks, a dialog) keeps its own keys.
  const gridKeys = (e: ReactKeyboardEvent<HTMLElement>) => {
    const from = e.target instanceof HTMLElement && e.target.classList.contains('lib-open') ? e.target.closest('.lib-card') : null;
    if (!from || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>('.lib-card')];
    const next = gridStep(cards.map((c) => c.offsetTop), cards.indexOf(from as HTMLElement), e.key);
    if (next === null) return;
    e.preventDefault();
    focusCard(cards[next]);
  };
  const set = (patch: Partial<LibraryFilters>) => setFilters((cur) => ({ ...cur, ...patch }));
  const [pickDay, setPickDay] = useState(false); // "Chọn một ngày…" shows the calendar field
  const yesterdayOnly = !pickDay && !filters.days && filters.date === today(1); // the "Hôm qua" option, not a day picked on the calendar
  const calendar = useRef<HTMLInputElement>(null);
  const openCalendar = useRef(false);
  useEffect(() => {
    // Opened right after "Chọn một ngày…", and scrolled into view.
    const el = calendar.current;
    if (!pickDay || !el || !openCalendar.current) return;
    openCalendar.current = false;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    try {
      el.showPicker();
    } catch {
      el.focus(); // no picker in this browser, or no user gesture left
    }
  }, [pickDay]);
  const active = activeFilters(filters);
  const shelf = filters.kind === 'products';
  // The open board when it is one of the caller's; the board UI is also gated on the kind, so a hand-made ?kind=products&board=… shows none of it.
  const ownBoard = filters.board && filters.kind !== 'products' ? boards.boards?.find((b) => b.id === filters.board) : undefined;
  const inApps = filters.kind === 'apps' || APP_KINDS.some((k) => k.id === filters.kind);
  const chips = activeFilterChips(filters, { board: boards.boards === null ? '' : boards.boards.find((b) => b.id === filters.board)?.name, creator: creators.find((c) => c.id === filters.creator)?.name, store: storeNames.find((s) => s.id === filters.store)?.name, kind: [...KINDS, ...APP_KINDS].find((k) => k.id === filters.kind)?.label });
  const inSheet = chips.filter((c) => c.key !== 'q' && c.key !== 'kind').length; // the search box and the type pills stay on the page
  // An item that no longer matches Favourites only or the verdict filter leaves the list, so the next page's offset stays right; the detail view then shows the next one.
  const listed = useRef(clips); // the list as last rendered, for a refresh to count what it adds
  listed.current = clips;
  const counted = useRef(new Set<string>()); // first marks already taken off the count: two quick marks on one item see the same unmarked render
  const uncount = (c: Clip | undefined) => {
    if (!c || c.verdict || !c.canEdit || counted.current.has(c.id)) return;
    counted.current.add(c.id);
    setUnmarked((n) => Math.max(0, n - 1));
  };
  // Puts a deleted item back where it was (the server restores it first), and its place in the unmarked count.
  const restore = async (clip: Clip, at: number) => {
    await api(`/api/jobs/${clip.id}/restore`, { method: 'POST' });
    if (!clip.verdict && clip.canEdit) {
      counted.current.delete(clip.id);
      setUnmarked((n) => n + 1);
    }
    setClips((cur) => (cur.some((x) => x.id === clip.id) ? cur : [...cur.slice(0, at), clip, ...cur.slice(at)]));
    if (clip.boardIds?.length) void boards.reload(); // the boards' counts take the item back
  };
  const update = (next: Clip) => {
    if (next.verdict) uncount(clips.find((x) => x.id === next.id)); // a first mark
    setClips((cur) => ((filters.favoritesOnly && !next.favorite) || (filters.board && !next.boardIds?.includes(filters.board)) || (filters.examplesOnly && !next.example) || (filters.suggestedOnly && (next.example || !next.verdict?.featured)) || !matchesVerdict(filters.verdict, next.verdict) ? cur.filter((x) => x.id !== next.id) : cur.map((x) => (x.id === next.id ? next : x))));
  };
  // Declared after `update`: the bar renders the bulk actions while this hook runs.
  const zip = useZipDownload({ hover: true, actions: (ids) => <BulkActions ids={ids} clips={clips} stores={isAdmin ? stores : undefined} boards={boards} onChange={update} /> });
  useEffect(() => {
    if (detail !== null && !clips[detail]) setDetail(null); // the last item left the list under a filter
  }, [clips, detail]);

  const load = useCallback(
    // How many came while more wait, null at the end or on an error, undefined when a newer load took over. `refresh` puts the new items of page 1 on top of the list shown instead of replacing it.
    async (offset: number, refresh = false): Promise<number | null | undefined> => {
      const ticket = ++latest.current;
      if (filters.kind === 'products') return null; // the shelf shows no clips; the ticket bump above drops an answer still in flight from the pill before
      try {
        const r = await api<{ hasMore: boolean; isAdmin: boolean; unmarked: number; creators: { id: string; name: string }[]; stores: { id: string; name: string }[]; ratios: string[]; clips: Clip[] }>(`/api/library?${libraryQuery(filters, offset)}`);
        if (ticket !== latest.current) return undefined;
        setIsAdmin(r.isAdmin);
        setUnmarked(r.unmarked);
        // Only the newest-first order puts a new item on top; the pages loaded so far still count for the next offset.
        if (refresh && filters.sort === 'newest' && !filters.examplesOnly) {
          const added = mergeFresh(listed.current, r.clips).length - listed.current.length;
          setClips((cur) => mergeFresh(cur, r.clips));
          setDetail((d) => (d === null ? d : d + added)); // the open item moves down with the list
        } else {
          setClips((cur) => (offset > 0 ? [...cur, ...r.clips.filter((c) => !cur.some((o) => o.id === c.id))] : r.clips)); // an item that arrived since page 1 shifts the offset
          setHasMore(r.hasMore);
        }
        setCreators(r.creators);
        setStoreNames(r.stores);
        setRatios(r.ratios);
        setState('ready');
        return r.hasMore ? r.clips.length : null;
      } catch {
        if (ticket !== latest.current) return undefined;
        setState('error');
      }
      return null;
    },
    [filters],
  );

  // Explore's Tiếp tục opens a finished item by `?item=<job id>`. shortcut: found only among the loaded items (newest first), else the list just shows; add an id filter to GET /api/library if members miss it.
  // Read once the first list is in: on a client navigation the address may not have changed yet when the page first renders.
  const looked = useRef(false);
  useEffect(() => {
    if (state !== 'ready' || looked.current) return;
    looked.current = true;
    const wanted = new URLSearchParams(window.location.search).get('item');
    const i = wanted ? clips.findIndex((c) => c.id === wanted) : -1;
    if (i >= 0) setDetail(i);
  }, [state, clips]);

  // Coming back to the Library with the same filters loads as many items as were shown and scrolls back to the same place.
  const restoring = useRef(true);
  const loadingMore = useRef(false); // also held while restoring, so the end of the list does not load pages twice
  const shown = useRef({ query: '', count: 0 });
  shown.current = { query: libraryQuery(filters, 0), count: clips.length };
  useEffect(() => {
    setState('loading');
    void (async () => {
      let got = await load(0);
      if (got === undefined || !restoring.current) return;
      restoring.current = false;
      const saved = readPlace();
      if (!saved || saved.query !== libraryQuery(filters, 0)) return;
      loadingMore.current = true;
      try {
        let n = 0;
        while (typeof got === 'number' && got > 0 && (n += got) < Math.min(saved.count, MAX_RESTORE)) got = await load(n);
      } finally {
        loadingMore.current = false;
      }
      if (got === undefined) return; // the filters changed meanwhile
      setTimeout(() => window.scrollTo(0, saved.y), 50); // after the restored pages have rendered
    })();
  }, [load]);
  // Saved while scrolling here: by the time the page unmounts, the next page has already scrolled to its top.
  useEffect(() => {
    let frame = 0;
    const save = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (location.pathname !== '/library' || shown.current.count === 0) return;
        try {
          sessionStorage.setItem(PLACE_KEY, JSON.stringify({ ...shown.current, y: window.scrollY }));
        } catch {} // blocked storage: the Library opens at the top
      });
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', save);
    };
  }, []);

  // More items load as the end comes near; the Tải thêm button stays for the keyboard.
  const moreButton = useRef<HTMLButtonElement>(null);
  const loadMore = useCallback(async () => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    try {
      await load(shown.current.count);
    } finally {
      loadingMore.current = false;
    }
  }, [load]);
  useEffect(() => {
    const el = moreButton.current;
    if (!el || !hasMore || state !== 'ready') return;
    const io = new IntersectionObserver((seen) => seen[0]?.isIntersecting && void loadMore(), { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, state, loadMore]);
  useFreshResults(() => void load(0, true));

  useEffect(() => {
    const words = search.trim();
    const t = setTimeout(() => setFilters((cur) => (cur.q === words ? cur : { ...cur, q: words })), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Mirror the filters into the address so a view is shareable and Back returns to the previous one; keep any ?item= deep link.
  // The first run only normalises the address (no history entry); the target===current test also absorbs the popstate echo below.
  const firstUrlSync = useRef(true);
  useEffect(() => {
    const here = new URLSearchParams(window.location.search);
    const item = here.get('item');
    const qs = libraryQuery(filters, 0);
    const query = item ? `${qs ? `${qs}&` : ''}item=${encodeURIComponent(item)}` : qs;
    const target = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    if (target !== window.location.pathname + window.location.search) {
      if (firstUrlSync.current) window.history.replaceState(null, '', target);
      else window.history.pushState(null, '', target);
    }
    firstUrlSync.current = false;
  }, [filters]);
  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search);
      setFilters(filtersFromParams(p));
      setSearch(p.get('q') ?? '');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    setView(readView());
    try {
      const saved = localStorage.getItem(SIZE_KEY);
      if (saved !== null && Number(saved) in SIZES) setSize(Number(saved)); // Number(null) is 0, the smallest size
    } catch {} // blocked storage: the default size
  }, []);
  function resize(next: number) {
    setSize(next);
    try {
      localStorage.setItem(SIZE_KEY, String(next));
    } catch {}
  }
  function switchView(next: LibraryView) {
    setView(next);
    saveView(next);
  }
  function clearFilters() {
    setSearch('');
    setPickDay(false);
    setFilters((cur) => ({ ...NO_FILTERS, sort: cur.sort, showSystem: cur.showSystem }));
  }
  /** Opening a board starts from clean filters, as Xoá lọc does, so the list matches the board's count; the other filters still narrow inside it afterwards. */
  function openBoard(id: string) {
    setSearch('');
    setPickDay(false);
    setFilters((cur) => ({ ...NO_FILTERS, board: id, sort: cur.sort, showSystem: cur.showSystem }));
  }
  /** The shelf pill: like Xoá lọc, it clears the search and every filter, so the address is /library?kind=products. */
  function showShelf() {
    setSearch('');
    setPickDay(false);
    set({ ...NO_FILTERS, kind: 'products' });
  }
  function clearOne(key: ChipKey) {
    if (key === 'q') setSearch('');
    else if (key === 'days' || key === 'date') (setPickDay(false), set({ days: '', date: '' }));
    else if (key === 'kind') set({ kind: 'all' });
    else if (key === 'favoritesOnly') set({ favoritesOnly: false });
    else if (key === 'examplesOnly') set({ examplesOnly: false });
    else if (key === 'suggestedOnly') set({ suggestedOnly: false });
    else set({ [key]: '' } as Partial<LibraryFilters>);
  }
  // Copy the address as it stands, so the current filters and any open item travel to whoever gets the link.
  function copyLink() {
    void navigator.clipboard.writeText(window.location.href).then(
      () => (setCopied(true), void setTimeout(() => setCopied(false), 1500)),
      () => {},
    );
  }

  useEffect(() => {
    if (isAdmin) api<{ stores: StoreOption[] }>('/api/admin/stores?includeHidden=1').then((r) => setStores(r.stores), () => null);
  }, [isAdmin]);

  // The filters beyond search and type: a row on a wide screen, a sheet on a phone (where the row hid most of them sideways).
  const fields = (
    <>
      {(boards.boards?.length || filters.board) && (
        <label className="library-field">
          <span>Bảng</span>
          <select value={filters.board} onChange={(e) => (e.target.value ? openBoard(e.target.value) : set({ board: '' }))}>
            <option value="">Tất cả</option>
            {boards.boards?.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} ({x.count})
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="library-field">
        <span>Người tạo</span>
        <select value={filters.creator} onChange={(e) => set({ creator: e.target.value })}>
          <option value="">Tất cả</option>
          {creators.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="library-field">
        <span>Cửa hàng</span>
        <select value={filters.store} onChange={(e) => set({ store: e.target.value })}>
          <option value="">Tất cả</option>
          <option value="none">{NO_STORE}</option>
          {storeNames.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="library-field">
        <span>Ngày</span>
        <select
          value={filters.days ? `d${filters.days}` : yesterdayOnly ? 'yesterday' : filters.date || pickDay ? 'pick' : ''}
          onChange={(e) => {
            const v = e.target.value;
            openCalendar.current = v === 'pick';
            setPickDay(v === 'pick');
            set(v === 'pick' ? { days: '' } : v === 'yesterday' ? { days: '', date: today(1) } : { days: v.slice(1) as LibraryFilters['days'], date: '' });
          }}
        >
          <option value="">Mọi ngày</option>
          <option value="d1">Hôm nay</option>
          <option value="yesterday">Hôm qua</option>
          <option value="d7">7 ngày qua</option>
          <option value="d30">30 ngày qua</option>
          <option value="pick">{filters.date && !yesterdayOnly ? filters.date.split('-').reverse().join('/') : 'Chọn một ngày…'}</option>
        </select>
      </label>
      {(pickDay || (filters.date && !yesterdayOnly)) && (
        <label className="library-field">
          <span className="sr-only">Ngày cụ thể</span>
          <input ref={calendar} type="date" value={filters.date} max={today()} onChange={(e) => set({ date: e.target.value })} />
        </label>
      )}
      <label className="library-field">
        <span>Tỉ lệ</span>
        <select value={filters.ratio} onChange={(e) => set({ ratio: e.target.value })}>
          <option value="">Tất cả</option>
          {/* A linked ratio no item has yet joins the list only once the list is loaded: before that the server and the first render both have none. */}
          {(ratios.length === 0 || ratios.includes(filters.ratio) || !filters.ratio ? ratios : [...ratios, filters.ratio]).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="library-field">
        <span>Kết quả</span>
        <select value={filters.verdict} onChange={(e) => set({ verdict: e.target.value as VerdictFilter })}>
          <option value="">Tất cả</option>
          <option value="none">Chưa chấm{unmarked > 0 ? ` (${unmarked})` : ''}</option>
          <option value="pass">Đạt</option>
          <option value="featured">Nổi bật</option>
          <option value="fail">Không đạt</option>
        </select>
      </label>
      <label className="library-toggle">
        <input type="checkbox" checked={filters.favoritesOnly} onChange={(e) => set({ favoritesOnly: e.target.checked })} aria-label="Chỉ mục yêu thích" />
        <Icon name="star" />
        Yêu thích
      </label>
      {/* The two never hold together: one lists what is on Examples, the other what is not yet. */}
      {isAdmin && (
        <label className="library-toggle">
          <input type="checkbox" checked={filters.examplesOnly} onChange={(e) => set({ examplesOnly: e.target.checked, suggestedOnly: false })} />
          Đang ở Ví dụ
        </label>
      )}
      {isAdmin && (
        <label className="library-toggle" title="Các kết quả được đánh dấu Nổi bật mà chưa ở tab Ví dụ">
          <input type="checkbox" checked={filters.suggestedOnly} onChange={(e) => set({ suggestedOnly: e.target.checked, examplesOnly: false })} />
          Gợi ý làm ví dụ
        </label>
      )}
      {isAdmin && (
        <label className="library-toggle" title="Kết quả của tài khoản hệ thống (Admin triển khai, tài khoản thử, demo) mặc định không hiện trong Thư viện">
          <input type="checkbox" checked={filters.showSystem} onChange={(e) => set({ showSystem: e.target.checked })} />
          Hiện tài khoản hệ thống
        </label>
      )}
    </>
  );
  const activeChips = active > 0 && (
    <span className="library-active">
      {chips.map((c) => (
        <button key={c.key} type="button" className="library-chip" onClick={() => clearOne(c.key)} title={`Bỏ lọc: ${c.label}`}>
          <span>{c.label}</span>
          <span aria-hidden="true">×</span>
          <span className="sr-only">— bỏ lọc</span>
        </button>
      ))}
      <button type="button" className="link-button" onClick={clearFilters}>
        Xoá lọc
      </button>
    </span>
  );

  return (
    <section className="library" aria-labelledby="library-title" data-selecting={zip.active}>
      <h1 id="library-title">Thư viện</h1>
      <p className="muted library-sub">
        Mọi thứ công ty đã tạo, ở cùng một chỗ.
        <button type="button" className="link-button" onClick={() => setGuide(true)}>
          Hướng dẫn chấm điểm
        </button>
      </p>
      <VerdictGuide open={guide} onClose={() => setGuide(false)} />
      {!shelf && <div className="library-tools">
        <label className="library-search">
          <Icon name="search" />
          <span className="sr-only">Tìm kiếm</span>
          <input type="search" value={search} maxLength={200} placeholder="Tìm theo mô tả hoặc mô hình" onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="library-field">
          <span className="sr-only">Sắp xếp</span>
          <select value={filters.sort} onChange={(e) => set({ sort: e.target.value as LibraryFilters['sort'] })}>
            <option value="newest">Mới nhất trước</option>
            <option value="oldest">Cũ nhất trước</option>
          </select>
        </label>
        <div className="segmented" role="group" aria-label="Kiểu xem">
          <button type="button" aria-pressed={view === 'grid'} aria-label="Lưới" title="Lưới" onClick={() => switchView('grid')}>
            <Icon name="library" />
          </button>
          <button type="button" aria-pressed={view === 'list'} aria-label="Danh sách" title="Danh sách" onClick={() => switchView('list')}>
            <Icon name="list" />
          </button>
        </div>
        {view === 'grid' && (
          <label className="library-size">
            <span className="sr-only">Cỡ ô</span>
            <Icon name="library" />
            <input type="range" min={0} max={SIZES.length - 1} step={1} value={size} onChange={(e) => resize(Number(e.target.value))} aria-valuetext={['Nhỏ', 'Vừa', 'Lớn'][size]} />
            <Icon name="ratio" />
          </label>
        )}
        {zip.toggle}
        <button type="button" className="icon-button library-share" onClick={copyLink} aria-label="Sao chép liên kết khung xem" title="Sao chép liên kết khung xem">
          <Icon name={copied ? 'check' : 'link'} />
          {copied && <span className="sr-only">Đã sao chép liên kết.</span>}
        </button>
      </div>}
      <div className="kinds kinds-wrap" role="group" aria-label="Loại">
        {KINDS.map((k) => (
          <button key={k.id} type="button" aria-pressed={filters.kind === k.id || (k.id === 'apps' && inApps)} onClick={() => (k.id === 'products' ? showShelf() : set({ kind: k.id }))}>
            {k.label}
          </button>
        ))}
      </div>
      {inApps && (
        <div className="kinds kinds-wrap" role="group" aria-label="Theo ứng dụng">
          {[{ id: 'apps', label: 'Tất cả ứng dụng' }, ...APP_KINDS].map((k) => (
            <button key={k.id} type="button" aria-pressed={filters.kind === k.id} onClick={() => set({ kind: k.id })}>
              {k.label}
            </button>
          ))}
        </div>
      )}
      {!shelf && <div className="library-filters" role="search" aria-label="Bộ lọc">
        {phone ? (
          <button type="button" className="library-toggle" aria-haspopup="dialog" onClick={() => setFiltering(true)}>
            <Icon name="sliders" />
            Bộ lọc{inSheet > 0 && ` (${inSheet})`}
          </button>
        ) : (
          fields
        )}
        {activeChips}
      </div>}
      {phone && !shelf && (
        <Modal open={filtering} onClose={() => setFiltering(false)} label="Bộ lọc" className="template-sheet library-sheet">
          <h2>Bộ lọc</h2>
          <div className="library-sheet-fields">{fields}</div>
          <button type="button" className="primary" onClick={() => setFiltering(false)}>
            Xong
          </button>
        </Modal>
      )}

      {shelf ? (
        <ProductShelf />
      ) : (
        <>
      {ownBoard && <BoardTools board={ownBoard} boards={boards} onDeleted={clearFilters} />}
      {filters.board && filters.kind !== 'products' && boards.boards === null && boards.failed && <LoadError text="Không tải được bảng." onRetry={boards.reload} />}
      {state === 'loading' && clips.length === 0 && (
        <div className={view === 'list' ? 'library-list library-skeleton' : 'grid library-skeleton'} style={{ '--card-min': SIZES[size] } as CSSProperties} role="status">
          <span className="sr-only">Đang tải...</span>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="skeleton" />
          ))}
        </div>
      )}
      {state === 'error' && <LoadError text="Không tải được thư viện." onRetry={() => (setState('loading'), load(0))} />}
      {state === 'ready' && clips.length === 0 && !(filters.board && filters.kind !== 'products' && boards.boards === null) && (
        <div className="library-empty">
          <EmptyArt search={active > 0} />
          {filters.board && filters.kind !== 'products' && !ownBoard ? (
            <>
              <p className="library-empty-title">Không tìm thấy bảng này.</p>
              <p className="muted">Bảng chỉ người tạo xem được, hoặc đã bị xoá.</p>
              <button type="button" onClick={clearFilters}>
                Xoá lọc
              </button>
            </>
          ) : ownBoard && active === 1 ? (
            <>
              <p className="library-empty-title">Bảng này chưa có mục nào.</p>
              <p className="muted">Mở một kết quả rồi bấm Bảng, hoặc chọn nhiều mục rồi bấm Thêm vào bảng.</p>
              <button type="button" onClick={clearFilters}>
                Xoá lọc
              </button>
            </>
          ) : active > 0 ? (
            <>
              <p className="library-empty-title">Chưa có {emptyNoun(filters.kind)} nào khớp bộ lọc.</p>
              <p className="muted">Bỏ bớt bộ lọc hoặc thử từ khoá khác.</p>
              <button type="button" onClick={clearFilters}>
                Xoá lọc
              </button>
            </>
          ) : (
            <>
              <p className="library-empty-title">Thư viện còn trống</p>
              <p className="muted">Video và ảnh mọi người tạo sẽ nằm ở đây.</p>
              <p className="library-empty-actions">
                <Link href="/create" className="button">
                  Tạo video
                </Link>
                <Link href="/image-generation" className="button">
                  Tạo ảnh
                </Link>
              </p>
            </>
          )}
        </div>
      )}
      <div ref={grid} className="library-days" aria-busy={state === 'loading'} hidden={clips.length === 0} onKeyDown={view === 'grid' ? gridKeys : undefined}>
        {groups.map((g) => {
          const ids = g.items.map((c) => c.id);
          const picked = ids.filter((id) => zip.ids.includes(id)).length;
          return (
            <section key={g.day} className="lib-day-group">
              {g.label && (
                <div className="lib-day">
                  {/* Picks or drops every loaded item of the day through the same selection as Chọn, which it turns on. */}
                  <label className="lib-day-check">
                    <input
                      type="checkbox"
                      checked={picked === ids.length}
                      ref={(box) => {
                        if (box) box.indeterminate = picked > 0 && picked < ids.length;
                      }}
                      onChange={(e) => (e.target.checked ? zip.pickMany(ids) : zip.dropMany(ids))}
                      aria-label={`Chọn tất cả ${ids.length} mục ngày ${g.label}`}
                    />
                  </label>
                  <h2>{g.label}</h2>
                  <span className="lib-day-count">{ids.length} mục</span>
                </div>
              )}
              <div className={view === 'list' ? 'library-list' : 'grid'} style={{ '--card-min': SIZES[size] } as CSSProperties}>
                {g.items.map((c, j) => (
                  <ClipCard
                    key={c.id}
                    clip={c}
                    view={view}
                    index={g.start + j}
                    lead={g.start + j === lead}
                    select={zip.check(c.id, clipLabel(c))}
                    selecting={zip.active}
                    onChange={update}
                    onDeleted={(id) => {
                      const gone = clips.find((x) => x.id === id);
                      uncount(gone);
                      if (gone?.boardIds?.length) void boards.reload(); // the boards' counts drop the item
                      setClips((cur) => cur.filter((x) => x.id !== id));
                      if (gone) setUndo({ key: id, text: `Đã xoá ${gone.mediaType === 'image' ? 'ảnh' : 'clip'}.`, undo: () => restore(gone, clips.indexOf(gone)) });
                    }}
                    onOpen={zip.active ? () => zip.flip(c.id) : () => setDetail(g.start + j)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {detail !== null && clips[detail] && <ClipDetail clips={clips} index={detail} stores={isAdmin ? stores : undefined} admin={isAdmin} boards={boards} makeApp={isAdmin} onIndex={setDetail} onChange={update} />}
      {hasMore && (
        <button ref={moreButton} type="button" className="library-more" onClick={() => void loadMore()}>
          Tải thêm
        </button>
      )}
        </>
      )}
      {!shelf && zip.bar}
      <UndoNotice note={undo} onClose={() => setUndo(null)} />
    </section>
  );
}

