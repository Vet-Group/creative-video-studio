'use client';
// The reference-video analysis page (Feature A): the member picks one of their own videos (an upload, or a clip from
// their History), rea-video decomposes it on the worker, and the result is shown in Vietnamese with each shot's English
// prompt ready to push into Create (/create). Reachable only when REA_ANALYZE_ENABLED is on (the route 404s otherwise).
import Link from 'next/link';
import type { Analysis } from '@cvs/core/analysis/breakdown';
import { useEffect, useRef, useState } from 'react';
import { ABOUT } from '@/lib/about-content';
import { formatLabel } from '@/lib/analyze';
import { ANALYZE_EXAMPLES } from '@/lib/analyze-examples';
import { api, errorText, sendJson } from '@/lib/api';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { About } from './About';
import { Icon } from './Icon';
import { elapsedLabel, JobPrompt } from './jobs';
import { AnalysisHistory } from './AnalysisHistory';
import { copyError, uploadError, uploadVideoDirect, WorkTabs } from './image-tools';
import { ReferenceVideoSlot, type RefVideo } from './ReferenceVideo';

type Tab = 'create' | 'history' | 'examples' | 'about';
const TAB_LABEL: Record<Tab, string> = { create: 'Phân tích', history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };

export interface AnalysisRow {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  result: Analysis | null;
  error: string | null;
  createdAt: string;
  sourceAssetId: string | null; // the input video, recovered from the analysis' source_key; null if that asset was deleted
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
            {/* The English prompt with copy, as on History cards; under a Vietnamese reading it opens on a tap (no hover on a phone). */}
            {vi?.shots[i] ? (
              <>
                <p className="analysis-prompt">{vi.shots[i]}</p>
                {s.prompt && (
                  <details className="analysis-en">
                    <summary>Prompt tiếng Anh</summary>
                    <JobPrompt text={s.prompt} />
                  </details>
                )}
              </>
            ) : (
              s.prompt && <JobPrompt text={s.prompt} />
            )}
            {s.prompt && (
              <Link className="link-button" href={`/create?prompt=${encodeURIComponent(s.prompt)}`}>
                Dùng prompt này
              </Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A finished analysis with its input video beside the result. preload="metadata" shows the first frame as a poster with
 * no transcode, and only the one open result mounts a player, so the History list stays light. */
export function AnalysisWithSource({ row }: { row: AnalysisRow }) {
  if (!row.result) return null;
  return (
    <div className="analysis-with-source">
      {row.sourceAssetId && (
        <video className="analysis-source" src={`/api/assets/${row.sourceAssetId}/content`} controls muted playsInline preload="metadata" aria-label="Video gốc đã phân tích" />
      )}
      <AnalysisResult analysis={row.result} />
    </div>
  );
}

/** The read-only sample analyses (lib/analyze-examples.ts): what a breakdown looks like, without spending a real run. */
function Examples() {
  return (
    <div className="analysis-examples">
      <p className="help">Phân tích mẫu — xem một video tham chiếu được rã thành cảnh, định dạng, câu mở đầu và prompt tiếng Anh cho từng cảnh.</p>
      {ANALYZE_EXAMPLES.map((ex) => (
        <section key={ex.title} className="card analysis-example">
          <h3>{ex.title}</h3>
          <AnalysisResult analysis={ex.analysis} />
        </section>
      ))}
    </div>
  );
}

export function AnalyzeView() {
  const narrow = useMediaQuery(NARROW);
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (the form below 1024 px, else Examples)
  const [video, setVideo] = useState<RefVideo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState<AnalysisRow | null>(null);
  const [history, setHistory] = useState<AnalysisRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const poll = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The id the poll chain is following; cleared on unmount, remove or a History pick so an in-flight fetch does not
  // reschedule itself or write its row over a newer selection after the chain was meant to stop.
  const pollId = useRef<string | null>(null);
  const stopPoll = () => {
    pollId.current = null;
    clearTimeout(poll.current);
  };

  const loadHistory = () => {
    setHistoryLoading(true);
    setHistoryError(false);
    return api<{ analyses: AnalysisRow[] }>('/api/analyses')
      .then((r) => setHistory(r.analyses), () => setHistoryError(true))
      .finally(() => setHistoryLoading(false));
  };
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
      setCurrent({ id, status: 'queued', result: null, error: null, createdAt: new Date().toISOString(), sourceAssetId: video.id });
      pollOne(id);
    } catch (e) {
      setError(errorText(e, 'Không bắt đầu phân tích được.'));
    } finally {
      setBusy(false);
    }
  }

  const running = current !== null && !terminal(current.status);
  const elapsed = running && current ? elapsedLabel({ status: current.status, createdAt: current.createdAt }) : null;
  // Pick a History row to view: stop any live poll, show it, and on a phone switch to the Phân tích panel where the result sits.
  const pick = (a: AnalysisRow) => {
    stopPoll();
    setCurrent(a);
    if (narrow) setTab('create');
  };

  const tabs: Tab[] = narrow ? ['create', 'history', 'examples', 'about'] : ['history', 'examples', 'about'];
  const shown: Tab = narrow ? (tab ?? 'create') : tab === null || tab === 'create' ? 'examples' : tab;
  const panel = shown === 'create' ? 'examples' : shown;

  return (
    <section aria-labelledby="analyze-title" className="create analyze-page">
      <h1 id="analyze-title" className="sr-only">
        Phân tích video tham chiếu
      </h1>
      <div className="create-grid">
        <WorkTabs prefix="analyze" tabs={tabs} labels={TAB_LABEL} shown={shown} onSelect={setTab} />

        <div className="card form-card" id="analyze-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'analyze-tab-create' : undefined} hidden={narrow && shown !== 'create'}>
          <div className="form-scroll">
            <p className="help">Tải lên một video (hoặc chọn từ Lịch sử) để rã thành danh sách cảnh, định dạng, câu mở đầu và prompt tiếng Anh cho từng cảnh. Bấm một prompt để tạo video từ đó.</p>

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
                {elapsed && ` · ${elapsed}`}
              </p>
            )}
            {current?.status === 'failed' && (
              <>
                <p className="error" role="alert">
                  Phân tích không thành công. Hãy thử lại với video khác.
                </p>
                {video && current.sourceAssetId === video.id && (
                  <button type="button" className="link-button" disabled={busy || running} onClick={() => void analyse()}>
                    Thử lại
                  </button>
                )}
              </>
            )}
            {current?.status === 'succeeded' && current.result && <AnalysisWithSource row={current} />}
          </div>
        </div>

        <div className="side" id={`analyze-panel-${panel}`} role="tabpanel" aria-labelledby={`analyze-tab-${panel}`} hidden={narrow && shown === 'create'}>
          {shown === 'history' ? (
            <section className="analysis-history">
              <h2>Gần đây</h2>
              <AnalysisHistory loading={historyLoading} error={historyError} items={history} onRetry={() => void loadHistory()} onPick={pick} />
            </section>
          ) : shown === 'examples' ? (
            <Examples />
          ) : (
            <About page={ABOUT.analyze} />
          )}
        </div>
      </div>
    </section>
  );
}
