'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Clip, errorText, sendJson } from '@/lib/api';
import { FAULTS } from '@/lib/faults';

const fmtTime = (iso: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));
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
      setProblem('Không xóa được clip.');
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
    <article className="card" aria-label={`Clip ${clip.downloadName}`}>
      <video
        controls
        playsInline
        preload="metadata"
        poster={clip.posterAssetId ? `/api/assets/${clip.posterAssetId}/content` : undefined}
        src={`/api/assets/${clip.videoAssetId}/content`}
        className={clip.ratio === '1:1' ? 'square' : 'tall'}
      />
      <p>
        <strong>{clip.creator.name}</strong>
        {clip.isMock && <span className="badge">MOCK</span>}
      </p>
      <p className="muted">
        {fmtTime(clip.createdAt)} · {clip.modelLabel} · {clip.ratio} · {clip.durationSec} giây
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
        <button type="button" onClick={() => void download()}>
          Tải xuống
        </button>
        <Link href={`/create?reuse=${clip.id}`} className="button">
          Dùng lại
        </Link>
        {clip.canEdit && (
          <>
            <button type="button" aria-pressed={clip.verdict?.verdict === 'pass'} onClick={() => void mark({ verdict: 'pass' })}>
              Đạt
            </button>
            <button type="button" aria-pressed={failing || clip.verdict?.verdict === 'fail'} onClick={() => setFailing((f) => !f)}>
              Không đạt
            </button>
            <button type="button" onClick={() => setConfirmDelete(true)}>
              Xóa
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
          <span>Xóa clip này?</span>
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
    [creator, date, ratio],
  );

  useEffect(() => {
    setState('loading');
    void load(0);
  }, [load]);

  useEffect(() => {
    if (isAdmin) api<{ stores: StoreOption[] }>('/api/admin/stores?includeHidden=1').then((r) => setStores(r.stores), () => null);
  }, [isAdmin]);

  return (
    <section aria-labelledby="library-title">
      <h1 id="library-title">Thư viện</h1>
      <div className="filters" role="search" aria-label="Bộ lọc">
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
      {state === 'ready' && clips.length === 0 && <p className="muted">Chưa có clip nào khớp bộ lọc.</p>}
      <div className="grid">
        {clips.map((c) => (
          <ClipCard
            key={c.id}
            clip={c}
            stores={isAdmin ? stores : undefined}
            onChange={(next) => setClips((cur) => cur.map((x) => (x.id === next.id ? next : x)))}
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
