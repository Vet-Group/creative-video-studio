'use client';
// What the Try On and Image Generation pages share: the image-model picker data, the choice of model, ratio and resolution, the upload slot,
// the tab strip and the gallery of the company's outputs.
import { type DragEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { api, type Clip } from '@/lib/api';
import { exampleFrom, refillFrom, reuseHref } from '@/lib/reuse';
import { NARROW, useMediaQuery, WIDE } from '@/lib/use-media-query';
import { numberedSamples } from '@/lib/examples';
import { useHydrated } from '@/lib/use-hydrated';
import { useSamples } from '@/lib/use-samples';
import { type Photo, Recreate, useForm, useFreshResults, useJobs, useRecreated } from './jobs';
import { Icon, type IconName } from './Icon';
import { Modal } from './Modal';
import { Preview } from './Preview';
import { SampleDetail } from './SampleDetail';
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
  /** The model's prompt limit (the API caps it at PROMPT_CEILING). */
  maxPromptChars: number;
  /** It makes a picture from words alone (Image Generation with no reference image). */
  textToImage: boolean;
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
export function useImageChoice(models: ImageModel[] | null, images: number, initialModel = '') {
  const [modelId, setModelId] = useState(initialModel);
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

/** What the reuse link reads back from a job (GET /api/jobs/:id) to refill an image page. */
export interface ReuseJob {
  feature: string;
  /** A sample's details file (`?example=`) names its photos as samples; a job or a template has uploaded images. */
  images: (Img | { sample: string })[];
  /** The job's prompt: the member's own text on Image Generation, a composed prompt elsewhere. */
  prompt: string | null;
  /** The member's own text, kept for reuse (Try On and the apps). */
  brief: string | null;
  garments: number | null;
  enhance: boolean | null;
  ratio: string | null;
  resolution: string | null;
  modelId: string | null;
}

/** Refill (`reuse` is a job's or a saved template's API path, lib/reuse.ts): reads it and hands it to `fill` when it is of `feature`; `fail` otherwise. Everything stays editable.
 * Returns Recreate in place: the same refill from another path, the URL unchanged, as Fash's Recreate. */
export function useReuse(reuse: string | undefined, feature: string, fill: (j: Omit<ReuseJob, 'images'> & { images: Img[] }) => void, fail: () => void): (from: string) => void {
  const recreated = useRecreated();
  const { loading } = useJobs();
  const [source, setSource] = useState(reuse ? { from: reuse } : null); // a new object each time, so the same path refills again
  useEffect(() => {
    if (!source) return;
    const reuse = source.from;
    let stale = false; // a refill superseded (another link, or a re-run effect) must not fill or upload
    api<ReuseJob>(reuse)
      .then(async (j) => {
        if (stale) return;
        if (j.feature !== feature) return fail();
        // A sample's photos are uploaded as this member's inputs first, as a picked sample is.
        const samples = j.images.flatMap((i) => ('sample' in i ? [i.sample] : []));
        fill({ ...j, images: samples.length > 0 ? await uploadImages(await Promise.all(samples.map(sampleFile))) : (j.images as Img[]) });
        recreated(reuse);
      })
      .catch(fail)
      .finally(loading('Đang tải ảnh...'));
    return () => {
      stale = true;
    };
  }, [source]);
  return (from) => setSource({ from });
}

/** Uploads files through /api/assets and returns the new assets. */
/** The most files one POST /api/assets takes (MAX_FILES in lib/assets.ts); a larger pick (Advanced takes 7) goes up in batches. */
const PER_UPLOAD = 4;

/** A sample picture as a file the user picked, to upload as an input. */
export async function sampleFile(name: string): Promise<File> {
  const res = await fetch(`/api/samples/${name}`);
  if (!res.ok) throw new Error(`sample ${name}: ${res.status}`);
  return new File([await res.blob()], name, { type: res.headers.get('content-type') ?? '' });
}

/** A detail's photo as one of the form's images: a sample is uploaded as the member's own, an asset is read for its name. */
export async function photoImg(p: Photo): Promise<Img> {
  if ('sample' in p) return (await uploadImages([await sampleFile(p.sample)]))[0]!;
  const a = await api<Img>(`/api/assets/${p.asset}`);
  return { id: a.id, filename: a.filename };
}

export async function uploadImages(files: File[]): Promise<Img[]> {
  const out: Img[] = [];
  for (let i = 0; i < files.length; i += PER_UPLOAD) {
    const form = new FormData();
    for (const f of files.slice(i, i + PER_UPLOAD)) form.append('file', f);
    out.push(...(await api<{ assets: Img[] }>('/api/assets', { method: 'POST', body: form })).assets);
  }
  return out;
}

/**
 * One labelled upload slot: its thumbnails with a remove button each, and a tile that opens the file picker until the slot is full.
 * `samples` (sample names, lib/samples.ts) show while the slot is empty, as on the live Try On; a click uploads that sample like a file the user picked.
 * `icon` is the empty slot's icon: a picture by default, a plus on Advanced's wide slot, as on the live page.
 */
export function Slot({ label, empty, inputLabel, images, max, busy, onAdd, onRemove, samples = [], icon = 'image', onBrowse }: { label: string; empty: string; inputLabel: string; images: Img[]; max: number; busy: boolean; onAdd: (files: File[]) => void; onRemove: (id: string) => void; samples?: string[]; icon?: IconName; onBrowse?: () => void }) {
  const hydrated = useHydrated();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const labelId = useId();
  const full = images.length >= max;
  const offer = images.length === 0 ? samples : [];
  async function pickSample(name: string) {
    const file = await sampleFile(name).catch(() => null);
    if (file) onAdd([file]);
  }
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
      <div className="slot" role="group" aria-labelledby={labelId} data-over={over} data-one={(max === 1 && images.length === 1) || undefined} onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={onDrop}>
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
                {max === 1 && (
                  <span className="slot-chip" aria-hidden="true">
                    {label}
                  </span>
                )}
                <button type="button" aria-label={`Bỏ ảnh ${i.filename}`} onClick={() => onRemove(i.id)}>
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {offer.length > 0 && (
          <ul className="slot-samples" aria-label={`${label}: ảnh mẫu`}>
            {offer.map((name, i) => (
              <li key={name}>
                <button type="button" aria-label={`Dùng ảnh mẫu ${i + 1} cho ${label}`} disabled={!hydrated || busy} onClick={() => void pickSample(name)}>
                  <img src={`/api/samples/${name}`} alt="" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* Empty, the whole slot is the upload button, a grey circle over its hint as on the live pages; with images, a small tile adds more. */}
        {!full && (
          <button type="button" className="slot-add" aria-label={`Tải lên ${label}`} aria-haspopup={onBrowse ? 'dialog' : undefined} title={images.length === 0 ? empty : undefined} disabled={!hydrated || busy} onClick={() => (onBrowse ? onBrowse() : input.current?.click())}>
            <span className="slot-icon" aria-hidden="true">
              <Icon name={images.length === 0 && offer.length === 0 ? icon : 'plus'} size={16} />
              {offer.length > 0 && <span>Tải lên</span>}
            </span>
            {/* A half-width slot shows just its name, as on the live pages; the full hint is its tooltip there. */}
            {images.length === 0 && offer.length === 0 && <span className="slot-hint">{empty}</span>}
            {images.length === 0 && offer.length === 0 && <span className="slot-name">{label}</span>}
          </button>
        )}
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
type PhotoTile = { key: string; src: string; label: string; pick: () => void };

/** A photo dialog of a slot, as on Fash (Marketing's model and product, Try On's model, garments and background): the photos to pick, 4 per row of 3:4 portraits. The product dialog has a subtitle and an upload tile first; a stock dialog's own-photo upload is a link in the header. A tile that opens a deeper list (a model's poses, a category) sets the dialog again after it closes; `onBack` returns. */
export function PhotoDialog({ open, title, sub, tiles, busy, onFile, onClose, onBack, mine }: { open: boolean; title: string; sub?: string; tiles: PhotoTile[]; busy: boolean; onFile: (files: File[]) => void; onClose: () => void; onBack?: () => void; mine?: { title: string; tiles: PhotoTile[] } }) {
  const tile = (t: PhotoTile) => (
    <button key={t.key} type="button" aria-label={t.label} disabled={busy} onClick={() => (onClose(), t.pick())}>
      {open && <img src={t.src} alt="" />}
    </button>
  );
  const upload = (
    <>
      Tải lên ảnh của bạn
      <input type="file" accept="image/*" className="sr-only" onChange={(e) => (onClose(), onFile([...(e.target.files ?? [])].slice(0, 1)))} />
    </>
  );
  return (
    <Modal open={open} onClose={onClose} label={title} className="choice-dialog">
      <h2>
        {onBack && (
          <button type="button" className="photo-back" aria-label="Quay lại" onClick={onBack}>
            <Icon name="left" size={16} />
          </button>
        )}
        {title}
      </h2>
      {sub && <p className="modal-sub">{sub}</p>}
      {!sub && <label className="photo-upload-link">{upload}</label>}
      <div className="choice-grid model-grid">
        {sub && (
          <label className="model-upload">
            <Icon name="plus" size={16} />
            {upload}
          </label>
        )}
        {tiles.map(tile)}
      </div>
      {/* The member's own photos of this slot, under their own heading, as Fash's My Models. */}
      {mine && mine.tiles.length > 0 && (
        <section aria-label={mine.title}>
          <h3 className="photo-mine">{mine.title}</h3>
          <div className="choice-grid model-grid">{mine.tiles.map(tile)}</div>
        </section>
      )}
    </Modal>
  );
}

/** Fash's card actions on a sample with a details file, shown on hover: Recreate at the foot; Use Result (a picture), download and open at the side. */
function SampleActions({ name }: { name: string }) {
  const form = useForm();
  const from = exampleFrom({ example: name.replace(/\.(mp4|jpg)$/, '') });
  if (!form || !from) return null;
  return (
    <>
      <div className="card-actions">
        {name.endsWith('.jpg') && form.result && (
          <button type="button" aria-label="Dùng kết quả" title="Dùng kết quả" onClick={() => form.result!({ sample: name })}>
            <Icon name="right" />
          </button>
        )}
        <a href={`/api/samples/${name}`} download={name} aria-label="Tải xuống" title="Tải xuống">
          <Icon name="download" />
        </a>
        <a href={`/api/samples/${name}`} target="_blank" rel="noreferrer" aria-label="Mở trong tab mới" title="Mở trong tab mới">
          <Icon name="external" />
        </a>
      </div>
      <button type="button" className="card-recreate" onClick={() => form.recreate(from)}>
        Dùng lại
      </button>
    </>
  );
}

export function Gallery({ kind, label, emptyText, video = false, cols = [2, 3, 4], samples }: { kind: string; label: string; emptyText: string; video?: boolean; cols?: [number, number, number]; samples?: string }) {
  const have = useSamples();
  const sampleTiles = samples ? numberedSamples(have, samples, video ? 'mp4' : 'jpg') : [];
  /** The samples with a details file open in place (SampleDetail); other clips still open in a new tab. */
  const detailed = sampleTiles.filter((n) => have.has(n.replace(/\.(mp4|jpg)$/, '.json')));
  const [open, setOpen] = useState<number | null>(null);
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
  useFreshResults(() => void load(0));

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
                    <a href={`/api/samples/${it}`} target="_blank" rel="noreferrer" aria-label={detailed.includes(it) ? 'Xem chi tiết video mẫu' : 'Mở video mẫu trong tab mới'} onClick={detailed.includes(it) ? (e) => (e.preventDefault(), setOpen(detailed.indexOf(it))) : undefined}>
                      <Preview src={`/api/samples/${it}`} poster={`/api/samples/${it.replace(/\.mp4$/, '.jpg')}`} width={9} height={16} title="Video mẫu" />
                    </a>
                  ) : detailed.includes(it) ? (
                    <a href={`/api/samples/${it}`} target="_blank" rel="noreferrer" aria-label="Xem chi tiết ảnh mẫu" onClick={(e) => (e.preventDefault(), setOpen(detailed.indexOf(it)))}>
                      <img src={`/api/samples/${it}`} alt="Ảnh mẫu" loading="lazy" />
                    </a>
                  ) : (
                    <img src={`/api/samples/${it}`} alt="Ảnh mẫu" loading="lazy" />
                  )}
                  {detailed.includes(it) && <SampleActions name={it} />}
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
                {/* Fash's "Use this template": the page's form filled from this result's inputs (a Library clip's inputs are open to every member). */}
                {reuseHref(it) && (
                  <Recreate href={reuseHref(it)!} from={refillFrom({ reuse: it.id })!} className="gallery-use" label={`Dùng mẫu này: ${it.modelLabel}, ${it.ratio}`}>
                    Dùng mẫu này
                  </Recreate>
                )}
              </li>
              ),
            )}
          </ul>
        ))}
      </div>
      {open !== null && <SampleDetail names={detailed} index={open} onIndex={setOpen} />}
      {state === 'error' && sampleTiles.length > 0 && <p className="error">Không tải được kết quả của công ty.</p>}
      {hasMore && (
        <button type="button" className="gallery-more" onClick={() => void load(items.length)}>
          Tải thêm
        </button>
      )}
    </>
  );
}
