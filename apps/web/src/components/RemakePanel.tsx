'use client';
// Smart Remake (Feature B) under a finished analysis: the member picks one of their product photos and up to REMAKE_MAX_SHOTS shots,
// the worker puts the product into each shot's first frame and animates it (apps/worker/src/remake.ts), and the clips are joined into
// one silent video. Rendered only when REA_REMAKE_ENABLED is on (AnalyzeView's remakeEnabled); the API 404s otherwise.
import { REMAKE_MAX_SHOTS, REMAKE_SHOT_USD } from '@cvs/core/analysis/remake';
import { useEffect, useState } from 'react';
import { mergeShots, timeRange } from '@/lib/analyze';
import { api, errorText, sendJson } from '@/lib/api';
import { confirmRun } from '@/lib/run-guard';
import type { AnalysisRow } from './AnalyzeView';
import { type Img, Slot, uploadError, uploadImages } from './image-tools';

export interface RemakeRow {
  id: string;
  analysisId: string;
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed';
  result: { shots: { index: number; status: 'succeeded' | 'failed'; clipAssetId?: string }[] } | null;
  outputAssetId: string | null;
  costUsd: string | null;
  createdAt: string;
}

const STATUS: Record<RemakeRow['status'], string> = { queued: 'Đang chờ…', running: 'Đang tạo video…', succeeded: 'Xong', partial: 'Xong một phần', failed: 'Không thành công' };
const isOpen = (r: RemakeRow) => r.status === 'queued' || r.status === 'running';

/** What `shots` shots are estimated to cost, as the API counts it against the spending caps. */
export const remakeEstimate = (shots: number): string => (shots * REMAKE_SHOT_USD).toFixed(2);

/** One remake: its state, the joined video, then each shot's clip or that it failed. Pure, so it render-tests without the page. `scene` numbers a stored shot as the result list does. */
export function RemakeResult({ row, scene = (index) => index }: { row: RemakeRow; scene?: (index: number) => number }) {
  const shots = row.result?.shots ?? [];
  return (
    <li className="remake-item">
      <p role={isOpen(row) ? 'status' : undefined}>
        <strong>{STATUS[row.status]}</strong>
        {isOpen(row) ? <span className="muted"> · việc này mất vài phút</span> : row.costUsd !== null && <span className="muted"> · ${Number(row.costUsd).toFixed(2)}</span>}
      </p>
      {row.outputAssetId && (
        <>
          <video className="remake-video" src={`/api/assets/${row.outputAssetId}/content`} controls playsInline preload="metadata" aria-label="Video Smart Remake" />
          <a className="link-button" href={`/api/assets/${row.outputAssetId}/download`}>
            Tải video
          </a>
        </>
      )}
      {shots.length > 0 && (
        <ul className="remake-shots">
          {shots.map((s) => (
            <li key={s.index}>
              {s.clipAssetId ? (
                <a href={`/api/assets/${s.clipAssetId}/content`} target="_blank" rel="noreferrer">
                  Clip cảnh {scene(s.index)}
                </a>
              ) : (
                <span className="error">Cảnh {scene(s.index)} không tạo được</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {row.status === 'failed' && shots.length === 0 && <p className="error">Không tạo được video. Hãy thử lại.</p>}
    </li>
  );
}

/** The Smart Remake form and this analysis' remakes, newest first. Mount it with `key` set to the analysis id, so a pick starts over. */
export function RemakePanel({ row }: { row: AnalysisRow }) {
  // The scenes as the result list numbers them; a scene is sent as its first stored shot, which the API and the worker take.
  const scenes = row.result ? mergeShots(row.result) : { shots: [], first: [] };
  const scene = (index: number) => scenes.first.filter((f) => f <= index).length;
  const [product, setProduct] = useState<Img[]>([]);
  const [chosen, setChosen] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [remakes, setRemakes] = useState<RemakeRow[]>([]);
  const [sent, setSent] = useState(0); // bumped by each new remake, to load the list again and follow it

  // Loads this analysis' remakes, then again every 4 s while one is still open; a failed load retries only while one is followed.
  useEffect(() => {
    let live = true;
    let following = sent > 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api<{ remakes: RemakeRow[] }>('/api/remakes').then(
        (r) => {
          if (!live) return;
          const mine = r.remakes.filter((m) => m.analysisId === row.id);
          setRemakes(mine);
          following = mine.some(isOpen);
          if (following) timer = setTimeout(load, 4000);
        },
        () => {
          if (live && following) timer = setTimeout(load, 4000);
        },
      );
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [row.id, sent]);

  async function upload(files: File[]) {
    setBusy(true);
    setError('');
    try {
      setProduct(await uploadImages(files.slice(0, 1), 'image', '', 'product'));
    } catch (e) {
      setError(uploadError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remake() {
    if (!product[0] || chosen.length === 0) return;
    if (!(await confirmRun(remakeEstimate(chosen.length)))) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/remakes', sendJson('POST', { analysisId: row.id, productAssetId: product[0].id, shots: chosen }));
      setSent((n) => n + 1);
    } catch (e) {
      setError(errorText(e, 'Không bắt đầu được Smart Remake. Hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  const running = remakes.some(isOpen); // one at a time per analysis, so a double click cannot pay twice
  const toggle = (index: number) => setChosen((c) => (c.includes(index) ? c.filter((n) => n !== index) : [...c, index]));

  return (
    <section className="remake-panel" aria-labelledby={`remake-${row.id}`}>
      <h2 id={`remake-${row.id}`}>Smart Remake</h2>
      <p className="help">Giữ mạch truyện của video này, thay sản phẩm trong các cảnh bạn chọn bằng ảnh sản phẩm của bạn. Mỗi cảnh thành một clip 5 giây không tiếng, rồi được ghép lại thành một video.</p>
      <Slot label="Ảnh sản phẩm" empty="Thêm 1 ảnh sản phẩm" inputLabel="Ảnh sản phẩm" images={product} max={1} busy={busy} onAdd={(files) => void upload(files)} onRemove={() => setProduct([])} onPick={(a) => setProduct([a])} slot="product" />
      <fieldset className="remake-pick">
        <legend>Cảnh cần thay sản phẩm (tối đa {REMAKE_MAX_SHOTS})</legend>
        {scenes.shots.map((s, i) => {
          const index = scenes.first[i]!;
          const on = chosen.includes(index);
          return (
            <label key={index}>
              <input type="checkbox" checked={on} disabled={busy || (!on && chosen.length >= REMAKE_MAX_SHOTS)} onChange={() => toggle(index)} />
              Cảnh {s.index}
              <span className="muted">{timeRange(s.start, s.end)}</span>
            </label>
          );
        })}
      </fieldset>
      <button type="button" className="primary" disabled={busy || running || !product[0] || chosen.length === 0} onClick={() => void remake()}>
        Tạo video với sản phẩm
        {chosen.length > 0 && <span className="run-cost"> · ${remakeEstimate(chosen.length)}</span>}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {remakes.length > 0 && (
        <ul className="remake-list">
          {remakes.map((r) => (
            <RemakeResult key={r.id} row={r} scene={scene} />
          ))}
        </ul>
      )}
    </section>
  );
}
