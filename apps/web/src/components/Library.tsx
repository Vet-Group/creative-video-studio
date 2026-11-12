'use client';
import Link from 'next/link';
import { type CSSProperties, Fragment, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { api, type Clip, errorText, sendJson, thumbUrl } from '@/lib/api';
import { FAULTS } from '@/lib/faults';
import { featureLabel } from '@/lib/features';
import { GALLERY_SAMPLES, numberedSamples } from '@/lib/examples';
import { cardTitleOfFormat, HOOKS, LOCATIONS } from '@/lib/marketing';
import { activeFilterChips, activeFilters, type ChipKey, dayHeadings, filtersFromParams, type LibraryFilters, type LibraryView, libraryQuery, matchesVerdict, NO_FILTERS, readView, saveView, type VerdictFilter } from '@/lib/library-view';
import { reuseHref } from '@/lib/reuse';
import { useSamples } from '@/lib/use-samples';
import { CompareSlider } from './CompareSlider';
import { Icon } from './Icon';
import { useFreshResults } from './jobs';
import { LoadError } from './LoadError';
import { Modal } from './Modal';
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
/** Today in Vietnam as YYYY-MM-DD, the latest day the calendar offers. */
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const fmtShort = (iso: string) => new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));
const fmtTime = (iso: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));
/** The Library filters in the reference order; the id is the `kind` the API takes. */
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
];
/** The size slider: card widths from small to large, remembered per browser. */
const SIZES = ['12rem', '16rem', '22rem'];
const SIZE_KEY = 'cvs.library.size';
/** What the empty Library calls its items under a kind filter: photos, clips, or both. */
export const emptyNoun = (kind: string) => (['images', 'try_on', 'image'].includes(kind) ? 'ảnh' : kind === 'videos' || kind === 'video' || kind.startsWith('marketing') ? 'clip' : 'kết quả');
const faultLabel = (id: string | null) => FAULTS.find((f) => f.id === id)?.label ?? id ?? '';

interface StoreOption {
  id: string;
  name: string;
  hidden: boolean;
}

/** Keys that type into a field are not shortcuts. */
// A focused player keeps its own keys too: ←/→ seek there.
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA', 'VIDEO', 'AUDIO'].includes(t.tagName));

/**
 * The Pass, featured Pass and Fail marks (Fail asks for the fault) on an item its viewer may edit: the grid card, the list row and the detail view.
 * With `keys` (the detail view) 1, 2 and 3 press Pass, featured Pass and Fail, which then focuses the fault list.
 */
function VerdictMarks({ clip, onChange, keys = false }: { clip: Clip; onChange: (c: Clip) => void; keys?: boolean }) {
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
      <span className="verdict-buttons">
        <button type="button" aria-pressed={clip.verdict?.verdict === 'pass' && !clip.verdict.featured} disabled={saving} onClick={() => void mark({ verdict: 'pass' })}>
          Đạt
        </button>
        {/* A Pass worth showing the whole company: Explore model cards show these first. */}
        <button type="button" aria-pressed={clip.verdict?.featured === true} disabled={saving} title={`Đạt và đẹp, nên làm mẫu: ${noun} nổi bật hiện trước trên thẻ mô hình ở Khám phá`} onClick={() => void mark({ verdict: 'pass', featured: true })}>
          Nổi bật
        </button>
        <button type="button" aria-pressed={failing || clip.verdict?.verdict === 'fail'} disabled={saving} onClick={() => setFailing((f) => !f)}>
          Không đạt
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

/** A grid card puts the result first: its type and length on the media, the mark in its corner, the actions over it on hover (always on touch), two short lines under it and the marks for whoever may edit; Reuse and the store live in the detail view. A `list` row keeps the clip actions and the marks. */
function ClipCard({ clip, view, select, onChange, onDeleted, onOpen }: { clip: Clip; view: LibraryView; select?: ReactNode; onChange: (c: Clip) => void; onDeleted: (id: string) => void; onOpen: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const image = clip.mediaType === 'image';
  const noun = image ? 'ảnh' : 'clip';
  const mark = verdictText(clip.verdict);
  const video = useRef<HTMLVideoElement>(null);

  async function remove() {
    setProblem('');
    setSaving(true);
    try {
      await api(`/api/jobs/${clip.id}`, { method: 'DELETE' });
      onDeleted(clip.id);
    } catch {
      setProblem(`Không xoá được ${noun}.`);
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

  const name = `${image ? 'Ảnh' : 'Clip'} ${clip.downloadName}`;
  const confirm = confirmDelete && (
    <div className="actions" role="alertdialog" aria-label="Xác nhận xoá">
      <span>Xoá {noun} này?</span>
      <button type="button" disabled={saving} onClick={() => void remove()}>
        Xác nhận xoá
      </button>
      <button type="button" onClick={() => setConfirmDelete(false)}>
        Huỷ
      </button>
    </div>
  );

  if (view === 'list') {
    const thumb = clip.posterAssetId ?? (image ? clip.videoAssetId : null); // an image's preview, else the image itself
    return (
      <article className="lib-row" aria-label={name}>
        {select}
        <span className="lib-thumb">
          {thumb ? <img src={`/api/assets/${thumb}/content`} alt="" loading="lazy" /> : <video preload="metadata" muted playsInline src={`/api/assets/${clip.videoAssetId}/content`} />}
        </span>
        <div className="lib-row-main">
          <p className="lib-row-title">
            {clip.modelLabel}
            {clip.feature !== 'video' && clip.prompt && <span className="tag feature-tag">{featureLabel(clip.feature)}</span>}
            {clip.isMock && <span className="badge">MOCK</span>}
            {clip.example && <span className="tag">Ví dụ</span>}
            {mark && <span className={`lib-mark${verdictClass(clip.verdict!)}`}>{mark}</span>}
          </p>
          <p className={clip.prompt ? 'lib-row-prompt' : 'lib-row-prompt none'} title={clip.prompt ?? undefined}>
            {clip.prompt ?? featureLabel(clip.feature)}
          </p>
          <p className="lib-row-meta">
            {clip.creator.name} · {fmtTime(clip.createdAt)} · {clip.ratio} · {image ? clip.resolution : `${clip.durationSec} giây`}
          </p>
        </div>
        <div className="actions">
          <button type="button" className="favorite icon-button" aria-pressed={clip.favorite} disabled={saving} onClick={() => void toggleFavorite()} aria-label="Yêu thích" title="Yêu thích">
            <Icon name="star" />
          </button>
          <button type="button" className="icon-button" onClick={() => void download()} aria-label="Tải xuống" title="Tải xuống">
            <Icon name="download" />
          </button>
          <button type="button" className="icon-button" onClick={onOpen} aria-label="Xem chi tiết" title="Xem chi tiết">
            <Icon name="eye" />
          </button>
          {clip.canEdit && (
            <button type="button" className="danger icon-button" onClick={() => setConfirmDelete(true)} aria-label="Xoá" title="Xoá">
              <Icon name="x" />
            </button>
          )}
        </div>
        {clip.canEdit && <VerdictMarks clip={clip} onChange={onChange} />}
        {confirm}
        {problem && <p className="error">{problem}</p>}
      </article>
    );
  }

  const tools = (
    <div className="lib-tools">
      <button type="button" className="favorite icon-button" aria-pressed={clip.favorite} disabled={saving} onClick={() => void toggleFavorite()} aria-label="Yêu thích" title="Yêu thích">
        <Icon name="star" />
      </button>
      <button type="button" className="icon-button" onClick={() => void download()} aria-label="Tải xuống" title="Tải xuống">
        <Icon name="download" />
      </button>
      {clip.canEdit && (
        <button type="button" className="danger icon-button" onClick={() => setConfirmDelete(true)} aria-label="Xoá" title="Xoá">
          <Icon name="x" />
        </button>
      )}
    </div>
  );
  // A video plays muted while a mouse rests on it, so the grid can be skimmed without opening each item.
  const play = (on: boolean) => {
    const v = video.current;
    if (v) on ? void v.play().catch(() => undefined) : v.pause();
  };
  return (
    <article className="card lib-card" aria-label={name}>
      {select}
      <div className="lib-media" onPointerEnter={(e) => e.pointerType === 'mouse' && play(true)} onPointerLeave={() => play(false)}>
        {image ? (
          <img className="output" src={`/api/assets/${clip.posterAssetId ?? clip.videoAssetId}/content`} alt={clip.downloadName} loading="lazy" />
        ) : (
          <video ref={video} muted loop playsInline preload="metadata" poster={clip.posterAssetId ? `/api/assets/${clip.posterAssetId}/content` : undefined} src={`/api/assets/${clip.videoAssetId}/content`} />
        )}
        {/* Over the media rather than around it, so the picture keeps its own name for screen readers. */}
        <button type="button" className="lib-open" onClick={onOpen} aria-label="Xem chi tiết" title="Xem chi tiết" />
        <span className="lib-chips">
          {clip.feature !== 'video' && <span className="lib-chip">{featureLabel(clip.feature)}</span>}
          {!image && <span className="lib-chip">{clip.durationSec}s</span>}
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
        <p className="lib-title">{clip.modelLabel}</p>
        <p className="lib-meta">
          {/* One line on a wide card: a long name is cut, never the time or the cost, so the marks below line up across a row.
              The phone's two columns put the name on its own line (globals.css), so its leading dot is drawn by CSS. */}
          <span className="lib-who" title={clip.creator.name}>
            {clip.creator.name}
          </span>
          <span className="lib-when">{fmtShort(clip.createdAt)} ·</span>
          <span title={clip.costFinal ? 'Chi phí thật' : 'Chi phí thật, tạm tính'}>
            ${clip.costUsd}
            {!clip.costFinal && '*'}
          </span>
        </p>
      </div>
      {clip.canEdit && <VerdictMarks clip={clip} onChange={onChange} />}
      {confirm}
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
}
const NO_INPUTS: ClipInputs = { prompt: null, presetId: null, enhance: null, enhancedPrompt: null, audio: null, brief: null, script: null, hookText: null, ending: null, endText: null, format: null, hook: null, location: null, images: [] };

/** The preset and image style names, read once per page load for the detail view's template row; a failed read is tried again next time. */
let presetNames: Promise<Map<string, string> | null> | null = null;
const loadPresetNames = () =>
  (presetNames ??= Promise.all(['video', 'image'].map((f) => api<{ presets: { id: string; label: string }[] }>(`/api/presets?feature=${f}`))).then(
    (r) => new Map(r.flatMap((l) => l.presets).map((p) => [p.id, p.label])),
    () => ((presetNames = null), null),
  ));
/** A Marketing choice's name; a member's own hook or location shows as their own. */
const choiceName = (list: { id: string; name: string }[], id: string | null) => id && (list.find((c) => c.id === id)?.name ?? 'Tự tạo');

/**
 * Fash's item detail (survey L3), grown into the recipe of the result: the result large on the left; beside it the title and mark, the words behind it
 * (the creator's prompt, or Marketing's brief and script, the enhanced prompt and the prompt the model got), the inputs, the model, template and
 * settings, who made it, when and for how much, the store for an Admin, download / fullscreen / open in a new tab / copy, the marks and Reuse.
 * Arrows and ←/→ step through the loaded items; 1, 2 and 3 mark.
 */
function ClipDetail({ clips, index, stores, admin, onIndex, onChange }: { clips: Clip[]; index: number; stores?: StoreOption[]; admin: boolean; onIndex: (i: number | null) => void; onChange: (c: Clip) => void }) {
  const clip = clips[index]!;
  const image = clip.mediaType === 'image';
  const [job, setJob] = useState<ClipInputs | null>(null);
  const [presets, setPresets] = useState<Map<string, string> | null>(null); // null until read, or when the read failed
  const [note, setNote] = useState('');
  const [comparing, setComparing] = useState(false);
  const media = useRef<HTMLVideoElement & HTMLImageElement>(null);
  const content = (id: string) => `/api/assets/${id}/content`;
  useEffect(() => {
    setJob(null);
    setNote('');
    setComparing(false);
    api<ClipInputs>(`/api/jobs/${clip.id}`).then(setJob, () => setJob(NO_INPUTS));
  }, [clip.id]);
  useEffect(() => void loadPresetNames().then(setPresets), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      const next = index + (e.key === 'ArrowLeft' ? -1 : 1);
      if (next < 0 || next >= clips.length) return;
      e.preventDefault();
      onIndex(next);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, clips.length, onIndex]);

  // The creator's own words: a free prompt on Create video and Image Generation (a brief with an image style); Marketing keeps a brief and a script; the other features compose theirs.
  const own = job && ((clip.feature === 'video' || clip.feature === 'image') && !job.presetId ? job.prompt : null);
  const sent = job?.prompt && job.prompt !== own ? job.prompt : null; // what the model got, when it is not the creator's words as typed
  const title = clip.feature === 'marketing' ? cardTitleOfFormat(job?.format) : featureLabel(clip.feature);
  const copyText = own ?? job?.brief ?? job?.prompt ?? null;
  const mark = verdictText(clip.verdict);
  // Try On's first input is the person: the original the result is compared with.
  const original = clip.feature === 'try_on' && image ? job?.images[0] : undefined;

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
  const copy = () => act(async () => (await navigator.clipboard.writeText(copyText ?? ''), setNote('Đã sao chép.')), 'Không sao chép được.');
  const reassign = (storeId: string) =>
    act(async () => {
      await api(`/api/admin/jobs/${clip.id}/store`, sendJson('PUT', { storeId: storeId || null }));
      onChange({ ...clip, storeId: storeId || null });
    }, 'Không đổi được cửa hàng.');

  const words = (label: string, text: string | null | undefined) =>
    text && (
      <div className="recipe-text">
        <h3>{label}</h3>
        <p>{text}</p>
      </div>
    );
  const row = (label: string, value: string | null | undefined) =>
    value && (
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    );

  return (
    <Modal open onClose={() => onIndex(null)} label={`Chi tiết: ${title}`} className="lightbox">
      <div className="lightbox-media">
        {comparing && original ? (
          <CompareSlider before={content(original.id)} after={content(clip.videoAssetId)} beforeAlt={`Ảnh gốc ${original.filename}`} afterAlt={clip.downloadName} />
        ) : image ? (
          <img ref={media} src={content(clip.videoAssetId)} alt={clip.downloadName} />
        ) : (
          <video key={clip.id} ref={media} controls autoPlay muted playsInline poster={clip.posterAssetId ? content(clip.posterAssetId) : undefined} src={content(clip.videoAssetId)} />
        )}
      </div>
      <div className="lightbox-side">
        <h2>
          {title}
          {mark && <span className={`lib-mark${verdictClass(clip.verdict!)}`}>{mark}</span>}
        </h2>
        {words('Hook tự viết', job?.hookText)}
        {words('Mô tả', own ?? job?.brief)}
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
            <ul className="job-inputs" aria-label="Ảnh đầu vào">
              {job.images.map((i) => (
                <li key={i.id}>
                  <a href={content(i.id)} target="_blank" rel="noreferrer" title="Mở ảnh trong tab mới">
                    <img src={thumbUrl(i.id)} alt={i.filename} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <dl className="recipe" aria-label="Cách tạo">
          {row('Mô hình', clip.modelLabel)}
          {row('Mẫu', job?.presetId && presets && (presets.get(job.presetId) ?? 'Đã xoá'))}
          {row('Hook', choiceName(HOOKS, job?.hook ?? null))}
          {row('Bối cảnh', choiceName(LOCATIONS, job?.location ?? null))}
          {row('Tỉ lệ', clip.ratio)}
          {row(image ? 'Độ phân giải' : 'Thời lượng', image ? clip.resolution : `${clip.durationSec} giây`)}
          {row('Âm thanh', job?.audio === 'on' ? 'Có' : job?.audio === 'off' ? 'Không' : null)}
          {row('AI cải thiện', job?.enhance ? 'Có' : null)}
          {row('Người tạo', `${clip.creator.name} · ${fmtTime(clip.createdAt)}`)}
          {row('Chi phí thật', `$${clip.costUsd}${clip.costFinal ? '' : ' (tạm tính)'}`)}
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
        {note && (
          <p className="muted" role="status">
            {note}
          </p>
        )}
        <div className="job-actions">
          <button type="button" className="icon-button" onClick={() => void download()} aria-label="Tải xuống" title="Tải xuống">
            <Icon name="download" />
          </button>
          <button type="button" className="icon-button" onClick={() => void media.current?.requestFullscreen?.()} aria-label="Toàn màn hình" title="Toàn màn hình">
            <Icon name="eye" />
          </button>
          <a className="icon-button" href={content(clip.videoAssetId)} target="_blank" rel="noreferrer" aria-label="Mở trong tab mới" title="Mở trong tab mới">
            <Icon name="external" />
          </a>
          {copyText && (
            <button type="button" className="icon-button" onClick={() => void copy()} aria-label="Sao chép mô tả" title="Sao chép mô tả">
              <Icon name="copy" />
            </button>
          )}
          {original && (
            <button type="button" className="icon-button" aria-pressed={comparing} onClick={() => setComparing(!comparing)} aria-label="So sánh trước/sau" title="So sánh trước/sau">
              <Icon name="panel" />
            </button>
          )}
        </div>
        {clip.canEdit && <VerdictMarks key={clip.id} clip={clip} onChange={onChange} keys />}
        {admin && <ExampleControl key={`example-${clip.id}`} clip={clip} onChange={onChange} />}
        {clip.canEdit && <p className="recipe-keys">Phím tắt: 1 Đạt · 2 Nổi bật · 3 Không đạt · ←/→ mục trước, sau</p>}
        {reuseHref(clip) && (
          <Link href={reuseHref(clip)!} className="lightbox-reuse">
            Dùng lại
          </Link>
        )}
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
    </Modal>
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
 * An Admin's "Đưa lên Ví dụ" on a result of a page whose Examples tab shows company results (owner, 2026-11-09: a featured mark only suggests one).
 * It first shows what that tab already has, the results that may repeat this one on top and then the fixed samples, so a near copy is seen before it goes up.
 */
function ExampleControl({ clip, onChange }: { clip: Clip; onChange: (c: Clip) => void }) {
  const have = useSamples();
  const [check, setCheck] = useState<ExampleRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
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
  const save = (on: boolean) =>
    run(
      async () => {
        await api(`/api/jobs/${clip.id}/example`, { method: on ? 'PUT' : 'DELETE' });
        setCheck(null);
        onChange({ ...clip, example: on });
      },
      on ? 'Không đưa lên Ví dụ được.' : 'Không gỡ khỏi Ví dụ được.',
    );
  const status = note && (
    <p className="muted" role="status">
      {note}
    </p>
  );
  if (clip.example)
    return (
      <div className="example-control">
        <span className="lib-mark featured">Đang ở tab Ví dụ</span>
        <button type="button" disabled={busy} onClick={() => void save(false)}>
          Gỡ khỏi Ví dụ
        </button>
        {status}
      </div>
    );
  if (!check)
    return (
      <div className="example-control">
        <button type="button" disabled={busy} onClick={() => void open()}>
          Đưa lên Ví dụ...
        </button>
        {status}
      </div>
    );
  const samples = numberedSamples(have, prefix, clip.feature === 'marketing' ? 'mp4' : 'jpg'); // as the tab counts them; a clip shows its still of the same number
  const similar = check.filter((e) => e.match);
  const tile = (e: ExampleRow) => (
    <li key={e.id}>
      <img src={`/api/assets/${e.posterAssetId ?? e.videoAssetId}/content`} alt={`${e.modelLabel}, ${e.ratio}`} loading="lazy" />
      {e.match && <span className="example-match">{MATCH_TEXT[e.match]}</span>}
    </li>
  );
  return (
    <section className="example-check" aria-label="Kiểm tra trước khi đưa lên Ví dụ">
      <h3>Có thể trùng</h3>
      {similar.length > 0 ? <ul className="job-inputs">{similar.map(tile)}</ul> : <p className="muted">Không có ví dụ nào cùng ảnh đầu vào hoặc cùng mô tả.</p>}
      <h3>Ví dụ hiện có ({samples.length + check.length})</h3>
      <ul className="job-inputs example-strip" aria-label="Ví dụ hiện có">
        {check.filter((e) => !e.match).map(tile)}
        {samples.map((n) => (
          <li key={n}>
            <img src={`/api/samples/${n.replace(/\.mp4$/, '.jpg')}`} alt="Ảnh mẫu" loading="lazy" />
          </li>
        ))}
      </ul>
      <div className="example-control">
        <button type="button" className="primary" disabled={busy} onClick={() => void save(true)}>
          Đưa lên Ví dụ
        </button>
        <button type="button" disabled={busy} onClick={() => setCheck(null)}>
          Huỷ
        </button>
      </div>
      {status}
    </section>
  );
}

/**
 * The selection bar's own actions: Pass, or Fail with one fault, for the picked items the viewer may edit, and for an Admin one store for every
 * picked item. Each item is saved on its own, so one refusal does not stop the rest; the note says how many were saved and why others were not.
 */
function BulkActions({ ids, clips, stores, onChange }: { ids: string[]; clips: Clip[]; stores?: StoreOption[]; onChange: (c: Clip) => void }) {
  const [fault, setFault] = useState('');
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
      {note && (
        <span className="bulk-note" role="status">
          {note}
        </span>
      )}
    </span>
  );
}

/** The empty Library's picture: a small stack of frames in the app's tokens, with a play mark, or a lens when filters hide everything. */
function EmptyArt({ search }: { search?: boolean }) {
  return (
    <svg className="library-art" viewBox="0 0 120 96" width="120" height="96" aria-hidden="true" focusable="false">
      <rect className="art-back" x="22" y="16" width="44" height="60" rx="8" transform="rotate(-12 44 46)" />
      <rect className="art-mid" x="54" y="16" width="44" height="60" rx="8" transform="rotate(12 76 46)" />
      <rect className="art-front" x="34" y="12" width="52" height="70" rx="8" />
      {search ? (
        <>
          <path className="art-line" d="M44 30h32 M44 40h24 M44 50h28" />
          <circle className="art-lens" cx="80" cy="64" r="11" />
          <path className="art-handle" d="M88 72l9 9" />
        </>
      ) : (
        <>
          <circle className="art-play" cx="60" cy="44" r="12" />
          <path className="art-play-mark" d="M56.5 38.5v11l9-5.5z" />
          <path className="art-spark" d="M96 14l1.8 4.2L102 20l-4.2 1.8L96 26l-1.8-4.2L90 20l4.2-1.8z" />
        </>
      )}
    </svg>
  );
}

export function Library() {
  const [detail, setDetail] = useState<number | null>(null); // the item open in the detail view, by its place in the list
  // The filters and search box start from the address, so a shared or bookmarked /library?… link opens the same view.
  const [filters, setFilters] = useState<LibraryFilters>(() => (typeof window === 'undefined' ? NO_FILTERS : filtersFromParams(new URLSearchParams(window.location.search))));
  const [search, setSearch] = useState(() => (typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('q') ?? ''))); // the search box; its words reach the filters once typing pauses
  const [view, setView] = useState<LibraryView>('grid');
  const [size, setSize] = useState(1);
  const [clips, setClips] = useState<Clip[]>([]);
  const headings = dayHeadings(clips);
  const [creators, setCreators] = useState<{ id: string; name: string }[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [guide, setGuide] = useState(false);
  const [copied, setCopied] = useState(false); // the "copy link" button's brief confirmation
  const [unmarked, setUnmarked] = useState(0); // the items the viewer may mark that have no mark yet, for the verdict filter
  const latest = useRef(0);
  const set = (patch: Partial<LibraryFilters>) => setFilters((cur) => ({ ...cur, ...patch }));
  const [pickDay, setPickDay] = useState(false); // "Chọn một ngày…" shows the calendar field
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
  const chips = activeFilterChips(filters, { creator: creators.find((c) => c.id === filters.creator)?.name, kind: KINDS.find((k) => k.id === filters.kind)?.label });
  // An item that no longer matches Favourites only or the verdict filter leaves the list, so the next page's offset stays right; the detail view then shows the next one.
  const counted = useRef(new Set<string>()); // first marks already taken off the count: two quick marks on one item see the same unmarked render
  const uncount = (c: Clip | undefined) => {
    if (!c || c.verdict || !c.canEdit || counted.current.has(c.id)) return;
    counted.current.add(c.id);
    setUnmarked((n) => Math.max(0, n - 1));
  };
  const update = (next: Clip) => {
    if (next.verdict) uncount(clips.find((x) => x.id === next.id)); // a first mark
    setClips((cur) => ((filters.favoritesOnly && !next.favorite) || (filters.examplesOnly && !next.example) || !matchesVerdict(filters.verdict, next.verdict) ? cur.filter((x) => x.id !== next.id) : cur.map((x) => (x.id === next.id ? next : x))));
  };
  // Declared after `update`: the bar renders the bulk actions while this hook runs.
  const zip = useZipDownload({ hover: true, actions: (ids) => <BulkActions ids={ids} clips={clips} stores={isAdmin ? stores : undefined} onChange={update} /> });
  useEffect(() => {
    if (detail !== null && !clips[detail]) setDetail(null); // the last item left the list under a filter
  }, [clips, detail]);

  const load = useCallback(
    // How many came while more wait, null at the end or on an error, undefined when a newer load took over.
    async (offset: number): Promise<number | null | undefined> => {
      const ticket = ++latest.current;
      try {
        const r = await api<{ hasMore: boolean; isAdmin: boolean; unmarked: number; creators: { id: string; name: string }[]; clips: Clip[] }>(`/api/library?${libraryQuery(filters, offset)}`);
        if (ticket !== latest.current) return undefined;
        setIsAdmin(r.isAdmin);
        setUnmarked(r.unmarked);
        setClips((cur) => (offset > 0 ? [...cur, ...r.clips.filter((c) => !cur.some((o) => o.id === c.id))] : r.clips)); // an item that arrived since page 1 shifts the offset
        setCreators(r.creators);
        setHasMore(r.hasMore);
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
  // shortcut: a fresh result reloads the first page, so pages added with "Xem thêm" close; merge them if that bothers anyone.
  useFreshResults(() => void load(0));

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
    setFilters((cur) => ({ ...NO_FILTERS, sort: cur.sort }));
  }
  function clearOne(key: ChipKey) {
    if (key === 'q') setSearch('');
    else if (key === 'days' || key === 'date') (setPickDay(false), set({ days: '', date: '' }));
    else if (key === 'kind') set({ kind: 'all' });
    else if (key === 'favoritesOnly') set({ favoritesOnly: false });
    else if (key === 'examplesOnly') set({ examplesOnly: false });
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
      <div className="library-tools">
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
      </div>
      <div className="kinds" role="group" aria-label="Loại">
        {KINDS.map((k) => (
          <button key={k.id} type="button" aria-pressed={filters.kind === k.id} onClick={() => set({ kind: k.id })}>
            {k.label}
          </button>
        ))}
      </div>
      <div className="library-filters" role="search" aria-label="Bộ lọc">
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
          <span>Ngày</span>
          <select
            value={filters.days ? `d${filters.days}` : filters.date || pickDay ? 'pick' : ''}
            onChange={(e) => {
              const v = e.target.value;
              openCalendar.current = v === 'pick';
              setPickDay(v === 'pick');
              set(v === 'pick' ? { days: '' } : { days: v.slice(1) as LibraryFilters['days'], date: '' });
            }}
          >
            <option value="">Mọi ngày</option>
            <option value="d1">Hôm nay</option>
            <option value="d7">7 ngày qua</option>
            <option value="d30">30 ngày qua</option>
            <option value="pick">{filters.date ? filters.date.split('-').reverse().join('/') : 'Chọn một ngày…'}</option>
          </select>
        </label>
        {(pickDay || filters.date) && (
          <label className="library-field">
            <span className="sr-only">Ngày cụ thể</span>
            <input ref={calendar} type="date" value={filters.date} max={today()} onChange={(e) => set({ date: e.target.value })} />
          </label>
        )}
        <label className="library-field">
          <span>Tỉ lệ</span>
          <select value={filters.ratio} onChange={(e) => set({ ratio: e.target.value })}>
            <option value="">Tất cả</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
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
        {isAdmin && (
          <label className="library-toggle">
            <input type="checkbox" checked={filters.examplesOnly} onChange={(e) => set({ examplesOnly: e.target.checked })} />
            Đang ở Ví dụ
          </label>
        )}
        {active > 0 && (
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
        )}
      </div>

      {state === 'loading' && clips.length === 0 && (
        <div className={view === 'list' ? 'library-list library-skeleton' : 'grid library-skeleton'} style={{ '--card-min': SIZES[size] } as CSSProperties} role="status">
          <span className="sr-only">Đang tải...</span>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="skeleton" />
          ))}
        </div>
      )}
      {state === 'error' && <LoadError text="Không tải được thư viện." onRetry={() => (setState('loading'), load(0))} />}
      {state === 'ready' && clips.length === 0 && (
        <div className="library-empty">
          <EmptyArt search={active > 0} />
          {active > 0 ? (
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
      <div className={view === 'list' ? 'library-list' : 'grid'} style={{ '--card-min': SIZES[size] } as CSSProperties} aria-busy={state === 'loading'} hidden={clips.length === 0}>
        {clips.map((c, i) => (
          <Fragment key={c.id}>
          {headings.has(i) && <h2 className="lib-day">{headings.get(i)}</h2>}
          <ClipCard
            clip={c}
            view={view}
            select={zip.check(c.id, c.downloadName)}
            onChange={update}
            onDeleted={(id) => {
              uncount(clips.find((x) => x.id === id));
              setClips((cur) => cur.filter((x) => x.id !== id));
            }}
            onOpen={() => setDetail(i)}
          />
          </Fragment>
        ))}
      </div>
      {detail !== null && clips[detail] && <ClipDetail clips={clips} index={detail} stores={isAdmin ? stores : undefined} admin={isAdmin} onIndex={setDetail} onChange={update} />}
      {hasMore && (
        <button ref={moreButton} type="button" className="library-more" onClick={() => void loadMore()}>
          Tải thêm
        </button>
      )}
      {zip.bar}
    </section>
  );
}

