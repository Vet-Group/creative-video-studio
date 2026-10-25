'use client';
import Link from 'next/link';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { api, type Clip, errorText, sendJson } from '@/lib/api';
import { FAULTS } from '@/lib/faults';
import { featureLabel } from '@/lib/features';
import { Icon } from './Icon';

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

/** `stores` is given to Admins only: it switches on the store control. */
function ClipCard({ clip, stores, onChange, onDeleted }: { clip: Clip; stores?: StoreOption[]; onChange: (c: Clip) => void; onDeleted: (id: string) => void }) {
  const [failing, setFailing] = useState(false);
  const [fault, setFault] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const image = clip.mediaType === 'image';
  const noun = image ? 'ảnh' : 'clip';

  async function mark(body: { verdict: 'pass' } | { verdict: 'fail'; fault: string }) {
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

  return (
    <article className="card" aria-label={`${image ? 'Ảnh' : 'Clip'} ${clip.downloadName}`}>
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
      {clip.verdict && <p>{clip.verdict.verdict === 'pass' ? 'Kết quả: Đạt' : `Kết quả: Không đạt (${faultLabel(clip.verdict.fault)})`}</p>}
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
        {!image && (
          <Link href={`/create?reuse=${clip.id}`} className="button">
            Dùng lại
          </Link>
        )}
        {clip.canEdit && (
          <>
            <span className="verdict-buttons">
              <button type="button" aria-pressed={clip.verdict?.verdict === 'pass'} onClick={() => void mark({ verdict: 'pass' })}>
                Đạt
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
      {confirmDelete && (
        <div className="actions" role="alertdialog" aria-label="Xác nhận xóa">
          <span>Xóa {noun} này?</span>
          <button type="button" onClick={() => void remove()}>
            Xác nhận xóa
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)}>
            Hủy
          </button>
        </div>
      )}
      {problem && <p className="error">{problem}</p>}
    </article>
  );
}

export function Library() {
  const [creator, setCreator] = useState('');
  const [date, setDate] = useState('');
  const [ratio, setRatio] = useState('');
  const [kind, setKind] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [size, setSize] = useState(1);
  const [clips, setClips] = useState<Clip[]>([]);
  const [creators, setCreators] = useState<{ id: string; name: string }[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const latest = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const ticket = ++latest.current;
      const q = new URLSearchParams();
      if (creator) q.set('creator', creator);
      if (date) q.set('date', date);
      if (ratio) q.set('ratio', ratio);
      if (kind !== 'all') q.set('kind', kind);
      if (favoritesOnly) q.set('favorites', '1');
      if (sort !== 'newest') q.set('sort', sort);
      if (offset > 0) q.set('offset', String(offset));
      try {
        const r = await api<{ hasMore: boolean; isAdmin: boolean; creators: { id: string; name: string }[]; clips: Clip[] }>(`/api/library?${q}`);
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
    [creator, date, ratio, kind, favoritesOnly, sort],
  );

  useEffect(() => {
    setState('loading');
    void load(0);
  }, [load]);

  useEffect(() => {
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

  useEffect(() => {
    if (isAdmin) api<{ stores: StoreOption[] }>('/api/admin/stores?includeHidden=1').then((r) => setStores(r.stores), () => null);
  }, [isAdmin]);

  return (
    <section className="library" aria-labelledby="library-title">
      <h1 id="library-title">Thư viện</h1>
      <p className="muted library-sub">Mọi thứ công ty đã tạo, ở cùng một chỗ.</p>
      <div className="kinds" role="group" aria-label="Loại">
        {KINDS.map((k) => (
          <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      <div className="library-tools">
        <label className="check">
          <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} />
          Chỉ mục yêu thích
        </label>
        <label>
          <span className="sr-only">Sắp xếp</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')}>
            <option value="newest">Mới nhất trước</option>
            <option value="oldest">Cũ nhất trước</option>
          </select>
        </label>
        <label className="library-size">
          <span className="sr-only">Cỡ ô</span>
          <Icon name="library" />
          <input type="range" min={0} max={SIZES.length - 1} step={1} value={size} onChange={(e) => resize(Number(e.target.value))} aria-valuetext={['Nhỏ', 'Vừa', 'Lớn'][size]} />
          <Icon name="ratio" />
        </label>
      </div>
      <div className="filters library-filters" role="search" aria-label="Bộ lọc">
        <label>
          Người tạo
          <select value={creator} onChange={(e) => setCreator(e.target.value)}>
            <option value="">Tất cả</option>
            {creators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ngày
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Tỉ lệ
          <select value={ratio} onChange={(e) => setRatio(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
          </select>
        </label>
      </div>

      {state === 'loading' && <p role="status">Đang tải...</p>}
      {state === 'error' && <p className="error">Không tải được thư viện.</p>}
      {state === 'ready' && clips.length === 0 && (
        <div className="library-empty">
          <Icon name="library" size={40} />
          <p className="muted">Chưa có clip nào khớp bộ lọc.</p>
          <Link href="/explore" className="button">
            Bắt đầu tạo
          </Link>
        </div>
      )}
      <div className="grid" style={{ '--card-min': SIZES[size] } as CSSProperties}>
        {clips.map((c) => (
          <ClipCard
            key={c.id}
            clip={c}
            stores={isAdmin ? stores : undefined}
            // Under Favourites only an unmarked item leaves the list, so the next page's offset stays right.
            onChange={(next) => setClips((cur) => (favoritesOnly && !next.favorite ? cur.filter((x) => x.id !== next.id) : cur.map((x) => (x.id === next.id ? next : x))))}
            onDeleted={(id) => setClips((cur) => cur.filter((x) => x.id !== id))}
          />
        ))}
      </div>
      {hasMore && (
        <button type="button" onClick={() => void load(clips.length)}>
          Tải thêm
        </button>
      )}
    </section>
  );
}
