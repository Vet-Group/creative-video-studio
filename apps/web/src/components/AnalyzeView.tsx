'use client';
// The reference-video analysis page (Feature A): the member picks one of their own videos (an upload, or a clip from
// their History), rea-video decomposes it on the worker, and the result is shown in Vietnamese with each shot's English
// prompt ready to push into Create (/create). Reachable only when REA_ANALYZE_ENABLED is on (the route 404s otherwise).
import Link from 'next/link';
import type { Analysis } from '@cvs/core/analysis/breakdown';
import { useEffect, useRef, useState } from 'react';
import { formatLabel } from '@/lib/analyze';
import { api, errorText, sendJson } from '@/lib/api';
import { Icon } from './Icon';
import { copyError, uploadError, uploadVideoDirect } from './image-tools';
import { ReferenceVideoSlot, type RefVideo } from './ReferenceVideo';

interface AnalysisRow {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  result: Analysis | null;
  error: string | null;
  createdAt: string;
}

const terminal = (s: string): boolean => s === 'succeeded' || s === 'failed';

/** The analysis result, Vietnamese display with each shot's English prompt. Pure, so it render-tests without the page. */
export function AnalysisResult({ analysis }: { analysis: Analysis }) {
  // Vietnamese for reading when the worker translated it; the English prompt is still what the "use this prompt" button sends to Create.
  const vi = analysis.vi;
  return (
    <div className="analysis-result">
      <p className="muted">
        {vi?.format || formatLabel(analysis.format) || 'Video'}
        {analysis.durationS ? ` · ${analysis.durationS.toFixed(1)} giây` : ''} · {analysis.shotCount} cảnh
      </p>
      {(vi?.hook || analysis.hook) && (
        <p>
          <strong>Mở đầu:</strong> {vi?.hook || analysis.hook}
        </p>
      )}
      {(vi?.summary || analysis.summary) && <p className="muted">{vi?.summary || analysis.summary}</p>}
      <ol className="analysis-shots">
        {analysis.shots.map((s, i) => (
          <li key={s.index} className="field">
            <p>
              <strong>Cảnh {s.index}</strong>
              {s.role && <span className="tag">{s.role}</span>}
              <span className="muted">
                {' '}
                {s.start.toFixed(1)}–{s.end.toFixed(1)}s
              </span>
            </p>
            <p className="analysis-prompt">{vi?.shots[i] || s.prompt}</p>
            {s.prompt && (
              <Link className="link-button" href={`/create?prompt=${encodeURIComponent(s.prompt)}`} title={s.prompt}>
                Dùng prompt này
              </Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AnalyzeView() {
  const [video, setVideo] = useState<RefVideo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState<AnalysisRow | null>(null);
  const [history, setHistory] = useState<AnalysisRow[]>([]);
  const poll = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The id the poll chain is following; cleared on unmount, remove or a History pick so an in-flight fetch does not
  // reschedule itself or write its row over a newer selection after the chain was meant to stop.
  const pollId = useRef<string | null>(null);
  const stopPoll = () => {
    pollId.current = null;
    clearTimeout(poll.current);
  };

  const loadHistory = () => api<{ analyses: AnalysisRow[] }>('/api/analyses').then((r) => setHistory(r.analyses), () => {});
  useEffect(() => {
    void loadHistory();
    return stopPoll;
  }, []);

  async function takeVideo(get: () => Promise<RefVideo[]>, failed: (e: unknown) => string) {
    setError('');
    setBusy(true);
    try {
      setVideo((await get())[0]!);
      setCurrent(null);
    } catch (e) {
      setError(failed(e));
    } finally {
      setBusy(false);
    }
  }

  function pollOne(id: string) {
    pollId.current = id;
    poll.current = setTimeout(async () => {
      try {
        const row = await api<AnalysisRow>(`/api/analyses/${id}`);
        if (pollId.current !== id) return; // unmounted, removed, or a History row took over while this fetch was in flight
        setCurrent(row);
        if (terminal(row.status)) {
          void loadHistory();
          return;
        }
      } catch {
        if (pollId.current !== id) return; // a dropped poll retries on the next tick, unless the chain was stopped
      }
      pollOne(id);
    }, 2500);
  }

  async function analyse() {
    if (!video) return;
    setError('');
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>('/api/analyses', sendJson('POST', { sourceAssetId: video.id }));
      setCurrent({ id, status: 'queued', result: null, error: null, createdAt: new Date().toISOString() });
      pollOne(id);
    } catch (e) {
      setError(errorText(e, 'Không bắt đầu phân tích được.'));
    } finally {
      setBusy(false);
    }
  }

  const running = current !== null && !terminal(current.status);
  return (
    <section aria-labelledby="analyze-title" className="create">
      <h1 id="analyze-title">Phân tích video tham chiếu</h1>
      <p className="help">
        Tải lên một video (hoặc chọn từ Lịch sử) để rã thành danh sách cảnh, định dạng, câu mở đầu và prompt tiếng Anh cho từng cảnh. Bấm một prompt để tạo video từ đó.
      </p>

      <ReferenceVideoSlot
        video={video}
        busy={busy}
        onFile={(f) => void takeVideo(() => uploadVideoDirect(f).then((v) => [v]), (e) => uploadError(e, 'video'))}
        onHistory={(id) => void takeVideo(() => api<{ assets: RefVideo[] }>('/api/assets/copy', sendJson('POST', { assetId: id })).then((r) => r.assets), (e) => copyError(e, 'Không dùng được video này.'))}
        onRemove={() => {
          stopPoll();
          setVideo(null);
          setCurrent(null);
        }}
      />

      {video && (
        <button type="button" className="primary" disabled={busy || running} onClick={() => void analyse()}>
          <Icon name="chart" /> Phân tích
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {running && (
        <p className="muted" role="status">
          Đang phân tích video… việc này mất một lát.
        </p>
      )}
      {current?.status === 'failed' && (
        <p className="error" role="alert">
          Phân tích không thành công. Hãy thử lại với video khác.
        </p>
      )}
      {current?.status === 'succeeded' && current.result && <AnalysisResult analysis={current.result} />}

      {history.length > 0 && (
        <section className="analysis-history">
          <h2>Gần đây</h2>
          <ul>
            {history.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="link-button"
                  disabled={a.status !== 'succeeded' || !a.result}
                  onClick={() => {
                    stopPoll();
                    setCurrent(a);
                  }}
                >
                  {a.result ? formatLabel(a.result.format) || 'Video' : a.status === 'failed' ? 'Không thành công' : 'Đang xử lý'} · {new Date(a.createdAt).toLocaleString('vi-VN')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
