'use client';
import Link from 'next/link';
import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { api, type Clip, errorText, sendJson } from '@/lib/api';
import { FAULTS } from '@/lib/faults';
import { featureLabel } from '@/lib/features';
import { activeFilters, type LibraryFilters, type LibraryView, libraryQuery, NO_FILTERS, readView, saveView } from '@/lib/library-view';
import { reuseHref } from '@/lib/reuse';
import { Icon } from './Icon';
import { useFreshResults } from './jobs';
import { Modal } from './Modal';
import { useZipDownload } from './ZipDownload';

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
  { id: 'marketing_advanced', label: 'Nâng cao' },
  { id: 'apps', label: 'Ứng dụng' },
];
/** The size slider: card widths from small to large, remembered per browser. */
const SIZES = ['12rem', '16rem', '22rem'];
const SIZE_KEY = 'cvs.library.size';
const faultLabel = (id: string | null) => FAULTS.find((f) => f.id === id)?.label ?? id ?? '';

interface StoreOption {
  id: string;
  name: string;
  hidden: boolean;
}

/** `stores` is given to Admins only: it switches on the store control. A `list` row keeps the clip actions; marking and the store stay on the grid card. */
function ClipCard({ clip, view, stores, select, onChange, onDeleted, onOpen }: { clip: Clip; view: LibraryView; stores?: StoreOption[]; select?: ReactNode; onChange: (c: Clip) => void; onDeleted: (id: string) => void; onOpen: () => void }) {
  const [failing, setFailing] = useState(false);
  const [fault, setFault] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const image = clip.mediaType === 'image';
  const noun = image ? 'ảnh' : 'clip';

  async function mark(body: { verdict: 'pass'; featured?: boolean } | { verdict: 'fail'; fault: string }) {
    setProblem('');
    try {
      const r = await api<{ verdict: NonNullable<Clip['verdict']> }>(`/api/jobs/${clip.id}/verdict`, sendJson('PUT', body));
      onChange({ ...clip, verdict: r.verdict });
      setFailing(false);
      setFault('');
    } catch {
      setProblem('Không lưu được đánh giá.');
    }
  }

  async function reassign(storeId: string) {
    setProblem('');
    try {
      await api(`/api/admin/jobs/${clip.id}/store`, sendJson('PUT', { storeId: storeId || null }));
      onChange({ ...clip, storeId: storeId || null });
    } catch {
      setProblem('Không đổi được cửa hàng.');
    }
  }

  async function remove() {
    setProblem('');
    try {
      await api(`/api/jobs/${clip.id}`, { method: 'DELETE' });
      onDeleted(clip.id);
    } catch {
      setProblem(`Không xóa được ${noun}.`);
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
    <div className="actions" role="alertdialog" aria-label="Xác nhận xóa">
      <span>Xóa {noun} này?</span>
      <button type="button" onClick={() => void remove()}>
        Xác nhận xóa
      </button>
      <button type="button" onClick={() => setConfirmDelete(false)}>
        Hủy
      </button>
    </div>
  );

  if (view === 'list') {
    const thumb = image ? clip.videoAssetId : clip.posterAssetId;
    const verdict = clip.verdict && (clip.verdict.verdict === 'fail' ? `Không đạt · ${faultLabel(clip.verdict.fault)}` : clip.verdict.featured ? 'Nổi bật' : 'Đạt');
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
            {verdict && <span className={`lib-mark${clip.verdict!.verdict === 'fail' ? ' fail' : ''}`}>{verdict}</span>}
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
            <button type="button" className="danger icon-button" onClick={() => setConfirmDelete(true)} aria-label="Xóa" title="Xóa">
              <Icon name="x" />
            </button>
          )}
        </div>
        {confirm}
        {problem && <p className="error">{problem}</p>}
      </article>
    );
  }

  return (
    <article className="card" aria-label={name}>
      {select}
      {image ? (
        <img className="output" src={`/api/assets/${clip.videoAssetId}/content`} alt={clip.downloadName} loading="lazy" />
      ) : (
        <video
          controls
          playsInline
          preload="metadata"
          poster={clip.posterAssetId ? `/api/assets/${clip.posterAssetId}/content` : undefined}
          src={`/api/assets/${clip.videoAssetId}/content`}
          className={clip.ratio === '1:1' ? 'square' : 'tall'}
        />
      )}
      <p>
        <strong>{clip.creator.name}</strong>
        {clip.feature !== 'video' && <span className="tag feature-tag">{featureLabel(clip.feature)}</span>}
        {clip.isMock && <span className="badge">MOCK</span>}
      </p>
      <p className="muted">
        {fmtTime(clip.createdAt)} · {clip.modelLabel} · {clip.ratio} · {image ? clip.resolution : `${clip.durationSec} giây`}
      </p>
      <p>
        Chi phí thật: ${clip.costUsd}
        {!clip.costFinal && <span className="tag">Tạm tính</span>}
      </p>
      {clip.verdict && (
        <p>{clip.verdict.verdict === 'fail' ? `Kết quả: Không đạt (${faultLabel(clip.verdict.fault)})` : clip.verdict.featured ? 'Kết quả: Đạt · Nổi bật' : 'Kết quả: Đạt'}</p>
      )}
      {stores && (
        <label>
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
        {reuseHref(clip) && (
          <Link href={reuseHref(clip)!} className="button">
            Dùng lại
          </Link>
        )}
        {clip.canEdit && (
          <>
            <span className="verdict-buttons">
              <button type="button" aria-pressed={clip.verdict?.verdict === 'pass' && !clip.verdict.featured} onClick={() => void mark({ verdict: 'pass' })}>
                Đạt
              </button>
              {/* A Pass worth showing the whole company: Explore model cards show these first. */}
              <button type="button" aria-pressed={clip.verdict?.featured === true} title={`Đạt và đẹp, nên làm mẫu: ${noun} nổi bật hiện trước trên thẻ mô hình ở Khám phá`} onClick={() => void mark({ verdict: 'pass', featured: true })}>
                Nổi bật
              </button>
              <button type="button" aria-pressed={failing || clip.verdict?.verdict === 'fail'} onClick={() => setFailing((f) => !f)}>
                Không đạt
              </button>
            </span>
            <button type="button" className="danger icon-button" onClick={() => setConfirmDelete(true)} aria-label="Xóa" title="Xóa">
              <Icon name="x" />
            </button>
          </>
        )}
      </div>

      {failing && (
        <div className="actions">
          <label>
            Lỗi gặp phải
            <select value={fault} onChange={(e) => setFault(e.target.value)}>
              <option value="">Chọn lỗi</option>
              {FAULTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={!fault} onClick={() => void mark({ verdict: 'fail', fault })}>
            Xác nhận không đạt
          </button>
        </div>
      )}
      {confirm}
      {problem && <p className="error">{problem}</p>}
    </article>
  );
}

/** What the detail view reads from GET /api/jobs/:id beyond the Library row. */
interface ClipInputs {
  prompt: string | null;
  presetId: string | null;
  brief: string | null;
  format: string | null;
  images: { id: string; filename: string }[];
}

/**
 * Fash's item detail (survey L3): the result large on the left; beside it the title, the words behind it, the inputs, the length and ratio
 * chips, the date, download / fullscreen / open in a new tab / copy the words, and Dùng lại; arrows step through the loaded items.
 */
function ClipDetail({ clips, index, onIndex }: { clips: Clip[]; index: number; onIndex: (i: number | null) => void }) {
  const clip = clips[index]!;
  const image = clip.mediaType === 'image';
  const [job, setJob] = useState<ClipInputs | null>(null);
  const [note, setNote] = useState('');
  const media = useRef<HTMLVideoElement & HTMLImageElement>(null);
  const content = (id: string) => `/api/assets/${id}/content`;
  useEffect(() => {
    setJob(null);
    setNote('');
    api<ClipInputs>(`/api/jobs/${clip.id}`).then(setJob, () => setJob({ prompt: null, presetId: null, brief: null, format: null, images: [] }));
  }, [clip.id]);
  // The creator's own words: their brief (shown to them only), else a free prompt on Create video and Image Generation; others are composed.
  const text = job && (job.brief ?? ((clip.feature === 'video' && !job.presetId) || clip.feature === 'image' ? job.prompt : null));
  const title = clip.feature === 'marketing' ? (job?.format === 'advanced' ? 'Marketing nâng cao' : 'UGC Thử đồ') : featureLabel(clip.feature);

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
  const copy = () => act(async () => (await navigator.clipboard.writeText(text ?? ''), setNote('Đã sao chép.')), 'Không sao chép được.');

  return (
    <Modal open onClose={() => onIndex(null)} label={`Chi tiết: ${title}`} className="lightbox">
      <div className="lightbox-media">
        {image ? (
          <img ref={media} src={content(clip.videoAssetId)} alt={clip.downloadName} />
        ) : (
          <video key={clip.id} ref={media} controls autoPlay muted playsInline poster={clip.posterAssetId ? content(clip.posterAssetId) : undefined} src={content(clip.videoAssetId)} />
        )}
      </div>
      <div className="lightbox-side">
        <h2>{title}</h2>
        {text && <p className="job-text">{text}</p>}
        {job && job.images.length > 0 && clip.feature !== 'motion_control' && (
          <ul className="job-inputs" aria-label="Ảnh đầu vào">
            {job.images.map((i) => (
              <li key={i.id}>
                <img src={content(i.id)} alt={i.filename} />
              </li>
            ))}
          </ul>
        )}
        <p className="job-chips">
          <span>{image ? clip.resolution : `${clip.durationSec}s`}</span>
          <span>{clip.ratio}</span>
        </p>
        <p className="job-when">
          {clip.creator.name} · {fmtTime(clip.createdAt)}
        </p>
        {note && <p className="muted" role="status">{note}</p>}
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
          {text && (
            <button type="button" className="icon-button" onClick={() => void copy()} aria-label="Sao chép mô tả" title="Sao chép mô tả">
              <Icon name="copy" />
            </button>
          )}
        </div>
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
  const zip = useZipDownload({ hover: true });
  const [detail, setDetail] = useState<number | null>(null); // the item open in the detail view, by its place in the list
  const [filters, setFilters] = useState<LibraryFilters>(NO_FILTERS);
  const [search, setSearch] = useState(''); // the search box; its words reach the filters once typing pauses
  const [view, setView] = useState<LibraryView>('grid');
  const [size, setSize] = useState(1);
  const [clips, setClips] = useState<Clip[]>([]);
  const [creators, setCreators] = useState<{ id: string; name: string }[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const latest = useRef(0);
  const set = (patch: Partial<LibraryFilters>) => setFilters((cur) => ({ ...cur, ...patch }));
  const active = activeFilters(filters);

  const load = useCallback(
    async (offset: number) => {
      const ticket = ++latest.current;
      try {
        const r = await api<{ hasMore: boolean; isAdmin: boolean; creators: { id: string; name: string }[]; clips: Clip[] }>(`/api/library?${libraryQuery(filters, offset)}`);
        if (ticket !== latest.current) return;
        setIsAdmin(r.isAdmin);
        setClips((cur) => (offset > 0 ? [...cur, ...r.clips] : r.clips));
        setCreators(r.creators);
        setHasMore(r.hasMore);
        setState('ready');
      } catch {
        if (ticket === latest.current) setState('error');
      }
    },
    [filters],
  );

  useEffect(() => {
    setState('loading');
    void load(0);
  }, [load]);
  // shortcut: a fresh result reloads the first page, so pages added with "Xem thêm" close; merge them if that bothers anyone.
  useFreshResults(() => void load(0));

  useEffect(() => {
    const words = search.trim();
    const t = setTimeout(() => setFilters((cur) => (cur.q === words ? cur : { ...cur, q: words })), 300);
    return () => clearTimeout(t);
  }, [search]);

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
    setFilters((cur) => ({ ...NO_FILTERS, sort: cur.sort }));
  }

  useEffect(() => {
    if (isAdmin) api<{ stores: StoreOption[] }>('/api/admin/stores?includeHidden=1').then((r) => setStores(r.stores), () => null);
  }, [isAdmin]);

  return (
    <section className="library" aria-labelledby="library-title" data-selecting={zip.active}>
      <h1 id="library-title">Thư viện</h1>
      <p className="muted library-sub">Mọi thứ công ty đã tạo, ở cùng một chỗ.</p>
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
          <input type="date" value={filters.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <label className="library-field">
          <span>Tỉ lệ</span>
          <select value={filters.ratio} onChange={(e) => set({ ratio: e.target.value })}>
            <option value="">Tất cả</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
          </select>
        </label>
        <label className="library-toggle">
          <input type="checkbox" checked={filters.favoritesOnly} onChange={(e) => set({ favoritesOnly: e.target.checked })} aria-label="Chỉ mục yêu thích" />
          <Icon name="star" />
          Yêu thích
        </label>
        {active > 0 && (
          <span className="library-active">
            <span>{active} bộ lọc</span>
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
      {state === 'error' && <p className="error">Không tải được thư viện.</p>}
      {state === 'ready' && clips.length === 0 && (
        <div className="library-empty">
          <EmptyArt search={active > 0} />
          {active > 0 ? (
            <>
              <p className="library-empty-title">Chưa có clip nào khớp bộ lọc.</p>
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
          <ClipCard
            key={c.id}
            clip={c}
            view={view}
            stores={isAdmin ? stores : undefined}
            select={zip.check(c.id, c.downloadName)}
            // Under Favourites only an unmarked item leaves the list, so the next page's offset stays right.
            onChange={(next) => setClips((cur) => (filters.favoritesOnly && !next.favorite ? cur.filter((x) => x.id !== next.id) : cur.map((x) => (x.id === next.id ? next : x))))}
            onDeleted={(id) => setClips((cur) => cur.filter((x) => x.id !== id))}
            onOpen={() => setDetail(i)}
          />
        ))}
      </div>
      {detail !== null && clips[detail] && <ClipDetail clips={clips} index={detail} onIndex={setDetail} />}
      {hasMore && (
        <button type="button" className="library-more" onClick={() => void load(clips.length)}>
          Tải thêm
        </button>
      )}
      {zip.bar}
    </section>
  );
}

