'use client';
// What the Try On and Image Generation pages share: the image-model picker data, the choice of model, ratio and resolution, the upload slot,
// the tab strip and the gallery of the company's outputs.
import { type DragEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { api, type Clip } from '@/lib/api';
import { NARROW, useMediaQuery, WIDE } from '@/lib/use-media-query';
import { numberedSamples } from '@/lib/examples';
import { useHydrated } from '@/lib/use-hydrated';
import { useSamples } from '@/lib/use-samples';
import { Icon } from './Icon';
import { Preview } from './Preview';
import type { ModelOption } from './ModelPicker';

export interface ImageModel {
  id: string;
  label: string;
  provider: string;
  isMock: boolean;
  ratios: string[];
  resolutions: string[];
  /** USD per image by resolution, as 4-decimal strings. */
  prices: Record<string, string>;
  maxImages: number;
  /** The recommendation score (0-100) for this feature, and whether it is the one to recommend. */
  score: number;
  recommended: boolean;
}
export interface Img {
  id: string;
  filename: string;
}

export const RATIO_LABEL: Record<string, string> = { auto: 'Tự động' };
export const UPLOAD_ERROR = 'Không tải ảnh lên được. Ảnh phải là JPEG, PNG hoặc WebP, tối đa 10 MB mỗi ảnh.';

/** The enabled image models of a feature, from /api/image-models; `models` is null while loading and `failed` once the request has failed. */
export function useImageModels(feature: string): { models: ImageModel[] | null; failed: boolean } {
  const [state, setState] = useState<{ models: ImageModel[] | null; failed: boolean }>({ models: null, failed: false });
  useEffect(() => {
    api<{ models: ImageModel[] }>(`/api/image-models?feature=${feature}`).then(
      (r) => setState({ models: r.models, failed: false }),
      () => setState({ models: [], failed: true }),
    );
  }, [feature]);
  return state;
}

/**
 * The model, ratio and resolution of a Run. The chosen model stays while it is listed (until one is chosen, the recommended model that takes the inputs);
 * a ratio or resolution the model lacks falls back to its first,
 * so the options always match the model. `images` is how many inputs the Run has: a model that takes fewer is shown as not supported.
 */
export function useImageChoice(models: ImageModel[] | null, images: number) {
  const [modelId, setModelId] = useState('');
  const [wantRatio, setRatio] = useState('auto');
  const [wantResolution, setResolution] = useState('1K');
  const fits = (m: ImageModel) => m.maxImages >= images;
  const chosen = models?.find((m) => m.id === modelId) ?? models?.find((m) => m.recommended && fits(m)) ?? models?.find(fits) ?? models?.[0];
  const ratio = chosen && !chosen.ratios.includes(wantRatio) ? chosen.ratios[0]! : wantRatio;
  const resolution = chosen && !chosen.resolutions.includes(wantResolution) ? chosen.resolutions[0]! : wantResolution;
  const options: ModelOption[] = (models ?? []).map((m) => ({
    id: m.id, label: m.label, isMock: m.isMock, supported: fits(m), estimateUsd: m.prices[resolution] ?? Object.values(m.prices)[0] ?? '0.0000', score: m.score, recommended: m.recommended,
  }));
  return { chosen, ratio, resolution, estimate: chosen?.prices[resolution], options, modelId: chosen?.id ?? '', setModelId, setRatio, setResolution };
}

/** Uploads files through /api/assets and returns the new assets. */
export async function uploadImages(files: File[]): Promise<Img[]> {
  const form = new FormData();
  for (const f of files) form.append('file', f);
  return (await api<{ assets: Img[] }>('/api/assets', { method: 'POST', body: form })).assets;
}

/** One labelled upload slot: its thumbnails with a remove button each, and a tile that opens the file picker until the slot is full. */
export function Slot({ label, empty, inputLabel, images, max, busy, onAdd, onRemove }: { label: string; empty: string; inputLabel: string; images: Img[]; max: number; busy: boolean; onAdd: (files: File[]) => void; onRemove: (id: string) => void }) {
  const hydrated = useHydrated();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const labelId = useId();
  const full = images.length >= max;
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (hydrated && !full && !busy) onAdd([...e.dataTransfer.files].slice(0, max - images.length));
  }
  return (
    <div className="field">
      <span id={labelId} className="field-label">
        {label}
      </span>
      <div className="slot" role="group" aria-labelledby={labelId} data-over={over} onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple={max > 1}
          hidden
          aria-label={inputLabel}
          disabled={!hydrated}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])].slice(0, max - images.length);
            e.target.value = '';
            onAdd(files);
          }}
        />
        {images.length > 0 && (
          <ul className="slot-thumbs" aria-label={`${label}: ảnh đã chọn`}>
            {images.map((i) => (
              <li key={i.id}>
                <img src={`/api/assets/${i.id}/content`} alt={i.filename} />
                <button type="button" aria-label={`Bỏ ảnh ${i.filename}`} onClick={() => onRemove(i.id)}>
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {!full && (
          <button type="button" className="slot-add" aria-label={`Tải lên ${label}`} disabled={!hydrated || busy} onClick={() => input.current?.click()}>
            <Icon name="plus" size={16} />
            <span>Tải lên</span>
          </button>
        )}
        {images.length === 0 && <span className="slot-hint">{empty}</span>}
      </div>
    </div>
  );
}

/** The tab strip of a page: arrows, Home and End move between the tabs. */
export function WorkTabs<T extends string>({ prefix, tabs, labels, shown, onSelect }: { prefix: string; tabs: T[]; labels: Record<T, string>; shown: T; onSelect: (t: T) => void }) {
  function onKey(e: KeyboardEvent) {
    const i = tabs.indexOf(shown);
    const moves: Record<string, number> = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 };
    const next = moves[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onSelect(tabs[next]!);
    document.getElementById(`${prefix}-tab-${tabs[next]}`)?.focus();
  }
  return (
    <div className="tabs" role="tablist" aria-label="Khu vực làm việc" onKeyDown={onKey}>
      {tabs.map((t) => (
        <button key={t} type="button" role="tab" id={`${prefix}-tab-${t}`} aria-selected={shown === t} aria-controls={shown === t ? `${prefix}-panel-${t}` : undefined} tabIndex={shown === t ? 0 : -1} onClick={() => onSelect(t)}>
          {labels[t]}
        </button>
      ))}
    </div>
  );
}

/** The model, resolution and ratio fields, shown locked while no model is enabled, so the form keeps its shape; the run button's notice says why. */
export function LockedFields() {
  return (
    <div className="locked-fields" aria-hidden="true">
      {['Mô hình', 'Độ phân giải', 'Tỉ lệ'].map((label, i) => (
        <div key={label} className="field">
          <span className="field-label">{label}</span>
          <span className="select-trigger locked">{i === 0 ? 'Chưa bật mô hình' : '—'}</span>
        </div>
      ))}
    </div>
  );
}

const aspectOf = (ratio: string): string => (/^\d+:\d+$/.test(ratio) ? ratio.replace(':', ' / ') : '1 / 1');

const GALLERY_SIZE_KEY = 'cvs.gallery.size';

/** The company's latest outputs of one Library `kind` (`try_on`, `image` or, with `video`, `marketing`) in a masonry of columns; 24 at a time.
 * `cols` is the column count below 1024 px, up to 1536 px and above; from 1024 px a slider (as on Fash) shows one column more or less, remembered per browser.
 * `samples` names the fixed sample tiles shown first: the uploaded samples `<samples><n>.jpg` (or `.mp4` with a `.jpg` poster for `video`). */
export function Gallery({ kind, label, emptyText, video = false, cols = [2, 3, 4], samples }: { kind: string; label: string; emptyText: string; video?: boolean; cols?: [number, number, number]; samples?: string }) {
  const have = useSamples();
  const sampleTiles = samples ? numberedSamples(have, samples, video ? 'mp4' : 'jpg') : [];
  const [items, setItems] = useState<Clip[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [size, setSize] = useState(1); // 0 small tiles, 1 default, 2 large tiles
  const narrow = useMediaQuery(NARROW);
  const wide = useMediaQuery(WIDE);
  const columns = narrow ? cols[0] : Math.max(1, (wide ? cols[2] : cols[1]) + 1 - size);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(GALLERY_SIZE_KEY) ?? 1);
      if (saved === 0 || saved === 1 || saved === 2) setSize(saved);
    } catch {} // blocked storage: the default size
  }, []);
  function resize(next: number) {
    setSize(next);
    try {
      localStorage.setItem(GALLERY_SIZE_KEY, String(next));
    } catch {}
  }
  const loading = useRef(false); // a second click while a page loads would append it twice

  async function load(offset: number) {
    if (loading.current) return;
    loading.current = true;
    try {
      const r = await api<{ hasMore: boolean; clips: Clip[] }>(`/api/library?kind=${kind}${offset > 0 ? `&offset=${offset}` : ''}`);
      setItems((cur) => (offset > 0 ? [...cur, ...r.clips] : r.clips));
      setHasMore(r.hasMore);
      setState('ready');
    } catch {
      setState('error');
    } finally {
      loading.current = false;
    }
  }
  useEffect(() => {
    void load(0);
  }, [kind]);

  // The fixed samples show at once; only the company's own outputs wait for the request.
  if (sampleTiles.length === 0) {
    if (state === 'loading') return <p role="status" className="muted">Đang tải...</p>;
    if (state === 'error') return <p className="error">Không tải được ảnh mẫu.</p>;
    if (items.length === 0) return <p className="muted">{emptyText}</p>;
  }
  const tiles: (Clip | string)[] = [...sampleTiles, ...items];
  return (
    <>
      {!narrow && (
        <div className="gallery-tools">
          <label className="library-size">
            <span className="sr-only">Cỡ ô</span>
            <Icon name="library" />
            <input type="range" min={0} max={2} step={1} value={size} onChange={(e) => resize(Number(e.target.value))} aria-valuetext={['Nhỏ', 'Vừa', 'Lớn'][size]} />
            <Icon name="ratio" />
          </label>
        </div>
      )}
      <div className="masonry" role="group" aria-label={label}>
        {Array.from({ length: columns }, (_, c) => (
          <ul key={c} className="masonry-col">
            {tiles.filter((_, i) => i % columns === c).map((it) =>
              typeof it === 'string' ? (
                <li key={it} className="gallery-item">
                  {video ? (
                    <a href={`/api/samples/${it}`} target="_blank" rel="noreferrer" aria-label="Mở video mẫu trong tab mới">
                      <Preview src={`/api/samples/${it}`} poster={`/api/samples/${it.replace(/\.mp4$/, '.jpg')}`} width={9} height={16} title="Video mẫu" />
                    </a>
                  ) : (
                    <img src={`/api/samples/${it}`} alt="Ảnh mẫu" loading="lazy" />
                  )}
                </li>
              ) : (
              <li key={it.id} className="gallery-item" style={{ aspectRatio: aspectOf(it.ratio) }}>
                {video ? (
                  <a href={`/api/assets/${it.videoAssetId}/content`} target="_blank" rel="noreferrer" aria-label={`Mở video ${it.modelLabel}, ${it.ratio} trong tab mới`}>
                    <Preview src={`/api/assets/${it.videoAssetId}/content`} poster={it.posterAssetId ? `/api/assets/${it.posterAssetId}/content` : ''} width={Number(it.ratio.split(':')[0]) || 9} height={Number(it.ratio.split(':')[1]) || 16} title={`${it.modelLabel}, ${it.ratio}`} />
                  </a>
                ) : (
                  <img src={`/api/assets/${it.videoAssetId}/content`} alt={`${it.modelLabel}, ${it.ratio}`} loading="lazy" />
                )}
              </li>
              ),
            )}
          </ul>
        ))}
      </div>
      {state === 'error' && sampleTiles.length > 0 && <p className="error">Không tải được kết quả của công ty.</p>}
      {hasMore && (
        <button type="button" className="gallery-more" onClick={() => void load(items.length)}>
          Tải thêm
        </button>
      )}
    </>
  );
}
