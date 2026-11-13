'use client';
// The reference-video analysis page (Feature A): the member picks one of their own videos (an upload, or a clip from
// their History), rea-video decomposes it on the worker, and the result is shown in Vietnamese with each shot's English
// prompt ready to push into Create (/create). Reachable only when REA_ANALYZE_ENABLED is on (the route 404s otherwise).
// /analyze?analysis=<id> opens one analysis; the URL follows the one on view.
import Link from 'next/link';
import type { Analysis } from '@cvs/core/analysis/breakdown';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { ABOUT } from '@/lib/about-content';
import { analysisFormat, frameTime, mergeShots, roleLabel, scriptPrompt, scriptText, timeRange } from '@/lib/analyze';
import { ANALYZE_EXAMPLES } from '@/lib/analyze-examples';
import { api, ApiError, errorText, sendJson } from '@/lib/api';
import { MAX_VIDEO_BYTES } from '@/lib/upload-limits';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { About } from './About';
import { confirmDialog } from './Confirm';
import { Icon } from './Icon';
import { elapsedLabel, JobPrompt } from './jobs';
import { AnalysisHistory } from './AnalysisHistory';
import { copyError, uploadError, uploadVideoDirect, WorkTabs } from './image-tools';
import { ReferenceVideoSlot, type RefVideo } from './ReferenceVideo';
import { RemakePanel } from './RemakePanel';

type Tab = 'result' | 'create' | 'history' | 'examples' | 'about';
const TAB_LABEL: Record<Tab, string> = { result: 'Kết quả', create: 'Phân tích', history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };

export interface AnalysisRow {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  result: Analysis | null;
  error: string | null;
  createdAt: string;
  sourceAssetId: string | null; // the input video, recovered from the analysis' source_key; null if that asset was deleted
}

const terminal = (s: string): boolean => s === 'succeeded' || s === 'failed';

/** The whole breakdown on the clipboard as text, with a short note on how it went. */
function CopyScript({ text }: { text: string }) {
  const [note, setNote] = useState('');
  const copy = () => {
    // No clipboard outside a secure context (the LAN address over http): say so rather than do nothing.
    if (!navigator.clipboard) return setNote('Không chép được.');
    void navigator.clipboard.writeText(text).then(
      () => setNote('Đã chép.'),
      () => setNote('Không chép được.'),
    );
  };
  return (
    <>
      <button type="button" onClick={copy}>
        Chép kịch bản
      </button>
      <span className="muted" aria-live="polite">
        {note}
      </span>
    </>
  );
}

const FRAME_WIDTH = 128; // twice the 64 px it shows at, for a sharp still on a dense screen
const FRAME_WAIT_MS = 10_000;

/** Resolves on the video's `done` event, rejects on its error or after FRAME_WAIT_MS; `go` starts the load or the seek. */
const videoEvent = (v: HTMLVideoElement, done: 'loadeddata' | 'seeked', go: () => void) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('video timeout')), FRAME_WAIT_MS);
    v.addEventListener(done, () => (clearTimeout(timer), resolve()), { once: true });
    v.addEventListener('error', () => (clearTimeout(timer), reject(new Error('video error'))), { once: true });
    go();
  });

/**
 * A still of the video at each scene, cut in the browser: a detached same-origin video seeks to the scene and draws to a canvas, one scene at a time, once `box`
 * scrolls into view. An entry is undefined until its still is ready; null (no thumbnails at all) with no source or after any failure, so the page shows none.
 */
function useFrames(src: string | undefined, shots: Analysis['shots'], box: RefObject<HTMLElement | null>): (string | undefined)[] | null {
  const [frames, setFrames] = useState<(string | undefined)[] | null>(src ? [] : null);
  const scenes = shots.map((s) => `${s.start}-${s.end}`).join();
  useEffect(() => {
    if (!src) return setFrames(null);
    setFrames([]);
    let stopped = false;
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    const run = async () => {
      try {
        await videoEvent(v, 'loadeddata', () => (v.src = src));
        const canvas = document.createElement('canvas');
        canvas.width = FRAME_WIDTH;
        canvas.height = Math.round((FRAME_WIDTH * v.videoHeight) / v.videoWidth);
        const out: string[] = [];
        for (const s of shots) {
          await videoEvent(v, 'seeked', () => (v.currentTime = frameTime(s.start, s.end)));
          if (stopped) return;
          canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
          out.push(canvas.toDataURL('image/jpeg', 0.7));
          setFrames([...out]);
        }
      } catch {
        if (!stopped) setFrames(null); // a clip that will not decode, or a canvas the browser refuses to read: no thumbnails, quietly
      }
    };
    const watch = box.current && typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((e) => e[0]?.isIntersecting && (watch?.disconnect(), void run())) : null;
    if (watch) watch.observe(box.current!);
    else void run();
    return () => {
      stopped = true;
      watch?.disconnect();
      v.removeAttribute('src'); // lets the browser drop the connection
      v.load();
    };
  }, [src, scenes]);
  return frames;
}

/** The analysis result, Vietnamese display with each shot's English prompt. Pure, so it render-tests without the page.
 * With `seek` (a source video is beside it) each scene's time is a button that plays the video from there; `activeShot` marks the scene being played.
 * `frames` (one per scene, undefined while still being cut) adds a thumbnail that seeks the same way. */
export function AnalysisResult({ analysis, seek, activeShot, frames }: { analysis: Analysis; seek?: (sec: number) => void; activeShot?: number | null; frames?: (string | undefined)[] | null }) {
  // Vietnamese for reading when the worker translated it; the English prompt is still what the "use this prompt" button sends to Create.
  const vi = analysis.vi;
  const scenes = mergeShots(analysis);
  const script = scriptPrompt(scenes.shots);
  return (
    <div className="analysis-result">
      <p className="muted">
        {analysisFormat(analysis)}
        {analysis.durationS ? ` · ${analysis.durationS.toFixed(1)} giây` : ''} · {scenes.shots.length} cảnh
      </p>
      {(vi?.hook || analysis.hook) && (
        <p>
          <strong>Mở đầu:</strong> {vi?.hook || analysis.hook}
        </p>
      )}
      {(vi?.summary || analysis.summary) && <p className="muted">{vi?.summary || analysis.summary}</p>}
      {scenes.shots.length > 0 && (
        <p className="analysis-script-actions">
          {script && (
            <Link className="button" href={`/create?prompt=${encodeURIComponent(script)}`}>
              Dùng cả kịch bản
            </Link>
          )}
          <CopyScript text={scriptText(analysis)} />
        </p>
      )}
      {seek && <p className="help">Bấm giờ của một cảnh để tua video tới đó.</p>}
      <ol className="analysis-shots">
        {scenes.shots.map((s, i) => (
          <li key={s.index} className="field" data-active={activeShot === s.index ? true : undefined} data-frame={seek && frames ? true : undefined}>
            {seek &&
              frames &&
              (frames[i] ? (
                <button type="button" className="analysis-frame" title="Bấm để tua video tới cảnh này" onClick={() => seek(s.start)}>
                  <img src={frames[i]} alt={`Khung hình cảnh ${s.index}`} />
                </button>
              ) : (
                <span className="analysis-frame" aria-hidden="true" />
              ))}
            <div className="analysis-shot-main">
              <p className="analysis-shot-head">
                <strong>Cảnh {s.index}</strong>
                {s.role && <span className="analysis-role">{roleLabel(s.role)}</span>}
                {seek ? (
                  <button type="button" className="analysis-time" title="Bấm cảnh để tua video" aria-label={`Tua video tới cảnh ${s.index}, ${timeRange(s.start, s.end)}`} onClick={() => seek(s.start)}>
                    {timeRange(s.start, s.end)}
                  </button>
                ) : (
                  <span className="muted">{timeRange(s.start, s.end)}</span>
                )}
              </p>
              {/* The English prompt with copy, as on History cards; under a Vietnamese reading it opens on a tap (no hover on a phone). */}
              {scenes.vi?.[i] ? (
                <>
                  <p className="analysis-prompt">{scenes.vi[i]}</p>
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
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A finished analysis with its video beside the result. The layout follows the width of the box it sits in, not the viewport (the result
 * shows in the 320 px form column and in the wide side panel). preload="metadata" shows the first frame as a poster with no transcode,
 * and only the one open result mounts a player, so the History list stays light. */
export function AnalysisWithSource({ analysis, src, poster, preload = 'metadata' }: { analysis: Analysis; src?: string; poster?: string; preload?: 'none' | 'metadata' }) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<number | null>(null);
  const shots = mergeShots(analysis).shots;
  const frames = useFrames(src, shots, box);
  const active = at === null ? null : (shots.find((s) => at >= s.start && at < s.end)?.index ?? null);
  const seek = (sec: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = sec;
    v.scrollIntoView({ block: 'nearest' }); // stacked in a narrow box, the player may be off screen
    void v.play().catch(() => undefined); // a refused autoplay still leaves the video at the scene
  };
  return (
    <div ref={box} className="analysis-box">
      <div className="analysis-with-source">
        {src && (
          <div className="analysis-source-col">
            <video ref={video} className="analysis-source" src={src} poster={poster} controls muted playsInline preload={preload} onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)} aria-label="Video gốc đã phân tích" />
          </div>
        )}
        <AnalysisResult analysis={analysis} seek={src ? seek : undefined} activeShot={active} frames={frames} />
      </div>
    </div>
  );
}

/** One analysis, its status and result: the Kết quả tab on a wide screen and the Phân tích panel on a phone. */
export function AnalysisPanel({ row, onRetry, onClose, remakeEnabled = false }: { row: AnalysisRow; onRetry?: () => void; onClose: () => void; remakeEnabled?: boolean }) {
  const waiting = !terminal(row.status);
  const elapsed = waiting ? elapsedLabel(row) : null;
  return (
    <div className="analysis-panel">
      <div className="analysis-panel-head">
        <h2>Kết quả phân tích</h2>
        <button type="button" className="link-button" onClick={onClose}>
          Đóng kết quả
        </button>
      </div>
      {waiting && (
        <div className="analysis-wait" role="status">
          <strong>Đang phân tích video…</strong>
          <span className="muted">
            Thường mất khoảng 1–2 phút{elapsed && ` · ${elapsed}`}. Bạn có thể xem tab khác, kết quả cũng sẽ có ở Lịch sử.
          </span>
        </div>
      )}
      {row.status === 'failed' && (
        <>
          <p className="error" role="alert">
            Phân tích không thành công. Hãy thử lại với video khác.
          </p>
          {onRetry && (
            <button type="button" className="link-button" onClick={onRetry}>
              Thử lại
            </button>
          )}
        </>
      )}
      {row.status === 'succeeded' && row.result && (
        <>
          <AnalysisWithSource analysis={row.result} src={row.sourceAssetId ? `/api/assets/${row.sourceAssetId}/content` : undefined} />
          {/* key: another analysis opened resets the product and shot pick */}
          {remakeEnabled && <RemakePanel key={row.id} row={row} />}
        </>
      )}
    </div>
  );
}

/** The read-only sample analyses (lib/analyze-examples.ts): a real sample clip with its breakdown, and a button that loads the clip as the reference video. */
function Examples({ busy, onUse }: { busy: boolean; onUse: (video: string) => void }) {
  return (
    <div className="analysis-examples">
      <p className="help">Video mẫu kèm kết quả phân tích: xem một video được rã thành cảnh, định dạng, câu mở đầu và prompt tiếng Anh cho từng cảnh. Bấm "Dùng video này" để nạp video vào ô Video tham chiếu rồi tự phân tích.</p>
      {ANALYZE_EXAMPLES.map((ex) => (
        <section key={ex.video} className="card analysis-example">
          <div className="analysis-example-head">
            <h3>{ex.title}</h3>
            <button type="button" disabled={busy} onClick={() => onUse(ex.video)}>
              Dùng video này
            </button>
          </div>
          <AnalysisWithSource analysis={ex.analysis} src={`/api/samples/${ex.video}`} poster={`/api/samples/${ex.video.replace(/\.mp4$/, '.jpg')}`} preload="none" />
        </section>
      ))}
    </div>
  );
}

/** The address follows the analysis on view, without a navigation or a scroll. */
const syncUrl = (id: string | null) => window.history.replaceState(null, '', id ? `/analyze?analysis=${id}` : '/analyze');

/** `remakeEnabled`: REA_REMAKE_ENABLED, which adds Smart Remake under a finished analysis. */
export function AnalyzeView({ initialId, remakeEnabled = false }: { initialId?: string; remakeEnabled?: boolean }) {
  const narrow = useMediaQuery(NARROW);
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (the form below 1024 px, else the result when there is one, else Examples)
  const [video, setVideo] = useState<RefVideo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState<AnalysisRow | null>(null);
  const [history, setHistory] = useState<AnalysisRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [removeError, setRemoveError] = useState('');
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
  // Put an analysis on view: the Kết quả tab on a wide screen, the Phân tích panel (where the result sits) on a phone.
  const show = (row: AnalysisRow) => {
    setCurrent(row);
    syncUrl(row.id);
    setTab(narrow ? 'create' : 'result');
  };
  const close = () => {
    stopPoll();
    setCurrent(null);
    syncUrl(null);
    setTab(null);
  };
  useEffect(() => {
    void loadHistory();
    if (initialId)
      api<AnalysisRow>(`/api/analyses/${initialId}`).then(
        (row) => {
          // No setTab: the default tab already shows it, and a tab the member picked while this loaded stays picked.
          setCurrent(row);
          syncUrl(row.id);
          if (!terminal(row.status)) pollOne(row.id);
        },
        () => {
          syncUrl(null);
          setError('Không mở được phân tích này. Liên kết có thể đã cũ, hoặc phân tích không phải của bạn.');
        },
      );
    return stopPoll;
  }, []);

  async function takeVideo(get: () => Promise<RefVideo[]>, failed: (e: unknown) => string) {
    setError('');
    setBusy(true);
    try {
      setVideo((await get())[0]!);
      stopPoll();
      setCurrent(null);
      syncUrl(null);
    } catch (e) {
      setError(failed(e));
    } finally {
      setBusy(false);
    }
  }

  // A sample clip from the Examples tab becomes the member's own reference video (copied on the server, one clip per request).
  async function takeSample(name: string) {
    await takeVideo(() => api<{ assets: RefVideo[] }>('/api/assets/samples', sendJson('POST', { names: [name] })).then((r) => r.assets), (e) => copyError(e, 'Không dùng được video mẫu này.'));
    if (narrow) setTab('create');
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
      show({ id, status: 'queued', result: null, error: null, createdAt: new Date().toISOString(), sourceAssetId: video.id });
      pollOne(id);
    } catch (e) {
      setError(errorText(e, 'Không bắt đầu phân tích được.'));
    } finally {
      setBusy(false);
    }
  }

  // Delete a finished analysis from History: the one on view closes with it. The server's 409 texts (a remake exists) are written for members.
  async function remove(a: AnalysisRow) {
    if (!(await confirmDialog({ title: 'Xoá phân tích này?', body: 'Video gốc vẫn còn trong Thư viện của bạn.', confirmLabel: 'Xoá', danger: true }))) return;
    setRemoveError('');
    try {
      await api(`/api/analyses/${encodeURIComponent(a.id)}`, { method: 'DELETE' });
      setHistory((h) => h.filter((x) => x.id !== a.id));
      if (current?.id === a.id) {
        close();
        setTab('history'); // stay on the list the member is working in
      }
    } catch (e) {
      setRemoveError(e instanceof ApiError && e.status === 409 ? e.message : 'Không xoá được phân tích này. Hãy thử lại.');
    }
  }

  const running = current !== null && !terminal(current.status);
  // Pick a History row to view: stop any live poll and show it.
  const pick = (a: AnalysisRow) => {
    stopPoll();
    show(a);
  };

  const tabs: Tab[] = narrow ? ['create', 'history', 'examples', 'about'] : [...(current ? (['result'] as const) : []), 'history', 'examples', 'about'];
  const shown: Tab = narrow ? (tab === null || tab === 'result' ? 'create' : tab) : tab === null || tab === 'create' || (tab === 'result' && !current) ? (current ? 'result' : 'examples') : tab;
  const panel = shown === 'create' ? 'examples' : shown;
  const retry = video && current?.status === 'failed' && current.sourceAssetId === video.id && !busy ? () => void analyse() : undefined;

  return (
    <section aria-labelledby="analyze-title" className="create analyze-page">
      <h1 id="analyze-title" className="sr-only">
        Phân tích video tham chiếu
      </h1>
      <div className="create-grid">
        <WorkTabs prefix="analyze" tabs={tabs} labels={TAB_LABEL} shown={shown} onSelect={setTab} />

        <div className="card form-card" id="analyze-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'analyze-tab-create' : undefined} hidden={narrow && shown !== 'create'}>
          <div className="form-scroll">
            <p className="help">Tải lên một video (hoặc chọn từ Lịch sử) rồi bấm Phân tích để rã thành danh sách cảnh, định dạng, câu mở đầu và prompt tiếng Anh cho từng cảnh. Bấm "Dùng prompt này" ở một cảnh, hoặc "Dùng cả kịch bản", để mở Tạo video với prompt đó.</p>

            <ReferenceVideoSlot
              video={video}
              busy={busy}
              hint={`Video MP4 hoặc MOV (tối đa ${MAX_VIDEO_BYTES / 1024 / 1024} MB). Hoặc bấm "Dùng video này" ở tab Ví dụ.`}
              onFile={(f) => void takeVideo(() => uploadVideoDirect(f).then((v) => [v]), (e) => uploadError(e, 'video'))}
              onHistory={(id) => void takeVideo(() => api<{ assets: RefVideo[] }>('/api/assets/copy', sendJson('POST', { assetId: id })).then((r) => r.assets), (e) => copyError(e, 'Không dùng được video này.'))}
              onRemove={() => {
                close();
                setVideo(null);
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

            {narrow && current && <AnalysisPanel row={current} onRetry={retry} onClose={close} remakeEnabled={remakeEnabled} />}
          </div>
        </div>

        <div className="side" id={`analyze-panel-${panel}`} role="tabpanel" aria-labelledby={`analyze-tab-${panel}`} hidden={narrow && shown === 'create'}>
          {shown === 'result' && current ? (
            <AnalysisPanel row={current} onRetry={retry} onClose={close} remakeEnabled={remakeEnabled} />
          ) : shown === 'history' ? (
            <section className="analysis-history">
              <h2>Gần đây</h2>
              <AnalysisHistory loading={historyLoading} error={historyError} items={history} currentId={current?.id} onRetry={() => void loadHistory()} onPick={pick} onDelete={(a) => void remove(a)} />
              {removeError && (
                <p className="error" role="alert">
                  {removeError}
                </p>
              )}
            </section>
          ) : shown === 'examples' ? (
            <Examples busy={busy} onUse={(name) => void takeSample(name)} />
          ) : (
            <About page={ABOUT.analyze} />
          )}
        </div>
      </div>
    </section>
  );
}
