'use client';
// The History tab list on the analyze page: loading, a load error with retry, the empty state, and the rows. A row opens
// only when its analysis succeeded. Split out of AnalyzeView so these states are rendered from plain props and tested.
import { formatLabel } from '@/lib/analyze';
import type { AnalysisRow } from './AnalyzeView';
import { LoadError } from './LoadError';

export function AnalysisHistory({
  loading,
  error,
  items,
  onRetry,
  onPick,
}: {
  loading: boolean;
  error: boolean;
  items: AnalysisRow[];
  onRetry: () => void;
  onPick: (a: AnalysisRow) => void;
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
    <ul>
      {items.map((a) => (
        <li key={a.id}>
          <button type="button" className="link-button" disabled={a.status !== 'succeeded' || !a.result} onClick={() => onPick(a)}>
            {a.result ? formatLabel(a.result.format) || 'Video' : a.status === 'failed' ? 'Không thành công' : 'Đang xử lý'} · {new Date(a.createdAt).toLocaleString('vi-VN')}
          </button>
        </li>
      ))}
    </ul>
  );
}
