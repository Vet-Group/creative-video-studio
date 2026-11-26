'use client';

// The in-app satisfaction rating (lib/rating.ts): the 1-10 control, the prompt card of the app shell, the row under a result that just finished
// and the always-open block on the Feedback page.
import { useEffect, useId, useState } from 'react';
import { api, sendJson, type TrayJob } from '@/lib/api';
import { RATING_COMMENT_MAX, RATING_SCORES, RATING_SENT_EVENT, ratingFollowUp } from '@/lib/rating';
import { useJobs } from './jobs';

const QUESTION = 'Bạn chấm Creative Video Studio mấy điểm?';

/**
 * Ten radio buttons, then (once a score is picked) the optional comment. `onLater` adds the snooze button. `compact` (the row under a result) leaves
 * out the scale's ends and shows the send button only once a score is picked, so it starts as one line of scores. A score sent fires RATING_SENT_EVENT.
 */
export function RatingForm({ onSent, onLater, compact = false }: { onSent: () => void; onLater?: () => void; compact?: boolean }) {
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
      window.dispatchEvent(new Event(RATING_SENT_EVENT));
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
      {!compact && (
        <p className="rating-ends muted" aria-hidden="true">
          <span>1 = Rất không hài lòng</span>
          <span>10 = Rất hài lòng</span>
        </p>
      )}
      {score > 0 && (
        <label className="rating-comment">
          <span>{ratingFollowUp(score)}</span>
          <textarea value={comment} maxLength={RATING_COMMENT_MAX} rows={2} onChange={(e) => setComment(e.target.value)} />
        </label>
      )}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {(!compact || score > 0) && (
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
      )}
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
    const hide = () => setState((s) => (s === 'thanks' ? s : 'hidden')); // a score sent from this card keeps its thanks
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

type InlineState = 'open' | 'picked' | 'thanks' | 'gone';

/** Whether a History card's job is the newest result of its feature in the member's list (newest first). */
export const newestResult = (job: TrayJob, jobs: readonly TrayJob[]): boolean => jobs.find((j) => j.feature === job.feature && j.status === 'succeeded')?.id === job.id;

/**
 * Whether the row under a History card asks: its result arrived while the card was open (`waited`), the rating is due (GET /api/rating) and the card
 * holds the newest result, or the member has already picked a score there (a newer result then does not take the row from under the answer).
 */
export const inlineRatingShows = ({ waited, due, newest, state }: { waited: boolean; due: boolean | null; newest: boolean; state: InlineState }): boolean =>
  waited && due === true && (state === 'open' ? newest : state !== 'gone');

/**
 * The same question right under a result that just finished, on its History card, asked when GET /api/rating says it is due (never to a system account
 * or an Admin signed in as the member). Its later button is the card's snooze; a score sent here, in the card or on the Feedback page hides every place asking.
 */
export function InlineRating({ job }: { job: TrayJob }) {
  const { jobs } = useJobs();
  const [waited] = useState(job.status !== 'succeeded'); // as the card's reveal: a result already there when the card first showed is no news
  const newest = newestResult(job, jobs);
  const [due, setDue] = useState<boolean | null>(null);
  const [state, setState] = useState<InlineState>('open');
  const question = useId();
  const ask = waited && newest && due === null;
  useEffect(() => {
    if (!ask) return;
    let live = true;
    api<{ due: boolean }>('/api/rating').then(
      (r) => live && setDue(r.due),
      () => live && setDue(false),
    );
    return () => {
      live = false;
    };
  }, [ask]);
  useEffect(() => {
    const hide = () => setState((s) => (s === 'thanks' ? s : 'gone'));
    window.addEventListener(RATING_SENT_EVENT, hide);
    return () => window.removeEventListener(RATING_SENT_EVENT, hide);
  }, []);
  useEffect(() => {
    if (state !== 'thanks') return;
    const t = setTimeout(() => setState('gone'), 3000);
    return () => clearTimeout(t);
  }, [state]);

  if (!inlineRatingShows({ waited, due, newest, state })) return null;
  if (state === 'thanks') return <p className="rating-inline" role="status">Cảm ơn bạn!</p>;
  return (
    <div className="rating-inline" role="group" aria-labelledby={question} onChange={() => setState((s) => (s === 'open' ? 'picked' : s))}>
      <div className="rating-inline-head">
        <p id={question}>{QUESTION}</p>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setState('gone');
            void api('/api/rating/snooze', { method: 'POST' }).catch(() => {});
          }}
        >
          Để sau
        </button>
      </div>
      <RatingForm compact onSent={() => setState('thanks')} />
    </div>
  );
}

/** The Feedback page's rating block: the same control, open at any time. */
export function RatingBlock() {
  const [sent, setSent] = useState(false);
  return (
    <section className="rating-block" aria-labelledby="rating-block-title">
      <h2 id="rating-block-title">Chấm điểm app</h2>
      <p className="muted">{QUESTION}</p>
      {sent ? <p role="status">Cảm ơn bạn!</p> : <RatingForm onSent={() => setSent(true)} />}
    </section>
  );
}
