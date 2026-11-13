'use client';
// Smart Remake (Feature B) under a finished analysis: the member picks one of their product photos and up to REMAKE_MAX_SHOTS shots,
// the worker puts the product into each shot's own clip, keeping its motion and length (apps/worker/src/remake.ts), and the clips are
// joined into one silent video, with a before/after beside it. Rendered only when REA_REMAKE_ENABLED is on (AnalyzeView's remakeEnabled);
// the API 404s otherwise.
import type { Analysis } from '@cvs/core/analysis/breakdown';
import { REMAKE_MAX_SECONDS, REMAKE_MAX_SHOTS, REMAKE_MIN_SECONDS, remakeScene, remakeShotSeconds, remakeShotUsd } from '@cvs/core/analysis/remake';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { mergeShots, timeRange } from '@/lib/analyze';
import { api, errorText, sendJson } from '@/lib/api';
import { confirmRun } from '@/lib/run-guard';
import { useFrames } from '@/lib/use-frames';
import type { AnalysisRow } from './AnalyzeView';
import { confirmDialog } from './Confirm';
import { type Img, Slot, uploadError, uploadImages } from './image-tools';

export interface RemakeRow {
  id: string;
  analysisId: string;
  shots: number[]; // the first stored shot of each scene asked for
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed';
  result: { shots: { index: number; status: 'succeeded' | 'failed'; clipAssetId?: string }[]; compareAssetId?: string } | null;
  outputAssetId: string | null;
  costUsd: string | null;
  createdAt: string;
}

const STATUS: Record<RemakeRow['status'], string> = { queued: 'Đang chờ…', running: 'Đang tạo video…', succeeded: 'Xong', partial: 'Xong một phần', failed: 'Không thành công' };
const isOpen = (r: RemakeRow) => r.status === 'queued' || r.status === 'running';

/** What these shots are estimated to cost, as the API counts it against the spending caps. */
export const remakeEstimate = (shots: { start: number; end: number }[]): string => shots.reduce((sum, s) => sum + remakeShotUsd(s), 0).toFixed(2);

// A rough run time, from the first real run: about a minute per billed second of a scene plus about a minute of overhead, one scene after another.
const SCENE_OVERHEAD_MIN = 1;
const UNKNOWN_SCENE_MIN = 4; // a scene whose length is not known here (no analysis at hand)

/** About how many minutes an open remake still has to run: its scenes not yet in the result, each by its billed seconds when the `analysis` is at hand. At least 1. */
export function remakeMinutesLeft(row: RemakeRow, analysis?: Analysis | null): number {
  const done = new Set((row.result?.shots ?? []).map((s) => s.index));
  const left = row.shots.filter((index) => !done.has(index));
  const minutes = left.reduce((sum, index) => {
    const scene = analysis ? remakeScene(analysis, index) : undefined;
    return sum + (scene ? remakeShotSeconds(scene) + SCENE_OVERHEAD_MIN : UNKNOWN_SCENE_MIN);
  }, 0);
  return Math.max(1, minutes);
}

/** One remake: its state, the joined video, then each shot's clip or that it failed. Pure, so it render-tests without the page. `scene` numbers a stored shot as the result list does;
 * `analysis`, when the page has it, makes the time left more exact; `children` end the item (a link back to the analysis). */
export function RemakeResult({ row, scene = (index) => index, analysis, onDelete, children }: { row: RemakeRow; scene?: (index: number) => number; analysis?: Analysis | null; onDelete?: () => void; children?: ReactNode }) {
  const shots = row.result?.shots ?? [];
  return (
    <li className="remake-item">
      <p role={isOpen(row) ? 'status' : undefined}>
        <strong>{STATUS[row.status]}</strong>
        {isOpen(row) ? (
          <span className="muted">
            {' '}
            · Đã xong {shots.length}/{row.shots.length} cảnh · còn khoảng {remakeMinutesLeft(row, analysis)} phút
          </span>
        ) : row.costUsd !== null && <span className="muted"> · ${Number(row.costUsd).toFixed(2)}</span>}
      </p>
      {row.outputAssetId && (
        <>
          <video className="remake-video" src={`/api/assets/${row.outputAssetId}/content`} controls playsInline preload="metadata" aria-label="Video Smart Remake" />
          <a className="link-button" href={`/api/assets/${row.outputAssetId}/download`}>
            Tải video
          </a>
          {row.result?.compareAssetId && (
            <>
              <video className="remake-video" src={`/api/assets/${row.result.compareAssetId}/content`} controls playsInline preload="metadata" aria-label="So sánh trước/sau" />
              <a className="link-button" href={`/api/assets/${row.result.compareAssetId}/content`} target="_blank" rel="noreferrer">
                Xem so sánh trước/sau
              </a>
            </>
          )}
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
      {onDelete && !isOpen(row) && (
        <button type="button" className="link-button" onClick={onDelete}>
          Xoá
        </button>
      )}
      {children}
    </li>
  );
}

// The unsent form per analysis id, so a remount (AnalyzeView moves the panel across its 1024 px breakpoint) keeps the pick; cleared once a remake is sent.
export const remakeDrafts = new Map<string, { product: Img[]; chosen: number[] }>();

/**
 * The Smart Remake form and this analysis' remakes, newest first. Mount it with `key` set to the analysis id, so a pick starts over. The Smart Remake app
 * (SmartRemakeApp) asks for the product and the scenes itself: it passes them as `initialProduct` and `initialChosen` (a saved draft wins), a `note` on how
 * they were chosen, and `productFixed` to leave the product slot to its own form.
 */
export function RemakePanel({ row, initialProduct, initialChosen, note, productFixed = false }: { row: AnalysisRow; initialProduct?: Img[]; initialChosen?: number[]; note?: string; productFixed?: boolean }) {
  // The scenes as the result list numbers them; a scene is sent as its first stored shot, which the API and the worker take.
  const scenes = row.result ? mergeShots(row.result) : { shots: [], first: [] };
  const scene = (index: number) => scenes.first.filter((f) => f <= index).length;
  const [product, setProduct] = useState<Img[]>(remakeDrafts.get(row.id)?.product ?? initialProduct ?? []);
  const [chosen, setChosen] = useState<number[]>(remakeDrafts.get(row.id)?.chosen ?? initialChosen ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [remakes, setRemakes] = useState<RemakeRow[]>([]);
  const pickBox = useRef<HTMLFieldSetElement>(null);
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

  useEffect(() => {
    remakeDrafts.set(row.id, { product, chosen });
  }, [row.id, product, chosen]);

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
    if (!(await confirmRun(remakeEstimate(picked)))) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/remakes', sendJson('POST', { analysisId: row.id, productAssetId: product[0].id, shots: chosen }));
      remakeDrafts.delete(row.id);
      setSent((n) => n + 1);
    } catch (e) {
      setError(errorText(e, 'Không bắt đầu được Smart Remake. Hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: RemakeRow) {
    if (!(await confirmDialog({ title: 'Xoá video này?', body: 'Video và các clip của lượt làm lại này sẽ mất. Ảnh sản phẩm của bạn vẫn còn.', confirmLabel: 'Xoá', danger: true }))) return;
    setError('');
    try {
      await api(`/api/remakes/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
      setRemakes((list) => list.filter((m) => m.id !== r.id));
    } catch (e) {
      setError(errorText(e, 'Không xoá được video này. Hãy thử lại.'));
    }
  }

  const running = remakes.some(isOpen); // one at a time per analysis, so a double click cannot pay twice
  const toggle = (index: number) => setChosen((c) => (c.includes(index) ? c.filter((n) => n !== index) : [...c, index]));
  const picked = scenes.shots.filter((_, i) => chosen.includes(scenes.first[i]!)); // whole scenes, as the API prices them
  const frames = useFrames(row.sourceAssetId ? `/api/assets/${row.sourceAssetId}/content` : undefined, scenes.shots, pickBox); // null when there is no video or it will not decode

  return (
    <section className="remake-panel" aria-labelledby={`remake-${row.id}`}>
      <h2 id={`remake-${row.id}`}>Smart Remake</h2>
      <p className="help">
        Giữ mạch truyện của video này, thay sản phẩm trong các cảnh bạn chọn bằng ảnh sản phẩm của bạn. Mỗi cảnh giữ nguyên chuyển động và độ dài (tính tiền từ {REMAKE_MIN_SECONDS} đến {REMAKE_MAX_SECONDS} giây một cảnh), không tiếng, rồi được ghép lại thành một video kèm bản so sánh trước/sau.
      </p>
      {note && <p className="help" role="status">{note}</p>}
      {!productFixed && <Slot label="Ảnh sản phẩm" empty="Thêm 1 ảnh sản phẩm" inputLabel="Ảnh sản phẩm" images={product} max={1} busy={busy} onAdd={(files) => void upload(files)} onRemove={() => setProduct([])} onPick={(a) => setProduct([a])} slot="product" />}
      <fieldset className="remake-pick" ref={pickBox}>
        <legend>Cảnh cần thay sản phẩm (tối đa {REMAKE_MAX_SHOTS})</legend>
        {scenes.shots.map((s, i) => {
          const index = scenes.first[i]!;
          const on = chosen.includes(index);
          return (
            <label key={index}>
              <input type="checkbox" checked={on} disabled={busy || (!on && chosen.length >= REMAKE_MAX_SHOTS)} onChange={() => toggle(index)} />
              {frames && (frames[i] ? <img className="analysis-frame" src={frames[i]} alt="" /> : <span className="analysis-frame" aria-hidden="true" />)}
              Cảnh {s.index}
              <span className="muted">{timeRange(s.start, s.end)}</span>
            </label>
          );
        })}
      </fieldset>
      <button type="button" className="primary" disabled={busy || running || !product[0] || chosen.length === 0} onClick={() => void remake()}>
        Tạo video với sản phẩm
        {chosen.length > 0 && <span className="run-cost"> · ${remakeEstimate(picked)}</span>}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {remakes.length > 0 && (
        <ul className="remake-list">
          {remakes.map((r) => (
            <RemakeResult key={r.id} row={r} scene={scene} analysis={row.result} onDelete={() => void remove(r)} />
          ))}
        </ul>
      )}
    </section>
  );
}
