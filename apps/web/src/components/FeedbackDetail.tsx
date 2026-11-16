'use client';

// One board item (/feedback/[id]): full content and images, upvote, where it stands, the technical team's reply, comments, and — for an Admin — the status and reply controls.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FEEDBACK_STATUSES, type FeedbackStatus } from '@cvs/db';
import { ApiError, api, errorText, sendJson, thumbUrl } from '@/lib/api';
import { COMMENT_MAX, type FeedbackComment, feedbackTime, KIND_LABEL, type ListedFeedback, NOTE_MAX, STATUS_LABEL } from '@/lib/feedback';
import { avatarColor, initials } from '@/lib/profile';
import { Icon } from './Icon';
import { LoadError } from './LoadError';
import { RichText } from './RichText';

/** How a reply can be written; the same words sit under the Admin's reply box. */
const FORMAT_HINT = 'Dòng trống để tách đoạn. Bắt đầu dòng bằng "1." hoặc "-" để thành danh sách. **chữ đậm**. Link tự nhận.';

export function FeedbackDetail({ id, isAdmin }: { id: string; isAdmin: boolean }) {
  const [item, setItem] = useState<ListedFeedback | null>(null);
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  const [voteError, setVoteError] = useState(false);

  useEffect(() => {
    let live = true;
    setState('loading');
    api<{ item: ListedFeedback; comments: FeedbackComment[] }>(`/api/feedback/${id}`)
      .then((r) => {
        if (!live) return;
        setItem(r.item);
        setComments(r.comments);
        setState('ready');
      })
      .catch((e) => live && setState(e instanceof ApiError && e.status === 404 ? 'missing' : 'error'));
    return () => {
      live = false;
    };
  }, [id, reload]);

  async function toggleVote() {
    if (!item) return;
    const prev = item;
    setVoteError(false);
    setItem({ ...item, voted: !item.voted, votes: item.votes + (item.voted ? -1 : 1) });
    try {
      const r = await api<{ voted: boolean; votes: number }>(`/api/feedback/${id}/vote`, { method: 'PUT' });
      setItem((x) => (x ? { ...x, voted: r.voted, votes: r.votes } : x));
    } catch {
      setItem(prev);
      setVoteError(true);
    }
  }

  const back = (
    <Link href="/feedback" className="fb-back">
      <Icon name="left" /> Về danh sách
    </Link>
  );
  if (state === 'loading')
    return (
      <div className="fb fb-detail">
        <p className="muted" role="status">
          Đang tải…
        </p>
      </div>
    );
  if (state === 'error')
    return (
      <div className="fb fb-detail">
        {back}
        <LoadError text="Không tải được góp ý này." onRetry={() => setReload((n) => n + 1)} />
      </div>
    );
  if (state === 'missing' || !item)
    return (
      <div className="fb fb-detail">
        {back}
        <p className="muted">Không tìm thấy góp ý này. Có thể nó đã bị xoá hoặc đường dẫn bị sai.</p>
      </div>
    );

  return (
    <div className="fb fb-detail">
      {back}
      <article className="fb-card">
        <header className="fb-detail-head">
          <button type="button" className={`fb-vote${item.voted ? ' on' : ''}`} onClick={() => void toggleVote()} aria-pressed={item.voted} aria-label={`Bình chọn (${item.votes})`}>
            <span aria-hidden="true">▲</span>
            {item.votes}
          </button>
          <div className="fb-detail-title">
            <h1>{item.title}</h1>
            <div className="fb-meta">
              <span className={`fb-tag k-${item.kind}`}>{KIND_LABEL[item.kind]}</span>
              <span className="fb-author">
                <Avatar name={item.authorName} />
                {item.authorName}
              </span>
              <span className="muted">{feedbackTime(item.createdAt)}</span>
            </div>
          </div>
        </header>
        {voteError && (
          <p className="fb-error" role="alert">
            Chưa bình chọn được. Hãy thử lại.
          </p>
        )}
        <StatusSteps status={item.status} />
        <RichText text={item.body} className="fb-text" />
        {item.imageAssetIds.length > 0 && (
          <ul className="fb-images" aria-label={`${item.imageAssetIds.length} ảnh đính kèm`}>
            {item.imageAssetIds.map((aid, i) => (
              <li key={aid}>
                <a href={`/api/assets/${aid}/content`} target="_blank" rel="noreferrer" aria-label={`Mở ảnh ${i + 1} ở thẻ mới`}>
                  <img src={thumbUrl(aid, 480)} alt="" loading="lazy" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </article>

      {item.adminNote && (
        <section className={`fb-reply s-${item.status}`} aria-labelledby="fb-reply-title">
          <header>
            <span className="fb-team" aria-hidden="true">
              <Icon name="check" size={13} />
            </span>
            <h2 id="fb-reply-title">Phản hồi từ đội kỹ thuật</h2>
            <span className={`fb-tag s-${item.status}`}>{STATUS_LABEL[item.status]}</span>
            <span className="muted">Cập nhật {feedbackTime(item.updatedAt)}</span>
          </header>
          <RichText text={item.adminNote} />
        </section>
      )}

      {isAdmin && <AdminControls item={item} onSaved={(next) => setItem(next)} />}

      <section className="fb-comments" aria-labelledby="fb-comments-title">
        <h2 id="fb-comments-title">Bình luận ({comments.length})</h2>
        {comments.length === 0 && <p className="muted">Chưa có bình luận. Bạn có thể hỏi thêm hoặc bổ sung chi tiết ở đây.</p>}
        <ul>
          {comments.map((c) => (
            <li key={c.id} className={c.authorAdmin ? 'by-team' : undefined}>
              <Avatar name={c.authorName} />
              <div className="fb-comment-body">
                <div className="fb-meta">
                  <b>{c.authorName}</b>
                  {c.authorAdmin && <span className="fb-tag team">Đội kỹ thuật</span>}
                  <span className="muted">{feedbackTime(c.createdAt)}</span>
                </div>
                <RichText text={c.body} className="fb-text" />
              </div>
            </li>
          ))}
        </ul>
        <CommentForm id={id} onAdded={(c) => setComments((xs) => [...xs, c])} />
      </section>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="fb-avatar" style={{ background: avatarColor(name) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** New → Đang xem → Đã xử lý (or Từ chối), with the current step marked. */
function StatusSteps({ status }: { status: FeedbackStatus }) {
  const steps: FeedbackStatus[] = ['new', 'reviewing', status === 'rejected' ? 'rejected' : 'done'];
  const at = steps.indexOf(status);
  return (
    <ol className={`fb-steps s-${status}`} aria-label="Tiến độ xử lý">
      {steps.map((s, i) => (
        <li key={s} className={i < at ? 'past' : i === at ? 'now' : undefined} aria-current={i === at ? 'step' : undefined}>
          {STATUS_LABEL[s]}
        </li>
      ))}
    </ol>
  );
}

function AdminControls({ item, onSaved }: { item: ListedFeedback; onSaved: (next: ListedFeedback) => void }) {
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [note, setNote] = useState(item.adminNote ?? '');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changed = status !== item.status || (note.trim() || null) !== item.adminNote;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/feedback/${item.id}`, sendJson('PATCH', { status, adminNote: note.trim() || null }));
      onSaved({ ...item, status, adminNote: note.trim() || null, updatedAt: new Date().toISOString() });
      setSaved(true);
    } catch (e) {
      setError(errorText(e, 'Không lưu được. Hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="fb-admin">
      <legend>Xử lý (Admin)</legend>
      <label className="fb-admin-status">
        Trạng thái
        <select value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)}>
          {FEEDBACK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="fb-admin-note">
        <div className="fb-admin-note-head">
          <label htmlFor={`fb-note-${item.id}`}>Phản hồi cho người gửi</label>
          <button type="button" className="link-button" aria-pressed={preview} onClick={() => setPreview((p) => !p)}>
            {preview ? 'Sửa' : 'Xem trước'}
          </button>
        </div>
        {preview ? (
          <div className="fb-preview" aria-label="Xem trước phản hồi">
            {note.trim() ? <RichText text={note} /> : <p className="muted">Chưa có nội dung.</p>}
          </div>
        ) : (
          <textarea id={`fb-note-${item.id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} rows={10} placeholder="Để trống nếu chưa phản hồi" aria-describedby={`fb-note-hint-${item.id}`} />
        )}
        <p className="muted fb-hint" id={`fb-note-hint-${item.id}`}>
          {FORMAT_HINT}
        </p>
      </div>
      {error && (
        <p className="fb-error" role="alert">
          {error}
        </p>
      )}
      <div className="fb-admin-actions">
        <button type="button" className="fb-new" onClick={() => void save()} disabled={busy || !changed}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </button>
        <span className="muted" role="status">
          {saved && !changed ? 'Đã lưu.' : ''}
        </span>
      </div>
    </fieldset>
  );
}

function CommentForm({ id, onAdded }: { id: string; onAdded: (c: FeedbackComment) => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy || body.trim().length < 1) return;
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
    <form
      className="fb-comment-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        maxLength={COMMENT_MAX}
        rows={3}
        placeholder="Viết bình luận…"
        aria-label="Bình luận"
      />
      {error && (
        <p className="fb-error" role="alert">
          {error}
        </p>
      )}
      <div className="fb-comment-actions">
        <span className="muted">Ctrl + Enter để gửi</span>
        <button type="submit" disabled={busy || body.trim().length < 1}>
          {busy ? 'Đang gửi…' : 'Gửi bình luận'}
        </button>
      </div>
    </form>
  );
}
