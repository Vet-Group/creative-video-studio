'use client';

// The feedback board (/feedback): every member sees all items, posts one (with images), upvotes and opens an item to comment. An Admin triages on the item page.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FEEDBACK_KINDS, FEEDBACK_STATUSES, type FeedbackKind } from '@cvs/db';
import { ApiError, api, errorText, sendJson, thumbUrl } from '@/lib/api';
import { BODY_MAX, feedbackTime, KIND_LABEL, type ListedFeedback, MAX_IMAGES, STATUS_LABEL, TITLE_MAX } from '@/lib/feedback';

type Sort = 'new' | 'top';
interface UploadedImage {
  id: string;
}

export function Feedback() {
  const [items, setItems] = useState<ListedFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [kindFilter, setKindFilter] = useState<FeedbackKind | ''>('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError(false);
    const q = new URLSearchParams();
    if (kindFilter) q.set('kind', kindFilter);
    if (statusFilter) q.set('status', statusFilter);
    if (sort === 'top') q.set('sort', 'top');
    api<{ items: ListedFeedback[] }>(`/api/feedback?${q.toString()}`)
      .then((r) => live && setItems(r.items))
      .catch(() => live && setLoadError(true))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [kindFilter, statusFilter, sort]);

  async function toggleVote(it: ListedFeedback) {
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, voted: !x.voted, votes: x.votes + (x.voted ? -1 : 1) } : x)));
    try {
      const r = await api<{ voted: boolean; votes: number }>(`/api/feedback/${it.id}/vote`, { method: 'PUT' });
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, voted: r.voted, votes: r.votes } : x)));
    } catch {
      setItems(prev);
    }
  }

  return (
    <div className="fb">
      <header className="fb-head">
        <div>
          <h1>Góp ý &amp; Yêu cầu</h1>
          <p className="muted">Gửi góp ý, báo lỗi hay đề xuất tính năng cho Creative Video Studio. Mọi người cùng xem và bình chọn; đội kỹ thuật phản hồi trạng thái.</p>
        </div>
        <button type="button" className="fb-new" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Đóng' : 'Gửi góp ý'}
        </button>
      </header>

      {open && <SubmitForm onDone={(created) => { setItems((xs) => [created, ...xs]); setOpen(false); }} />}

      <div className="fb-filters">
        <label>
          Loại
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as FeedbackKind | '')}>
            <option value="">Tất cả</option>
            {FEEDBACK_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Trạng thái
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tất cả</option>
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sắp xếp
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="new">Mới nhất</option>
            <option value="top">Nhiều bình chọn</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : loadError ? (
        <p className="muted">Không tải được danh sách. Hãy thử lại.</p>
      ) : items.length === 0 ? (
        <p className="muted">Chưa có góp ý nào. Hãy là người đầu tiên!</p>
      ) : (
        <ul className="fb-list">
          {items.map((it) => (
            <li key={it.id} className="fb-item">
              <button type="button" className={`fb-vote${it.voted ? ' on' : ''}`} onClick={() => void toggleVote(it)} aria-pressed={it.voted} aria-label={`Bình chọn (${it.votes})`}>
                <span aria-hidden="true">▲</span>
                {it.votes}
              </button>
              <div className="fb-body">
                <Link href={`/feedback/${it.id}`} className="fb-title">
                  {it.title}
                </Link>
                <div className="fb-meta">
                  <span className={`fb-tag k-${it.kind}`}>{KIND_LABEL[it.kind]}</span>
                  <span className={`fb-tag s-${it.status}`}>{STATUS_LABEL[it.status]}</span>
                  <span className="muted">
                    {it.authorName} · {feedbackTime(it.createdAt)} · {it.comments} bình luận
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubmitForm({ onDone }: { onDone: (created: ListedFeedback) => void }) {
  const [kind, setKind] = useState<FeedbackKind>('feedback');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function addFiles(files: FileList | null) {
    setError(null);
    if (!files || files.length === 0) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setError(`Tối đa ${MAX_IMAGES} ảnh.`);
      return;
    }
    const form = new FormData();
    for (const f of Array.from(files).slice(0, room)) form.append('file', f);
    setUploading(true);
    try {
      const r = await api<{ assets: { id: string }[] }>('/api/assets', { method: 'POST', body: form });
      setImages((xs) => [...xs, ...r.assets.map((a) => ({ id: a.id }))]);
    } catch (e) {
      setError(errorText(e, 'Không tải được ảnh. Hãy thử ảnh JPEG/PNG/WebP dưới 10 MB.'));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function submit() {
    setError(null);
    if (title.trim().length < 1 || body.trim().length < 1) {
      setError('Hãy nhập tiêu đề và nội dung.');
      return;
    }
    setBusy(true);
    try {
      const created = await api<ListedFeedback>('/api/feedback', sendJson('POST', { kind, title: title.trim(), body: body.trim(), assetIds: images.map((i) => i.id) }));
      onDone(created);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? 'Bạn gửi quá nhiều góp ý trong một giờ. Vui lòng thử lại sau.' : errorText(e, 'Không gửi được. Hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="fb-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label>
        Loại
        <select value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)}>
          {FEEDBACK_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tiêu đề
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} placeholder="Tóm tắt ngắn gọn" required />
      </label>
      <label>
        Nội dung chi tiết
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={BODY_MAX} rows={5} placeholder="Mô tả rõ: bạn muốn gì, gặp vấn đề gì, các bước tái hiện…" required />
      </label>
      <div className="fb-uploads">
        <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading || images.length >= MAX_IMAGES}>
          {uploading ? 'Đang tải ảnh…' : `Đính kèm ảnh (${images.length}/${MAX_IMAGES})`}
        </button>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
        {images.length > 0 && (
          <ul className="fb-thumbs">
            {images.map((img) => (
              <li key={img.id}>
                <img src={thumbUrl(img.id)} alt="" />
                <button type="button" aria-label="Bỏ ảnh" onClick={() => setImages((xs) => xs.filter((x) => x.id !== img.id))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="fb-error">{error}</p>}
      <div className="fb-actions">
        <button type="submit" className="fb-new" disabled={busy || uploading}>
          {busy ? 'Đang gửi…' : 'Gửi'}
        </button>
      </div>
    </form>
  );
}
