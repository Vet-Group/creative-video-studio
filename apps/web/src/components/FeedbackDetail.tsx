'use client';

// One board item (/feedback/[id]): full content and images, upvote, comments, and — for an Admin — the status and reply controls.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FEEDBACK_STATUSES, type FeedbackStatus } from '@cvs/db';
import { api, errorText, sendJson } from '@/lib/api';
import { COMMENT_MAX, type FeedbackComment, feedbackTime, KIND_LABEL, type ListedFeedback, NOTE_MAX, STATUS_LABEL } from '@/lib/feedback';

export function FeedbackDetail({ id, isAdmin }: { id: string; isAdmin: boolean }) {
  const [item, setItem] = useState<ListedFeedback | null>(null);
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let live = true;
    api<{ item: ListedFeedback; comments: FeedbackComment[] }>(`/api/feedback/${id}`)
      .then((r) => {
        if (!live) return;
        setItem(r.item);
        setComments(r.comments);
        setState('ready');
      })
      .catch(() => live && setState('missing'));
    return () => {
      live = false;
    };
  }, [id]);

  async function toggleVote() {
    if (!item) return;
    const prev = item;
    setItem({ ...item, voted: !item.voted, votes: item.votes + (item.voted ? -1 : 1) });
    try {
      const r = await api<{ voted: boolean; votes: number }>(`/api/feedback/${id}/vote`, { method: 'PUT' });
      setItem((x) => (x ? { ...x, voted: r.voted, votes: r.votes } : x));
    } catch {
      setItem(prev);
    }
  }

  if (state === 'loading') return <p className="muted" role="status">Đang tải…</p>;
  if (state === 'missing' || !item)
    return (
      <p className="muted">
        Không tìm thấy góp ý này. <Link href="/feedback">Về danh sách</Link>
      </p>
    );

  return (
    <div className="fb fb-detail">
      <p>
        <Link href="/feedback">← Về danh sách</Link>
      </p>
      <header className="fb-detail-head">
        <button type="button" className={`fb-vote${item.voted ? ' on' : ''}`} onClick={() => void toggleVote()} aria-pressed={item.voted} aria-label={`Bình chọn (${item.votes})`}>
          <span aria-hidden="true">▲</span>
          {item.votes}
        </button>
        <div>
          <h1>{item.title}</h1>
          <div className="fb-meta">
            <span className={`fb-tag k-${item.kind}`}>{KIND_LABEL[item.kind]}</span>
            <span className={`fb-tag s-${item.status}`}>{STATUS_LABEL[item.status]}</span>
            <span className="muted">
              {item.authorName} · {feedbackTime(item.createdAt)}
            </span>
          </div>
        </div>
      </header>

      <p className="fb-text">{item.body}</p>

      {item.imageAssetIds.length > 0 && (
        <ul className="fb-images">
          {item.imageAssetIds.map((aid) => (
            <li key={aid}>
              <a href={`/api/assets/${aid}/content`} target="_blank" rel="noreferrer">
                <img src={`/api/assets/${aid}/content`} alt="Ảnh đính kèm" loading="lazy" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {item.adminNote && (
        <div className="fb-reply">
          <b>Phản hồi từ đội kỹ thuật:</b> {item.adminNote}
        </div>
      )}

      {isAdmin && <AdminControls item={item} onSaved={(next) => setItem(next)} />}

      <section className="fb-comments">
        <h2>Bình luận ({comments.length})</h2>
        <ul>
          {comments.map((c) => (
            <li key={c.id}>
              <div className="fb-meta">
                <b>{c.authorName}</b>
                <span className="muted">{feedbackTime(c.createdAt)}</span>
              </div>
              <p className="fb-text">{c.body}</p>
            </li>
          ))}
        </ul>
        <CommentForm id={id} onAdded={(c) => setComments((xs) => [...xs, c])} />
      </section>
    </div>
  );
}

function AdminControls({ item, onSaved }: { item: ListedFeedback; onSaved: (next: ListedFeedback) => void }) {
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [note, setNote] = useState(item.adminNote ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/feedback/${item.id}`, sendJson('PATCH', { status, adminNote: note.trim() || null }));
      onSaved({ ...item, status, adminNote: note.trim() || null });
    } catch (e) {
      setError(errorText(e, 'Không lưu được. Hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="fb-admin admin">
      <legend>Xử lý (Admin)</legend>
      <label>
        Trạng thái
        <select value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)}>
          {FEEDBACK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Phản hồi cho người gửi
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} rows={3} placeholder="Để trống nếu chưa phản hồi" />
      </label>
      {error && <p className="fb-error" role="alert">{error}</p>}
      <button type="button" onClick={() => void save()} disabled={busy}>
        {busy ? 'Đang lưu…' : 'Lưu'}
      </button>
    </fieldset>
  );
}

function CommentForm({ id, onAdded }: { id: string; onAdded: (c: FeedbackComment) => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (body.trim().length < 1) return;
    setBusy(true);
    setError(null);
    try {
      const c = await api<FeedbackComment>(`/api/feedback/${id}/comments`, sendJson('POST', { body: body.trim() }));
      onAdded(c);
      setBody('');
    } catch (e) {
      setError(errorText(e, 'Không gửi được bình luận. Hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="fb-comment-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={COMMENT_MAX} rows={2} placeholder="Viết bình luận…" aria-label="Bình luận" />
      {error && <p className="fb-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy || body.trim().length < 1}>
        {busy ? 'Đang gửi…' : 'Gửi bình luận'}
      </button>
    </form>
  );
}
