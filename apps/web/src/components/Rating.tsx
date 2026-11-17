'use client';

// The in-app satisfaction rating (lib/rating.ts): the 1-10 control, the prompt card of the app shell and the always-open block on the Feedback page.
import { useEffect, useId, useState } from 'react';
import { api, sendJson } from '@/lib/api';
import { RATING_COMMENT_MAX, RATING_SCORES, RATING_SENT_EVENT } from '@/lib/rating';

const QUESTION = 'Bạn chấm Creative Video Studio mấy điểm?';

/** Ten radio buttons, then (once a score is picked) the optional comment. `onLater` adds the snooze button. */
function RatingForm({ onSent, onLater }: { onSent: () => void; onLater?: () => void }) {
  const name = useId();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState('');

  async function send() {
    setPending(true);
    setProblem('');
    try {
      await api('/api/rating', sendJson('POST', { score, comment }));
      onSent();
    } catch {
      setProblem('Chưa gửi được. Hãy thử lại.');
      setPending(false);
    }
  }

  return (
    <form
      className="rating-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (score) void send();
      }}
    >
      <div className="rating-scores" role="radiogroup" aria-label="Điểm hài lòng từ 1 đến 10">
        {RATING_SCORES.map((n) => (
          <label key={n} className="rating-score">
            <input type="radio" name={name} value={n} checked={score === n} onChange={() => setScore(n)} />
            <span aria-hidden="true">{n}</span>
            <span className="sr-only">{n} điểm</span>
          </label>
        ))}
      </div>
      <p className="rating-ends muted" aria-hidden="true">
        <span>1 = Rất không hài lòng</span>
        <span>10 = Rất hài lòng</span>
      </p>
      {score > 0 && (
        <label className="rating-comment">
          <span>Điều gì sẽ giúp bạn chấm cao hơn?</span>
          <textarea value={comment} maxLength={RATING_COMMENT_MAX} rows={2} onChange={(e) => setComment(e.target.value)} />
        </label>
      )}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="rating-actions">
        {onLater && (
          <button type="button" disabled={pending} onClick={onLater}>
            Để sau
          </button>
        )}
        <button type="submit" className="primary" disabled={!score || pending}>
          Gửi
        </button>
      </div>
    </form>
  );
}

/**
 * A small card in a corner of the app shell (a bottom sheet on a phone) that asks for a score when GET /api/rating says it is due, asked once per page
 * load. It never blocks the page: no backdrop, nothing inert. Snoozing keeps it away for a week; a sent score shows a short thanks, then it goes.
 */
export function RatingPrompt() {
  const [state, setState] = useState<'hidden' | 'asking' | 'thanks'>('hidden');
  useEffect(() => {
    let live = true;
    api<{ due: boolean }>('/api/rating')
      .then((r) => live && r.due && setState('asking'))
      .catch(() => {}); // no prompt is better than an error on every page
    const hide = () => setState('hidden');
    window.addEventListener(RATING_SENT_EVENT, hide);
    return () => {
      live = false;
      window.removeEventListener(RATING_SENT_EVENT, hide);
    };
  }, []);
  useEffect(() => {
    if (state !== 'thanks') return;
    const t = setTimeout(() => setState('hidden'), 3000);
    return () => clearTimeout(t);
  }, [state]);

  if (state === 'hidden') return null;
  return (
    <aside className="rating-card" aria-label="Chấm điểm Creative Video Studio">
      {state === 'thanks' ? (
        <p role="status">Cảm ơn bạn!</p>
      ) : (
        <>
          <p className="rating-title">{QUESTION}</p>
          <RatingForm
            onSent={() => setState('thanks')}
            onLater={() => {
              setState('hidden');
              void api('/api/rating/snooze', { method: 'POST' }).catch(() => {});
            }}
          />
        </>
      )}
    </aside>
  );
}

/** The Feedback page's rating block: the same control, open at any time. */
export function RatingBlock() {
  const [sent, setSent] = useState(false);
  return (
    <section className="rating-block" aria-labelledby="rating-block-title">
      <h2 id="rating-block-title">Chấm điểm app</h2>
      <p className="muted">{QUESTION}</p>
      {sent ? (
        <p role="status">Cảm ơn bạn!</p>
      ) : (
        <RatingForm
          onSent={() => {
            setSent(true);
            window.dispatchEvent(new Event(RATING_SENT_EVENT));
          }}
        />
      )}
    </section>
  );
}
