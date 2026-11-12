'use client';
// What the Try On and Image Generation pages share: the image-model picker data, the choice of model, ratio and resolution, the upload slot,
// the tab strip and the gallery of the company's outputs.
import { type DragEvent, type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type Clip, sendJson, thumbUrl } from '@/lib/api';
import { dropRefillQuery, exampleFrom, refillFrom, reuseHref } from '@/lib/reuse';
import { NARROW, useMediaQuery, WIDE } from '@/lib/use-media-query';
import { numberedSamples } from '@/lib/examples';
import { useFashionModels } from '@/lib/use-fashion-models';
import { useHydrated } from '@/lib/use-hydrated';
import { useSamples } from '@/lib/use-samples';
import { MAX_AUDIO_BYTES, MAX_BYTES, MAX_VIDEO_BYTES, MAX_VIDEO_BYTES_R2 } from '@/lib/upload-limits';
import type { RefVideo } from './ReferenceVideo';
import { AI_MODEL_SLOTS, slotOfLabel, UPLOAD_SLOTS, type UploadSlot } from '@/lib/upload-slots';
import { type FashionModelItem, usable } from '@/lib/fashion-models';
import { type Photo, Recreate, useForm, useFreshResults, useJobs, useRecreated } from './jobs';
import { Icon, type IconName } from './Icon';
import { LoadError } from './LoadError';
import { Modal } from './Modal';
import { Preview } from './Preview';
import { Select } from './Select';
import { StorePicker, type StoreOption } from './StorePicker';
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
  /** The thinking levels it takes, the first the default (Nano Banana 2.1); empty for none. */
  thinking: string[];
  /** USD per image by level and resolution, as `prices` is at the first level; empty for none. */
  thinkingPrices: Record<string, Record<string, string>>;
  /** The recommendation score (0-100) for this feature, and whether it is the one to recommend. */
  score: number;
  recommended: boolean;
  /** Added in the last 14 days. */
  isNew: boolean;
  creditUsd: string | null;
  creditShown: boolean;
  /** How many marks the score rests on. */
  total: number;
}
export interface Img {
  id: string;
  filename: string;
  /** A picture that is not an uploaded asset (an object URL, as in Media Optimizer); else the asset's content. */
  url?: string;
}

export const RATIO_LABEL: Record<string, string> = { auto: 'Tự động' };
/** Fash's Minimal, Medium and High. */
export const THINKING_LABEL: Record<string, string> = { minimal: 'Tối thiểu', medium: 'Vừa', high: 'Cao' };
export const UPLOAD_ERROR = 'Không tải ảnh lên được do lỗi mạng hoặc máy chủ. Hãy thử lại.';
/** The 429 of POST /api/assets/samples: the hourly cap on new pictures. */
export const COPY_LIMIT_ERROR = 'Bạn đã thêm quá nhiều ảnh trong một giờ. Hãy thử lại sau.';
/** The text for a failed sample copy: the hourly cap has its own, anything else is `text`. */
export const copyError = (e: unknown, text: string) => (e instanceof ApiError && e.status === 429 ? COPY_LIMIT_ERROR : text);

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

/** The option nearest `want` (a w:h ratio by shape, a resolution by its K), else the first: a 4:5 sample on a model without 4:5 gets 3:4, a 4K one 2K. */
export function nearestOption(options: string[], want: string): string {
  if (options.includes(want)) return want;
  const value = (s: string) => {
    const [, a, b] = s.match(/^(\d+):(\d+)$/) ?? s.match(/^(\d+)(K)$/) ?? [];
    return a === undefined ? undefined : Math.log(Number(a) / (b === 'K' ? 1 : Number(b)));
  };
  const w = value(want);
  const off = (o: string) => Math.abs((value(o) ?? Infinity) - (w ?? 0));
  return w === undefined ? options[0]! : options.reduce((a, b) => (off(b) < off(a) ? b : a));
}

/** The line a refill shows when the model lacks the ratio or resolution it asked for, empty when it has both. */
export function refillNote(asked: { ratio?: string | null; resolution?: string | null }, ratio: string, resolution: string): string {
  const missed = [
    ...(asked.ratio && asked.ratio !== ratio ? [[`tỉ lệ ${RATIO_LABEL[asked.ratio] ?? asked.ratio}`, RATIO_LABEL[ratio] ?? ratio]] : []),
    ...(asked.resolution && asked.resolution !== resolution ? [[`độ phân giải ${asked.resolution}`, resolution]] : []),
  ];
  return missed.length === 0 ? '' : `Mẫu dùng ${missed.map((m) => m[0]).join(', ')}; mô hình này không có nên đã chọn ${missed.map((m) => m[1]).join(', ')}.`;
}

/**
 * The model, ratio, resolution and thinking level of a Run. The chosen model stays while it is listed (until one is chosen, the recommended model that takes the inputs);
 * a ratio or resolution the model lacks falls back to its nearest, a thinking level to its first (a model with no levels has none),
 * so the options always match the model. `images` is how many inputs the Run has: a model that takes fewer is shown as not supported.
 * `refill` sets what a sample or job asks for, and `note` says what the model could not take until the member picks a setting.
 */
export function useImageChoice(models: ImageModel[] | null, images: number, initialModel = '') {
  const [modelId, pickModel] = useState(initialModel);
  const [wantRatio, pickRatio] = useState('auto');
  const [wantResolution, pickResolution] = useState('1K');
  const [wantThinking, setThinking] = useState('');
  const [asked, setAsked] = useState<{ ratio: string | null; resolution: string | null } | null>(null);
  const fits = (m: ImageModel) => m.maxImages >= images;
  const chosen = models?.find((m) => m.id === modelId) ?? models?.find((m) => m.recommended && fits(m)) ?? models?.find(fits) ?? models?.[0];
  const ratio = chosen ? nearestOption(chosen.ratios, wantRatio) : wantRatio;
  const resolution = chosen ? nearestOption(chosen.resolutions, wantResolution) : wantResolution;
  const thinking = chosen?.thinking.includes(wantThinking) ? wantThinking : chosen?.thinking[0];
  const options: ModelOption[] = (models ?? []).map((m) => ({
    id: m.id, label: m.label, isMock: m.isMock, supported: fits(m), estimateUsd: m.prices[resolution] ?? Object.values(m.prices)[0] ?? '0.0000', score: m.score, recommended: m.recommended, resolution: m.resolutions.join('/'), isNew: m.isNew, creditUsd: m.creditUsd, creditShown: m.creditShown, marks: m.total,
  }));
  const user = <T,>(set: (v: T) => void) => (v: T) => (setAsked(null), set(v));
  function refill(j: { modelId: string | null; ratio: string | null; resolution: string | null }) {
    if (j.modelId) pickModel(j.modelId);
    if (j.ratio) pickRatio(j.ratio);
    if (j.resolution) pickResolution(j.resolution);
    setAsked({ ratio: j.ratio, resolution: j.resolution });
  }
  return {
    chosen, ratio, resolution, thinking, estimate: (thinking && chosen?.thinkingPrices[thinking]?.[resolution]) || chosen?.prices[resolution], options, modelId: chosen?.id ?? '',
    setModelId: user(pickModel), setRatio: user(pickRatio), setResolution: user(pickResolution), setThinking, refill, note: chosen && asked ? refillNote(asked, ratio, resolution) : '',
  };
}

/** What the reuse link reads back from a job (GET /api/jobs/:id) to refill an image page. */
export interface ReuseJob {
  feature: string;
  /** A sample's details file (`?example=`) names its photos as samples; a job or a template has uploaded images. */
  images: (Img | { sample: string })[];
  /** The job's prompt: the member's own text on Image Generation without a style, a composed prompt elsewhere. */
  prompt: string | null;
  /** The member's own text, kept for reuse (Try On, the apps, and Image Generation beside a style). */
  brief: string | null;
  /** Image Generation's style (a job's or a template's); left out by a sample's details file. */
  presetId?: string | null;
  garments: number | null;
  enhance: boolean | null;
  ratio: string | null;
  resolution: string | null;
  modelId: string | null;
}

/** Refill (`reuse` is a job's or a saved template's API path, lib/reuse.ts): reads it and hands it to `fill` when it is of `feature`; `fail` otherwise. Everything stays editable.
 * Returns Recreate in place: the same refill from another path, the URL unchanged, as Fash's Recreate. */
export function useReuse(reuse: string | undefined, feature: string, fill: (j: Omit<ReuseJob, 'images'> & { images: Img[] }) => void, fail: (e?: unknown) => void): (from: string) => void {
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
        // A sample's photos become this member's inputs first, copied on the server.
        const samples = j.images.flatMap((i) => ('sample' in i ? [i.sample] : []));
        const images = samples.length > 0 ? await copySamples(samples) : (j.images as Img[]);
        if (stale) return; // superseded while the photos were copied
        fill({ ...j, images });
        recreated(reuse);
        dropRefillQuery();
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

/** Sample pictures as the member's own inputs, copied on the server (POST /api/assets/samples) rather than downloaded and uploaded back; `slot` files them under a form slot. */
export async function copySamples(names: string[], slot?: UploadSlot): Promise<Img[]> {
  const out: Img[] = [];
  for (let i = 0; i < names.length; i += PER_UPLOAD) out.push(...(await api<{ assets: Img[] }>('/api/assets/samples', sendJson('POST', { names: names.slice(i, i + PER_UPLOAD), slot }))).assets);
  return out;
}

/** A detail's photo as one of the form's images: a sample is copied as the member's own, an asset is read for its name. */
export async function photoImg(p: Photo): Promise<Img> {
  if ('sample' in p) return (await copySamples([p.sample]))[0]!;
  const a = await api<Img>(`/api/assets/${p.asset}`);
  return { id: a.id, filename: a.filename };
}

/** What a slot takes: the types and size POST /api/assets accepts (it checks the bytes; the browser's type and size are checked first, to say why before sending). */
const KINDS = {
  image: { what: 'Ảnh', types: ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp'], formats: 'JPEG, PNG hoặc WebP', max: MAX_BYTES },
  video: { what: 'Video', types: ['video/mp4', 'video/quicktime'], formats: 'MP4 hoặc MOV', max: MAX_VIDEO_BYTES },
  audio: { what: 'Tệp âm thanh', types: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'], formats: 'MP3 hoặc WAV', max: MAX_AUDIO_BYTES },
};
export type UploadKind = keyof typeof KINDS;
const wrongType = (kind: UploadKind, name = '') => `${KINDS[kind].what}${name && ` "${name}"`} không đúng định dạng: chỉ nhận ${KINDS[kind].formats}.`;
const tooLarge = (kind: UploadKind, name = '') => `${KINDS[kind].what}${name && ` "${name}"`} quá lớn: tối đa ${KINDS[kind].max / 1024 / 1024} MB.`;
/** A file refused before it is sent; the message says why. */
class Refused extends Error {}

/** What to show for a failed upload: the file's format or size (seen here or by the server), a store that was hidden, else the network or the server. */
export function uploadError(e: unknown, kind: UploadKind = 'image'): string {
  if (e instanceof Refused) return e.message;
  if (e instanceof ApiError && e.status === 413) return tooLarge(kind);
  if (e instanceof ApiError && e.status === 415) return wrongType(kind);
  if (e instanceof ApiError && e.status === 400) return 'Cửa hàng đã chọn không còn dùng được. Hãy chọn cửa hàng khác rồi tải lên lại.'; // the page always sends 1-4 files, so only its store is refused
  return kind === 'image' ? UPLOAD_ERROR : `Không tải ${KINDS[kind].what.toLowerCase()} lên được do lỗi mạng hoặc máy chủ. Hãy thử lại.`;
}

/**
 * Uploads files of one kind; a file of another type or over the size is refused before anything is sent (a file the browser gives no type is left to the server).
 * `storeId` tags them with the store chosen on the page and `slot` with the form slot they went into, for the uploaded-photos picker's filters.
 */
export async function uploadImages(files: File[], kind: UploadKind = 'image', storeId = '', slot?: UploadSlot): Promise<Img[]> {
  for (const f of files) {
    if (f.type && !KINDS[kind].types.includes(f.type)) throw new Refused(wrongType(kind, f.name));
    if (f.size > KINDS[kind].max) throw new Refused(tooLarge(kind, f.name));
  }
  const out: Img[] = [];
  for (let i = 0; i < files.length; i += PER_UPLOAD) {
    const form = new FormData();
    for (const f of files.slice(i, i + PER_UPLOAD)) form.append('file', f);
    if (storeId) form.append('storeId', storeId);
    if (slot) form.append('slot', slot);
    out.push(...(await api<{ assets: Img[] }>('/api/assets', { method: 'POST', body: form })).assets);
  }
  return out;
}

/**
 * Uploads one reference video straight to R2 for the /analyze page, past the request-body and tunnel caps: presign, PUT the
 * file to storage, then record the input asset. A wrong type or an over-size file is refused before anything is sent.
 */
export async function uploadVideoDirect(file: File, storeId = ''): Promise<RefVideo> {
  if (file.type && !KINDS.video.types.includes(file.type)) throw new Refused(wrongType('video', file.name));
  if (file.size > MAX_VIDEO_BYTES_R2) throw new Refused(`Video${file.name && ` "${file.name}"`} quá lớn: tối đa ${MAX_VIDEO_BYTES_R2 / 1024 / 1024} MB.`);
  const contentType = file.type || 'video/mp4';
  const pre = await api<{ assetId: string; url: string } | { fallback: true }>('/api/assets/presign-video', sendJson('POST', { contentType, size: file.size }));
  if ('fallback' in pre) {
    const [img] = await uploadImages([file], 'video', storeId);
    return { id: img!.id, filename: img!.filename, durationMs: 0, bytes: file.size };
  }
  const { assetId, url } = pre;
  const put = await fetch(url, { method: 'PUT', headers: { 'content-type': contentType }, body: file });
  if (!put.ok) throw new Error(`R2 PUT ${put.status}`);
  const { asset } = await api<{ asset: { id: string; filename: string; durationMs: number | null; bytes: number } }>(
    '/api/assets/finalize-video',
    sendJson('POST', { assetId, filename: file.name, storeId: storeId || undefined }),
  );
  return { id: asset.id, filename: asset.filename, durationMs: asset.durationMs ?? 0, bytes: asset.bytes };
}

/**
 * The images a paste (Ctrl+V) hands an upload slot: the clipboard's image files, unless the paste is words going into a text box.
 * Pasting a screenshot with focus in a prompt box still fills the slot, since a box takes no picture.
 */
export function pastedImages(target: { closest?: (sel: string) => unknown } | null, data: { files: ArrayLike<File>; types: readonly string[] } | null): File[] {
  if (!data) return [];
  const images = Array.from(data.files).filter((f) => f.type.startsWith('image/'));
  if (images.length > 0 && data.types.includes('text/plain') && target?.closest?.('input, textarea, [contenteditable="true"]')) return [];
  return images;
}

/**
 * One labelled upload slot: its thumbnails with a remove button each, and a tile that opens the file picker until the slot is full.
 * `samples` (sample names, lib/samples.ts) show while the slot is empty, as on the live Try On; a click hands the name to `onSample`, which copies it on the server.
 * `icon` is the empty slot's icon: a picture by default, a plus on Advanced's wide slot, as on the live page.
 * `onPick` adds the "Ảnh đã tải" link to the label's line while the slot has room (a one-photo slot always: a pick replaces its photo); `storeId` is the page's store, its first filter.
 * `slot` is the picker's first category, for a slot whose label names another page's category (Image Generation's reference photos); by default the label's.
 */
export function Slot({ label, empty, inputLabel, images, max, busy, onAdd, onRemove, samples = [], onSample, icon = 'image', onBrowse, onPick, storeId, optional, slot }: { label: string; empty: string; inputLabel: string; images: Img[]; max: number; busy: boolean; onAdd: (files: File[]) => void; onRemove: (id: string) => void; samples?: string[]; onSample?: (name: string) => void; icon?: IconName; onBrowse?: () => void; onPick?: (img: Img) => void; storeId?: string; optional?: boolean; slot?: UploadSlot }) {
  const hydrated = useHydrated();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [cut, setCut] = useState(0); // how many files a drop or a pick kept when it had more than the slot has room for
  const labelId = useId();
  const full = images.length >= max;
  const offer = images.length === 0 ? samples : [];
  const box = useRef<HTMLDivElement>(null);
  const room = hydrated && !full && !busy;
  // A pasted image (a screenshot of a garment or a model) goes to the first slot on the page with room, as InvokeAI's paste does.
  useEffect(() => {
    if (!room) return;
    const onPaste = (e: ClipboardEvent) => {
      if (document.querySelector('.slot[data-room]') !== box.current) return;
      const files = pastedImages(e.target as Element | null, e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      add(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });
  function add(files: File[]) {
    const room = max - images.length;
    setCut(files.length > room ? room : 0);
    onAdd(files.slice(0, room));
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (hydrated && !full && !busy) add([...e.dataTransfer.files]);
  }
  const labelText = (
    <span id={labelId} className="field-label">
      {label}
      {optional && <span className="sr-only"> (tuỳ chọn)</span>}
    </span>
  );
  // An optional slot shows the optional pill beside its name, as the prompt boxes do.
  const name = optional ? (
    <span className="optional-head">
      {labelText}
      <span className="choice-optional" aria-hidden="true">
        Tuỳ chọn
      </span>
    </span>
  ) : (
    labelText
  );
  return (
    <div className="field">
      {onPick ? (
        <div className="field-head">
          {name}
          {(!full || max === 1) && <UploadedPhotos name={`Ảnh đã tải cho ${label}`} taken={images} disabled={!hydrated || busy} storeId={storeId} slot={slot ?? slotOfLabel(label)} onPick={(img) => (setCut(0), onPick(img))} />}
        </div>
      ) : (
        name
      )}
      <div ref={box} className="slot" role="group" aria-labelledby={labelId} data-room={room || undefined} data-over={over} data-one={(max === 1 && images.length === 1) || undefined} onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple={max > 1}
          hidden
          aria-label={inputLabel}
          disabled={!hydrated}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            add(files);
          }}
        />
        {images.length > 0 && (
          <ul className="slot-thumbs" aria-label={`${label}: ảnh đã chọn`}>
            {images.map((i) => (
              <li key={i.id}>
                <img src={i.url ?? thumbUrl(i.id)} alt={i.filename} />
                {max === 1 && (
                  <span className="slot-chip" aria-hidden="true">
                    {label}
                  </span>
                )}
                <button type="button" aria-label={`Bỏ ảnh ${i.filename}`} onClick={() => (setCut(0), onRemove(i.id))}>
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
                <button type="button" aria-label={`Dùng ảnh mẫu ${i + 1} cho ${label}`} disabled={!hydrated || busy} onClick={() => onSample?.(name)}>
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
            {/* A half-width tile has no room beside its name, so the optional pill takes a line of its own under it. */}
            {optional && images.length === 0 && offer.length === 0 && (
              <span className="choice-optional slot-optional" aria-hidden="true">
                Tuỳ chọn
              </span>
            )}
          </button>
        )}
      </div>
      {cut > 0 && (
        <p className="help" role="status">
          Chỉ lấy {cut} ảnh đầu.
        </p>
      )}
    </div>
  );
}

/** One quiet line over Run with what it will make (model, ratio, length, sound), so the choices lower in a scrolled form stay in sight. */
export function RunSummary({ items }: { items: (string | false | null | undefined)[] }) {
  const shown = items.filter(Boolean);
  return shown.length > 0 ? (
    <p className="run-summary" aria-hidden="true">
      {shown.join(' · ')}
    </p>
  ) : null;
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

export const GALLERY_SIZE_KEY = 'cvs.gallery.size';
export const HISTORY_SIZE_KEY = 'cvs.history.size';

/** A size slider's stop (0 the smallest), remembered per browser under `key`; blocked storage keeps `initial`. */
export function useSize(key: string, last = 2, initial = 1): [number, (next: number) => void] {
  const [size, setSize] = useState(initial);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(key) ?? initial);
      if (Number.isInteger(saved) && saved >= 0 && saved <= last) setSize(saved);
    } catch {}
  }, [key, last, initial]);
  function resize(next: number) {
    setSize(next);
    try {
      localStorage.setItem(key, String(next));
    } catch {}
  }
  return [size, resize];
}

/** The tile-size slider above a gallery or history, as on Fash: it shares the tab row from 1024 px. */
export function SizeSlider({ size, last = 2, onChange }: { size: number; last?: number; onChange: (next: number) => void }) {
  return (
    <div className="gallery-tools">
      <label className="library-size">
        <span className="sr-only">Cỡ ô</span>
        <Icon name="library" />
        <input type="range" min={0} max={last} step={1} value={size} onChange={(e) => onChange(Number(e.target.value))} aria-valuetext={size === 0 ? 'Nhỏ' : size === last ? 'Lớn' : 'Vừa'} />
        <Icon name="ratio" />
      </label>
    </div>
  );
}

/** The company's latest outputs of one Library `kind` (`try_on`, `image` or, with `video`, `marketing`) in a masonry of columns; 24 at a time.
 * `cols` is the column count below 1024 px, up to 1536 px and above; from 1024 px a slider (as on Fash) shows one column more or less, remembered per browser.
 * `samples` names the fixed sample tiles shown first: the uploaded samples `<samples><n>.jpg` (or `.mp4` with a `.jpg` poster for `video`). */
type PhotoTile = { key: string; src: string; label: string; pick: () => void };

/** A photo dialog of a slot, as on Fash (Marketing's model and product, Try On's model, garments and background): the photos to pick, 4 per row of 3:4 portraits, after an upload tile that also takes a dropped photo (with `onFile`). A tile that opens a deeper list (a model's poses, a category) sets the dialog again after it closes; `onBack` returns. `filter` shows above the photos. */
export function PhotoDialog({ open, title, sub, tiles, busy, onFile, onClose, onBack, mine, groups = [], filter }: { open: boolean; title: string; sub?: string; tiles: PhotoTile[]; busy: boolean; onFile?: (files: File[]) => void; onClose: () => void; onBack?: () => void; mine?: { title: string; tiles: PhotoTile[] }; groups?: { title: string; tiles: PhotoTile[] }[]; filter?: ReactNode }) {
  const tile = (t: PhotoTile) => (
    <button key={t.key} type="button" aria-label={t.label} disabled={busy} onClick={() => (onClose(), t.pick())}>
      {open && <img src={t.src} alt="" />}
    </button>
  );
  const [over, setOver] = useState(false);
  const ids = { head: useId(), upload: useId(), hint: useId() };
  // A drop can carry any file and still lands while busy, so it is checked here; the picker already filters on accept.
  const take = (photo: File | undefined) => {
    if (photo && !busy) (onClose(), onFile?.([photo]));
  };
  return (
    <Modal open={open} onClose={onClose} label={title} className="choice-dialog">
      <h2 aria-labelledby={onBack ? ids.head : undefined}>
        {onBack && (
          <button type="button" className="photo-back" aria-label="Quay lại" onClick={onBack}>
            <Icon name="left" size={16} />
          </button>
        )}
        <span id={ids.head}>{title}</span>
      </h2>
      {sub && <p className="modal-sub">{sub}</p>}
      {filter}
      <div className="choice-grid model-grid">
        {onFile && (
          <label
            className="model-upload"
            data-over={over || undefined}
            onDragOver={(e) => (e.preventDefault(), setOver(true))}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => (e.preventDefault(), setOver(false), take([...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))))}
          >
            <Icon name="upload" size={20} />
            <span className="model-upload-title" id={ids.upload}>
              Tải lên ảnh của bạn
            </span>
            <span className="model-upload-hint" id={ids.hint}>
              hoặc kéo thả ảnh vào đây
            </span>
            <input type="file" accept="image/*" className="sr-only" aria-labelledby={ids.upload} aria-describedby={ids.hint} disabled={busy} onChange={(e) => take(e.target.files?.[0])} />
          </label>
        )}
        {tiles.map(tile)}
      </div>
      {/* Headed groups of photos (Jewelry Try-On's templates), then the member's own photos of this slot under their own heading, as Fash's My Models. */}
      {[...groups, ...(mine ? [mine] : [])].map(
        (g) =>
          g.tiles.length > 0 && (
            <section key={g.title} aria-label={g.title}>
              <h3 className="photo-mine">{g.title}</h3>
              <div className="choice-grid model-grid">{g.tiles.map(tile)}</div>
            </section>
          ),
      )}
    </Modal>
  );
}

/** The tiles of the "Người mẫu AI" group of a photo dialog: each saved model's picture (an input asset), picked as an uploaded photo is. */
export const fashionTiles = (models: FashionModelItem[], onPick: (img: Img) => void): PhotoTile[] =>
  models.map((m) => ({ key: m.id, src: thumbUrl(m.assetId), label: `Dùng người mẫu AI ${m.name}`, pick: () => onPick({ id: m.assetId, filename: m.name }) }));

/**
 * "Ảnh đã tải": a button that opens the member's own photos uploaded on any page (GET /api/assets?recent=uploads, newest first), shared by Create, Try On,
 * Image Generation and Marketing Studio. A pick hands the asset to `onPick` as an upload would (the same id, nothing sent again); photos already in the
 * form (`taken`) are left out, as a job takes each input once. The list is read on every open, so a photo just uploaded elsewhere is there.
 * A store filter narrows it to the photos uploaded with a store chosen; it opens on the page's store (`storeId`), else on every store.
 */
export function UploadedPhotos({ name, taken, disabled, onPick, storeId = '', slot, className = 'link-button uploads-link', children = 'Ảnh đã tải' }: { name?: string; taken: Img[]; disabled?: boolean; onPick: (img: Img) => void; storeId?: string; slot?: UploadSlot; className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [store, setStore] = useState('');
  const [kind, setKind] = useState<UploadSlot | ''>('');
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [list, setList] = useState<Img[] | 'failed' | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true; // a later filter's answer wins over a slower earlier one
    setList(null);
    api<{ assets: Img[] }>(`/api/assets?recent=uploads${store ? `&storeId=${encodeURIComponent(store)}` : ''}${kind ? `&slot=${kind}` : ''}`).then(
      (r) => live && setList(r.assets),
      () => live && setList('failed'),
    );
    return () => void (live = false);
  }, [open, store, kind]);
  function show() {
    setOpen(true);
    setStore(storeId);
    setKind(slot ?? '');
    if (stores.length === 0) api<{ stores: StoreOption[] }>('/api/stores').then((r) => setStores(r.stores), () => undefined); // without the list the filter offers every store only
  }
  const shown = Array.isArray(list) ? list.filter((a) => !taken.some((t) => t.id === a.id)) : [];
  const offersModels = AI_MODEL_SLOTS.includes(slot);
  const ai = usable(useFashionModels(open && offersModels).models ?? []).filter((m) => !taken.some((t) => t.id === m.assetId));
  const sub =
    list === null ? 'Đang tải ảnh...' : list === 'failed' ? 'Không tải được ảnh đã tải. Hãy đóng và mở lại.' : shown.length === 0 ? (ai.length > 0 ? 'Chưa có ảnh đã tải nào khác. Bạn có thể chọn một người mẫu AI bên dưới.' : kind ? `Chưa có ảnh ${UPLOAD_SLOTS[kind].toLowerCase()} nào khác. Chọn "Tất cả mục" để xem mọi ảnh.` : store ? 'Chưa có ảnh nào khác của cửa hàng này. Chọn "Tất cả cửa hàng" để xem mọi ảnh.' : 'Chưa có ảnh nào khác. Ảnh bạn tải lên ở mọi trang sẽ hiện ở đây.') : kind ? `Ảnh bạn đã tải cho mục ${UPLOAD_SLOTS[kind]}, mỗi ảnh một lần, mới nhất trước.` : 'Ảnh bạn đã tải lên ở mọi trang, mỗi ảnh một lần, mới nhất trước.';
  return (
    <>
      {/* An icon-only button (Image Generation's bar) takes its name as a tooltip too. */}
      <button type="button" className={className} aria-label={name} title={typeof children === 'string' ? undefined : name} aria-haspopup="dialog" disabled={disabled} onClick={show}>
        {children}
      </button>
      <PhotoDialog
        open={open}
        title="Ảnh đã tải"
        sub={sub}
        tiles={shown.map((a) => ({ key: a.id, src: thumbUrl(a.id), label: `Dùng ${a.filename}`, pick: () => onPick(a) }))}
        groups={offersModels ? [{ title: 'Người mẫu AI', tiles: fashionTiles(ai, onPick) }] : []}
        busy={false}
        onClose={() => setOpen(false)}
        filter={
          <div className="uploads-filter">
            <Select label="Lọc theo mục" icon="image" heading="Lọc theo mục" value={kind} options={[{ value: '', label: 'Tất cả mục' }, ...(Object.keys(UPLOAD_SLOTS) as UploadSlot[]).map((k) => ({ value: k, label: UPLOAD_SLOTS[k] }))]} onChange={(v) => setKind(v as UploadSlot | '')} />
            <StorePicker label="Lọc theo cửa hàng" heading="Lọc theo cửa hàng" value={store} stores={stores} noneLabel="Tất cả cửa hàng" onChange={setStore} />
          </div>
        }
      />
    </>
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

/** A result on an Examples tab, as GET /api/examples lists it. */
interface OrderRow {
  id: string;
  videoAssetId: string;
  posterAssetId: string | null;
  ratio: string;
  modelLabel: string;
}

/** An Admin's order for the results on a page's Examples tab: drag a row or move it with its buttons, then save. The fixed samples always come first. */
function ExampleOrder({ feature, onSaved }: { feature: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  const [moved, setMoved] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setOpen(true);
    setRows(null);
    setMoved('');
    setProblem('');
    try {
      setRows((await api<{ examples: OrderRow[] }>(`/api/examples?feature=${feature}`)).examples);
    } catch {
      setProblem('Không tải được các ví dụ.');
    }
  }
  function move(from: number, to: number) {
    if (!rows || to < 0 || to >= rows.length || from === to) return;
    const row = rows[from]!;
    setRows((cur) => {
      const next = [...cur!];
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
    setMoved(`${row.modelLabel}: vị trí ${to + 1}`);
  }
  async function save() {
    setBusy(true);
    setProblem('');
    try {
      await api('/api/examples', sendJson('PUT', { feature, ids: rows!.map((r) => r.id) }));
      setOpen(false);
      onSaved();
    } catch (e) {
      setProblem(e instanceof ApiError && e.status === 409 ? 'Tab Ví dụ vừa thay đổi. Đóng rồi mở lại để sắp xếp.' : 'Không lưu được thứ tự.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="link-button example-order-open" onClick={() => void show()}>
        Sắp xếp ví dụ
      </button>
      <Modal open={open} onClose={() => setOpen(false)} label="Sắp xếp ví dụ" className="choice-dialog">
        <h2>Sắp xếp ví dụ</h2>
        <p className="muted">Kéo một dòng, hoặc dùng nút lên, xuống. Mẫu cố định luôn đứng trước.</p>
        {rows === null ? (
          !problem && (
            <p role="status" className="muted">
              Đang tải...
            </p>
          )
        ) : (
          <ol className="example-order" aria-label="Thứ tự ví dụ">
            {rows.map((r, i) => (
              <li
                key={r.id}
                draggable
                data-dragging={dragged === i || undefined}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', r.id); // Firefox starts a drag only with data
                  e.dataTransfer.effectAllowed = 'move';
                  setDragged(i);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragged !== null && dragged !== i) (move(dragged, i), setDragged(i));
                }}
                onDrop={(e) => e.preventDefault()}
                onDragEnd={() => setDragged(null)}
              >
                <img src={thumbUrl(r.posterAssetId ?? r.videoAssetId)} alt="" draggable={false} />
                <span>
                  {i + 1}. {r.modelLabel}, {r.ratio}
                </span>
                <button type="button" className="icon-button" aria-label={`Lên trước: ${i + 1}. ${r.modelLabel}`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                  ↑
                </button>
                <button type="button" className="icon-button" aria-label={`Ra sau: ${i + 1}. ${r.modelLabel}`} disabled={i === rows.length - 1} onClick={() => move(i, i + 1)}>
                  ↓
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="sr-only" role="status">
          {moved}
        </p>
        {problem && <p className="error">{problem}</p>}
        <div className="actions">
          <button type="button" disabled={busy || rows === null} onClick={() => void save()}>
            Lưu thứ tự
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            Huỷ
          </button>
        </div>
      </Modal>
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
  const [admin, setAdmin] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [size, resize] = useSize(GALLERY_SIZE_KEY); // 0 small tiles, 1 default, 2 large tiles
  const narrow = useMediaQuery(NARROW);
  const wide = useMediaQuery(WIDE);
  const columns = narrow ? cols[0] : Math.max(1, (wide ? cols[2] : cols[1]) + 1 - size);
  const loading = useRef(false); // a second click while a page loads would append it twice

  async function load(offset: number) {
    if (loading.current) return;
    loading.current = true;
    try {
      // Only the results an Admin put here (owner, 2026-11-09): a member's other results stay in History and the Library.
      const r = await api<{ hasMore: boolean; isAdmin: boolean; clips: Clip[] }>(`/api/library?kind=${kind}&example=1${offset > 0 ? `&offset=${offset}` : ''}`);
      // A result finished between two pages shifts the offset, so the next page can repeat a tile: keep each id once.
      setItems((cur) => (offset > 0 ? [...cur, ...r.clips.filter((c) => !cur.some((o) => o.id === c.id))] : r.clips));
      setHasMore(r.hasMore);
      setAdmin(r.isAdmin);
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
  const retry = () => (setState('loading'), load(0));

  // The fixed samples show at once; only the company's own outputs wait for the request.
  if (sampleTiles.length === 0) {
    if (state === 'loading') return <p role="status" className="muted">Đang tải...</p>;
    if (state === 'error') return <LoadError text="Không tải được kết quả của công ty." onRetry={retry} />;
    if (items.length === 0) return <p className="muted">{emptyText}</p>;
  }
  const tiles: (Clip | string)[] = [...sampleTiles, ...items];
  return (
    <>
      {!narrow && <SizeSlider size={size} onChange={resize} />}
      {admin && items.length > 1 && <ExampleOrder feature={kind} onSaved={() => void load(0)} />}
      <div className="masonry" role="group" aria-label={label}>
        {Array.from({ length: columns }, (_, c) => (
          <ul key={c} className="masonry-col">
            {tiles.filter((_, i) => i % columns === c).map((it) =>
              typeof it === 'string' ? (
                <li key={it} className="gallery-item">
                  {video ? (
                    <a href={`/api/samples/${it}`} target="_blank" rel="noreferrer" aria-label={detailed.includes(it) ? 'Xem chi tiết video mẫu' : 'Mở video mẫu trong tab mới'} onClick={detailed.includes(it) ? (e) => (e.preventDefault(), setOpen(detailed.indexOf(it))) : undefined}>
                      <Preview src={`/api/samples/${it}`} poster={`/api/samples/${it.replace(/\.mp4$/, '.jpg')}`} width={9} height={16} title="Video mẫu" onHover />
                    </a>
                  ) : (
                    // A picture opens as a clip does: its details in place, else a new tab.
                    <a href={`/api/samples/${it}`} target="_blank" rel="noreferrer" aria-label={detailed.includes(it) ? 'Xem chi tiết ảnh mẫu' : 'Mở ảnh mẫu trong tab mới'} onClick={detailed.includes(it) ? (e) => (e.preventDefault(), setOpen(detailed.indexOf(it))) : undefined}>
                      <img src={`/api/samples/${it}`} alt="Ảnh mẫu" loading="lazy" />
                    </a>
                  )}
                  {detailed.includes(it) && <SampleActions name={it} />}
                </li>
              ) : (
              <li key={it.id} className="gallery-item" style={{ aspectRatio: aspectOf(it.ratio) }}>
                {video ? (
                  <a href={`/api/assets/${it.videoAssetId}/content`} target="_blank" rel="noreferrer" aria-label={`Mở video ${it.modelLabel}, ${it.ratio} trong tab mới`}>
                    <Preview src={`/api/assets/${it.videoAssetId}/content`} poster={it.posterAssetId ? `/api/assets/${it.posterAssetId}/content` : ''} width={Number(it.ratio.split(':')[0]) || 9} height={Number(it.ratio.split(':')[1]) || 16} title={`${it.modelLabel}, ${it.ratio}`} onHover />
                  </a>
                ) : (
                  <a href={`/api/assets/${it.videoAssetId}/content`} target="_blank" rel="noreferrer" aria-label={`Mở ảnh ${it.modelLabel}, ${it.ratio} trong tab mới`}>
                    <img src={`/api/assets/${it.posterAssetId ?? it.videoAssetId}/content`} alt={`${it.modelLabel}, ${it.ratio}`} loading="lazy" />
                  </a>
                )}
                {/* Fash's "Use this template": the page's form filled from this result's inputs (a Library clip's inputs are open to every member). */}
                {reuseHref(it) && (
                  <Recreate href={reuseHref(it)!} from={refillFrom({ reuse: it.id })!} className="gallery-use" label={`Dùng ví dụ này: ${it.modelLabel}, ${it.ratio}`}>
                    Dùng ví dụ này
                  </Recreate>
                )}
              </li>
              ),
            )}
          </ul>
        ))}
      </div>
      {open !== null && <SampleDetail names={detailed} index={open} onIndex={setOpen} />}
      {state === 'error' && sampleTiles.length > 0 && <LoadError text="Không tải được kết quả của công ty." onRetry={retry} />}
      {hasMore && (
        <button type="button" className="gallery-more" onClick={() => void load(items.length)}>
          Tải thêm
        </button>
      )}
    </>
  );
}
