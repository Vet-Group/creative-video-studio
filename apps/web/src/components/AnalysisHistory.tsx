'use client';
// The History tab list on the analyze page: loading, a load error with retry, the empty state, and a card per analysis. A
// card opens only when its analysis succeeded; a running or failed one says why it does not. Split out of AnalyzeView so
// these states are rendered from plain props and tested.
import { useEffect, useRef, useState } from 'react';
import { analysisError, analysisFormat, mergeShots } from '@/lib/analyze';
import type { AnalysisRow } from './AnalyzeView';
import { Icon } from './Icon';
import { LoadError } from './LoadError';

const WHEN: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' };

/** A card's first frame. An uploaded video has no poster, so its src is attached only once the card scrolls into view: a list of 50 no longer opens 50
 * streams through the app at once. */
export function CardVideo({ assetId }: { assetId: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const watch = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      setSeen(true);
      watch.disconnect();
    });
    watch.observe(ref.current);
    return () => watch.disconnect();
  }, []);
  return <video ref={ref} src={seen ? `/api/assets/${assetId}/content#t=0.1` : undefined} muted playsInline preload="metadata" tabIndex={-1} />;
}

function Card({ a }: { a: AnalysisRow }) {
  const r = a.result;
  const waiting = a.status === 'queued' || a.status === 'running';
  return (
    <>
      <span className="analysis-poster" aria-hidden="true">
        {a.sourceAssetId ? <CardVideo assetId={a.sourceAssetId} /> : <Icon name="film" size={20} />}
      </span>
      <span className="analysis-card-body">
        {/* Many rows share a format, so the summary leads and the format is a tag. */}
        <strong className="analysis-card-title">{r ? r.vi?.summary || r.summary || analysisFormat(r) : 'Video'}</strong>
        {r ? (
          <>
            <span className="muted">
              {(r.vi?.summary || r.summary) && <span className="analysis-role">{analysisFormat(r)}</span>} {r.durationS ? `${r.durationS.toFixed(1)} giây · ` : ''}
              {mergeShots(r).shots.length} cảnh
            </span>
            <span className="analysis-hook">{r.vi?.hook || r.hook}</span>
          </>
        ) : (
          <>
            <span className="analysis-chip" data-tone={waiting ? 'wait' : 'fail'}>
              {waiting ? 'Đang phân tích…' : 'Không thành công'}
            </span>
            <span className="muted">{waiting ? 'Chưa mở được, kết quả sẽ có ở đây khi phân tích xong.' : analysisError(a.error)}</span>
          </>
        )}
        {a.creatorName && <span className="muted">Người tạo: {a.creatorName}</span>}
        <span className="muted">{new Date(a.createdAt).toLocaleString('vi-VN', WHEN)}</span>
      </span>
    </>
  );
}

/** An Admin's choice to list every member's analyses in History instead of their own. */
export function EveryoneChoice({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="analysis-everyone">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Mọi người
    </label>
  );
}

export function AnalysisHistory({
  loading,
  error,
  items,
  currentId,
  onRetry,
  onPick,
  onReuse,
  onDelete,
}: {
  loading: boolean;
  error: boolean;
  items: AnalysisRow[];
  /** The analysis on view, marked in the list. */
  currentId?: string | null;
  onRetry: () => void;
  onPick: (a: AnalysisRow) => void;
  /** Put a failed analysis' video (of the caller's own, still there) back in the form, to analyse again. */
  onReuse?: (a: AnalysisRow) => void;
  /** Delete a finished (succeeded or failed) analysis of the caller's own (none is offered for another member's); the caller confirms. */
  onDelete: (a: AnalysisRow) => void;
}) {
  if (loading && items.length === 0)
    return (
      <p className="muted" role="status">
        Đang tải…
      </p>
    );
  if (error && items.length === 0) return <LoadError text="Không tải được lịch sử phân tích." onRetry={onRetry} />;
  if (items.length === 0) return <p className="muted">Chưa có phân tích nào. Chọn một video rồi bấm Phân tích để bắt đầu.</p>;
  return (
    <ul className="analysis-list">
      {items.map((a) => (
        <li key={a.id} className="analysis-item">
          {a.status === 'succeeded' && a.result ? (
            <button type="button" className="analysis-card" aria-current={a.id === currentId ? 'true' : undefined} onClick={() => onPick(a)}>
              <Card a={a} />
            </button>
          ) : (
            <div className="analysis-card" data-status={a.status}>
              <Card a={a} />
            </div>
          )}
          {onReuse && a.status === 'failed' && a.sourceAssetId && !a.creatorName && (
            <button type="button" className="link-button" onClick={() => onReuse(a)}>
              Dùng video này lại
            </button>
          )}
          {(a.status === 'succeeded' || a.status === 'failed') && !a.creatorName && (
            <button type="button" className="analysis-delete" aria-label="Xoá phân tích" title="Xoá phân tích" onClick={() => onDelete(a)}>
              <Icon name="x" size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
