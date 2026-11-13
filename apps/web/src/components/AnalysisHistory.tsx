'use client';
// The History tab list on the analyze page: loading, a load error with retry, the empty state, and a card per analysis. A
// card opens only when its analysis succeeded; a running or failed one says why it does not. Split out of AnalyzeView so
// these states are rendered from plain props and tested.
import { analysisFormat, mergeShots } from '@/lib/analyze';
import type { AnalysisRow } from './AnalyzeView';
import { Icon } from './Icon';
import { LoadError } from './LoadError';

const WHEN: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' };

function Card({ a }: { a: AnalysisRow }) {
  const r = a.result;
  const waiting = a.status === 'queued' || a.status === 'running';
  return (
    <>
      <span className="analysis-poster" aria-hidden="true">
        {a.sourceAssetId ? <video src={`/api/assets/${a.sourceAssetId}/content#t=0.1`} muted playsInline preload="metadata" tabIndex={-1} /> : <Icon name="film" size={20} />}
      </span>
      <span className="analysis-card-body">
        <strong>{r ? analysisFormat(r) : 'Video'}</strong>
        {r ? (
          <>
            <span className="muted">
              {r.durationS ? `${r.durationS.toFixed(1)} giây · ` : ''}
              {mergeShots(r).shots.length} cảnh
            </span>
            <span className="analysis-hook">{r.vi?.hook || r.hook}</span>
          </>
        ) : (
          <>
            <span className="analysis-chip" data-tone={waiting ? 'wait' : 'fail'}>
              {waiting ? 'Đang phân tích…' : 'Không thành công'}
            </span>
            <span className="muted">{waiting ? 'Chưa mở được, kết quả sẽ có ở đây khi phân tích xong.' : 'Phân tích này không ra kết quả nên không có gì để mở. Hãy thử lại với video khác.'}</span>
          </>
        )}
        <span className="muted">{new Date(a.createdAt).toLocaleString('vi-VN', WHEN)}</span>
      </span>
    </>
  );
}

export function AnalysisHistory({
  loading,
  error,
  items,
  currentId,
  onRetry,
  onPick,
  onDelete,
}: {
  loading: boolean;
  error: boolean;
  items: AnalysisRow[];
  /** The analysis on view, marked in the list. */
  currentId?: string | null;
  onRetry: () => void;
  onPick: (a: AnalysisRow) => void;
  /** Delete a finished (succeeded or failed) analysis; the caller confirms. */
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
          {(a.status === 'succeeded' || a.status === 'failed') && (
            <button type="button" className="analysis-delete" aria-label="Xoá phân tích" title="Xoá phân tích" onClick={() => onDelete(a)}>
              <Icon name="x" size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
