'use client';
// Media Optimizer, laid out like the other app pages (AppPage's form card with the app header, an upload slot and Run, beside the History and About tabs).
// Everything runs in the browser; the History tab lists this session's results only, as object URLs that are revoked when an entry is dropped or the page closes.

import { useEffect, useId, useRef, useState } from 'react';
import type { AppConfig } from '@/lib/apps';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { addHistory } from '@/lib/optimizer-history';
import { IMAGE_FORMATS, LISTING_SIDE, MAX_LISTING_IMAGES, decodeOptimizerImage, imageFileReason, imageSizeReason, optimizeImage, outputSizeText, resizedDimensions, type ImageFormat } from '@/lib/media-optimizer';
import { zipBlobs } from '@/lib/zip';
import { AMAZON_SIDE, MARKETS, MARKET_IDS, amazonMainImage, checkFor, measureImage, type Check, type Market, type Measure } from '@/lib/listing-check';
import { AppAbout, AppHeader, TAB_LABEL, type Tab } from './AppPage';
import { Icon } from './Icon';
import { FormNotice, Slot, WorkTabs } from './image-tools';
import styles from './MediaOptimizer.module.css';
import { Select } from './Select';

/** One result of this session. */
export interface OptimizerEntry {
  id: number;
  url: string;
  name: string;
  before: number;
  after: number;
  width: number;
  height: number;
  format: ImageFormat;
  /** A listing Run of several images: how many listing JPEGs the .zip at `url` holds, and the first one's URL for the card. */
  count?: number;
  preview?: string;
  /** An Amazon main image: the checks of the result; for a .zip of them, how many passed every check the pixels can tell. */
  checks?: Check[];
  passed?: number;
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const formatName = (f: ImageFormat) => (f === 'image/jpeg' ? 'JPG' : f.slice(6).toUpperCase());
const revoke = (e: OptimizerEntry) => [e.url, e.preview].forEach((u) => u && URL.revokeObjectURL(u));
/** One of the listing preset's images after the first, with its preview. */
type More = { file: File; url: string };
/** The listing presets: Etsy/Shopify pads the whole image on white; Amazon whitens a near-white background and sets the product at 85% of the frame. */
type Preset = '' | 'listing' | 'amazon';
const CHECK_ICON = { ok: 'check', warn: 'help', fail: 'x', look: 'eye' } as const;

/** A list of checks, each with its mark: passed, worth a look, failed, or for a person to see. */
function Checks({ checks, label }: { checks: Check[]; label: string }) {
  return (
    <ul className={styles.checks} aria-label={label}>
      {checks.map((c) => (
        <li key={c.text} data-level={c.level}>
          <Icon name={CHECK_ICON[c.level]} />
          {c.text}
        </li>
      ))}
    </ul>
  );
}

/** The History tab: the results made in this browser session, newest first, in the cards of the other apps' History. */
export function OptimizerHistory({ entries }: { entries: OptimizerEntry[] }) {
  return (
    <aside className="tray history" aria-label="Kết quả trong phiên này">
      <h2>Kết quả trong phiên này</h2>
      <p className="muted">Kết quả chỉ được giữ trong phiên này, không lưu vào Thư viện. Hãy tải xuống trước khi tải lại hoặc rời trang.</p>
      {entries.length === 0 && <p className="muted">Chưa có kết quả nào. Chọn ảnh rồi bấm Chạy.</p>}
      <ul>
        {entries.map((e) => (
          <li key={e.id} className="job job-card job-succeeded">
            <div className="job-media">
              <img src={e.preview ?? e.url} alt={`Ảnh đã tối ưu: ${e.name}`} />
            </div>
            <div className="job-body">
              <h3>{e.name}</h3>
              <p className="job-text">
                {kb(e.before)} → {kb(e.after)} · {outputSizeText(e.before, e.after)}
              </p>
              <p className="job-chips">
                <span>{e.count ? `${e.count} ảnh ${formatName(e.format)}` : formatName(e.format)}</span>
                <span>
                  {e.width} × {e.height} px
                </span>
                {e.passed !== undefined && <span>{`${e.passed}/${e.count} ảnh đạt chuẩn Amazon`}</span>}
              </p>
              {e.checks && <Checks checks={e.checks} label={`Kiểm ${e.name} theo Amazon`} />}
              <div className="job-actions">
                <a className={`job-reuse ${styles.download}`} href={e.url} download={e.name}>
                  {e.count ? 'Tải xuống .zip' : 'Tải xuống'}
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function MediaOptimizer({ app }: { app: AppConfig }) {
  const narrow = useMediaQuery(NARROW);
  const image = useRef<ImageBitmap | null>(null);
  const generation = useRef(0);
  const alive = useRef(false);
  const nextId = useRef(1);
  const kept = useRef<OptimizerEntry[]>([]); // the same list as `entries`, for the unmount cleanup
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [preserve, setPreserve] = useState(true);
  const [format, setFormat] = useState<ImageFormat>('image/webp');
  const [preset, setPreset] = useState<Preset>('');
  const listing = preset !== ''; // a square JPEG per image, several images to one .zip
  const [market, setMarket] = useState<Market>('amazon');
  const [measured, setMeasured] = useState<Measure | null>(null); // the picked image's pixels, read once for the marketplace checks
  const [more, setMore] = useState<More[]>([]); // the listing preset's images after `file`: a Run of them all makes one .zip
  const moreKept = useRef<More[]>([]); // the same list as `more`, for the unmount cleanup
  const [entries, setEntries] = useState<OptimizerEntry[]>([]);
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (the form below 1024 px, else About)
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null); // a listing run's images done so far, so a long one does not look stuck
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sizeId = useId();
  const reasonId = useId();
  const checkId = useId();
  // Unmount marks the page gone rather than bumping `generation`: React may run this cleanup and the setup again on a live page (StrictMode in dev,
  // Fast Refresh), and a decode or run in flight then must still land and clear `busy`.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      image.current?.close();
      for (const e of kept.current) revoke(e);
      for (const m of moreKept.current) URL.revokeObjectURL(m.url);
    };
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const next = URL.createObjectURL(file);
    setPreview(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  async function choose(next?: File) {
    const current = ++generation.current;
    image.current?.close();
    image.current = null;
    setFile(null);
    setMeasured(null);
    setError('');
    setNotice('');
    setBusy(false); // a run or decode of the previous image no longer owns the form
    if (!next) return;
    const reason = imageFileReason(next);
    if (reason) {
      setError(reason);
      return;
    }
    setBusy(true);
    try {
      const decoded = await decodeOptimizerImage(next);
      if (current !== generation.current || !alive.current) {
        decoded.close();
        return;
      }
      const invalid = imageSizeReason(decoded.width, decoded.height);
      if (invalid) {
        decoded.close();
        throw new Error(invalid);
      }
      image.current = decoded;
      setFile(next);
      try {
        setMeasured(measureImage(decoded));
      } catch {} // no checks for this image; optimising it still works
      setSize({ width: decoded.width, height: decoded.height });
      setPreserve(true);
    } catch (err) {
      if (current === generation.current) setError(err instanceof Error ? err.message : 'Không đọc được ảnh. Hãy chọn ảnh khác.');
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }

  function keepMore(next: More[]) {
    for (const m of moreKept.current) if (!next.includes(m)) URL.revokeObjectURL(m.url);
    moreKept.current = next;
    setMore(next);
  }

  /** The slot's new images: the first is read at once as before (its size fills the form); with the listing preset the others are checked by type and size here and read by the Run. */
  function add(files: File[]) {
    const rest = file ? files : files.slice(1);
    if (!file) void choose(files[0]);
    if (rest.length === 0) return;
    const ok = rest.filter((f) => !imageFileReason(f));
    if (ok.length < rest.length) setError(`Bỏ qua ${rest.length - ok.length} tệp: ${imageFileReason(rest.find((f) => imageFileReason(f))!)}`);
    keepMore([...more, ...ok.map((f) => ({ file: f, url: URL.createObjectURL(f) }))]);
  }

  function dimension(side: 'width' | 'height', value: number) {
    setNotice('');
    setSize(preserve && image.current ? resizedDimensions(image.current.width, image.current.height, side, value) : { ...size, [side]: value });
  }

  // What a run makes: the preset's square JPEG, else the size and format picked.
  const side = preset === 'amazon' ? AMAZON_SIDE : LISTING_SIDE;
  const out = listing ? { width: side, height: side, format: 'image/jpeg' as const } : { ...size, format };

  const outName = (f: File) => `${f.name.replace(/\.[^.]+$/, '')}-${preset || 'optimized'}.${out.format === 'image/jpeg' ? 'jpg' : out.format.split('/')[1]}`;
  /** One image of a listing Run: Amazon's main image with its checks, or the Etsy/Shopify square. */
  const listingImage = async (bitmap: ImageBitmap): Promise<{ blob: Blob; checks?: Check[] }> => (preset === 'amazon' ? amazonMainImage(bitmap) : { blob: await optimizeImage(bitmap, side, side, 'image/jpeg', bitmap) });
  const passes = (checks?: Check[]) => !!checks && !checks.some((c) => c.level === 'fail');

  function keep(entry: OptimizerEntry) {
    const made = addHistory(kept.current, entry);
    kept.current = made.list;
    setEntries(made.list);
    for (const dropped of made.dropped) revoke(dropped);
  }

  async function run() {
    const many = listing && more.length > 0;
    if (!many && (!image.current || !file)) return;
    const current = generation.current;
    setBusy(true);
    setProgress(null);
    setError('');
    setNotice('');
    try {
      if (many) {
        // One image at a time, so only one decoded image is held; one that cannot be read is left out and named.
        const made: { name: string; blob: Blob; before: number; ok: boolean }[] = [];
        const skipped: string[] = [];
        const files = [...(file ? [file] : []), ...more.map((m) => m.file)];
        for (const [n, f] of files.entries()) {
          setProgress({ done: n, of: files.length });
          try {
            const bitmap = f === file && image.current ? image.current : await decodeOptimizerImage(f);
            try {
              const one = await listingImage(bitmap);
              made.push({ name: outName(f), blob: one.blob, before: f.size, ok: passes(one.checks) });
            } finally {
              if (bitmap !== image.current) bitmap.close();
            }
          } catch {
            skipped.push(f.name);
          }
          if (current !== generation.current || !alive.current) return;
        }
        if (made.length === 0) throw new Error('Không đọc được ảnh nào. Hãy chọn ảnh PNG, JPG hoặc WEBP hợp lệ.');
        const zip = await zipBlobs(made);
        if (current !== generation.current || !alive.current) return;
        const before = made.reduce((sum, m) => sum + m.before, 0);
        const amazon = preset === 'amazon';
        keep({ id: nextId.current++, url: URL.createObjectURL(zip), preview: URL.createObjectURL(made[0]!.blob), name: `${preset}-${made.length}-anh.zip`, before, after: zip.size, ...out, count: made.length, passed: amazon ? made.filter((m) => m.ok).length : undefined });
        setNotice(`Đã tạo ${made.length} ${amazon ? 'ảnh chính Amazon' : 'ảnh listing'} trong một tệp .zip. Tải xuống trong tab "Lịch sử".`);
        if (skipped.length > 0) setError(`Không đọc được ${skipped.length} ảnh nên đã bỏ qua: ${skipped.join(', ')}.`);
      } else {
        const { blob, checks } = listing ? await listingImage(image.current!) : { blob: await optimizeImage(image.current!, out.width, out.height, out.format), checks: undefined };
        if (current !== generation.current || !alive.current) return;
        keep({ id: nextId.current++, url: URL.createObjectURL(blob), name: outName(file!), before: file!.size, after: blob.size, ...out, checks });
        setNotice('Đã tối ưu xong. Xem và tải ảnh trong tab "Lịch sử".');
      }
      if (!narrow) setTab('history');
    } catch (err) {
      if (current === generation.current) setError(err instanceof Error ? err.message : 'Không xử lý được ảnh.');
    } finally {
      if (current === generation.current) (setBusy(false), setProgress(null));
    }
  }

  const count = (file ? 1 : 0) + more.length;
  const invalid = count > 0 ? imageSizeReason(out.width, out.height) : undefined;
  const reason = count > 0 ? invalid : 'Thêm một ảnh để bắt đầu.';
  const canRun = count > 0 && !busy && !invalid;
  const tabs: Tab[] = narrow ? ['create', 'history', 'about'] : ['history', 'about'];
  const shown: Tab = narrow ? (tab ?? 'create') : tab === 'history' ? 'history' : 'about';
  const panel = shown === 'create' ? 'about' : shown;

  return (
    <section aria-labelledby="app-title" className="create app-page">
      <h1 id="app-title" className="sr-only">
        {app.name}
      </h1>
      <div className="create-grid">
        <WorkTabs prefix="app" tabs={tabs} labels={TAB_LABEL} shown={shown} onSelect={setTab} />

        <div className="card form-card" id="app-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'app-tab-create' : undefined} hidden={narrow && shown !== 'create'}>
          <div className="form-scroll">
            <AppHeader app={app} />
            <div className="app-slots" data-two={false}>
              <Slot
                label="Ảnh"
                empty={listing ? `Thêm tối đa ${MAX_LISTING_IMAGES} ảnh PNG, JPG hoặc WEBP, mỗi ảnh tối đa 20 MB` : 'Thêm 1 ảnh PNG, JPG hoặc WEBP, tối đa 20 MB'}
                inputLabel="Ảnh cần tối ưu"
                images={[...(file && preview ? [{ id: 'local', filename: file.name, url: preview }] : []), ...more.map((m) => ({ id: m.url, filename: m.file.name, url: m.url }))]}
                max={listing ? MAX_LISTING_IMAGES : 1}
                busy={busy}
                onAdd={add}
                onRemove={(id) => (id === 'local' ? void choose() : keepMore(more.filter((m) => m.url !== id)))}
              />
            </div>
            <p className="help">Ảnh được xử lý ngay trên thiết bị, không tải lên máy chủ. Chưa hỗ trợ video MP4/WEBM.</p>
            <p className="help">Tối đa 20 MB, 8000 px mỗi chiều và 16 triệu điểm ảnh. Ảnh động chỉ xuất một khung hình.</p>
            {count > 1 ? (
              <p className="help">
                {count} ảnh · {kb((file?.size ?? 0) + more.reduce((sum, m) => sum + m.file.size, 0))} · Chạy để tạo một tệp .zip gồm {count} {preset === 'amazon' ? 'ảnh chính Amazon' : 'ảnh listing'}.
              </p>
            ) : (
              file && (
                <p className="help">
                  {file.name} · {kb(file.size)} · {image.current?.width} × {image.current?.height} px
                </p>
              )
            )}

            {file && measured && more.length === 0 && (
              <div className="field">
                <span id={checkId} className="field-label">
                  Kiểm chuẩn sàn
                </span>
                <div className={styles.pills} role="group" aria-labelledby={checkId}>
                  {MARKET_IDS.map((m) => (
                    <button key={m} type="button" className="enhance" aria-pressed={market === m} onClick={() => setMarket(m)}>
                      {MARKETS[m].label}
                    </button>
                  ))}
                </div>
                <Checks checks={checkFor(market, measured, file)} label={`Kiểm ảnh theo ${MARKETS[market].label}`} />
                <span className="help">Theo quy định ảnh chính các sàn công bố; sàn có thể đổi, hãy đối chiếu trang của sàn khi cần.{market === 'amazon' && preset !== 'amazon' ? ' Bật "Ảnh chính Amazon" bên dưới để sửa nền và cỡ sản phẩm.' : ''}</span>
              </div>
            )}

            <div className="field">
              <span className="field-label">Mẫu có sẵn</span>
              <div className={styles.pills}>
                {(['listing', 'amazon'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="enhance"
                    aria-pressed={preset === p}
                    disabled={busy}
                    onClick={() => {
                      const next = preset === p ? '' : p;
                      setPreset(next);
                      // Without a preset a Run makes one image again, so the others leave the slot.
                      setNotice(!next && more.length > 0 ? `Đã bỏ ${more.length} ảnh thêm: không dùng mẫu listing thì mỗi lần chạy xử lý một ảnh.` : '');
                      if (!next) keepMore([]);
                    }}
                  >
                    {p === 'listing' ? 'Ảnh listing Etsy/Shopify' : 'Ảnh chính Amazon'}
                  </button>
                ))}
              </div>
              <span className="help">
                {preset === 'amazon'
                  ? `Ảnh vuông ${AMAZON_SIDE} × ${AMAZON_SIDE} px, JPG: nền gần trắng được tô thành trắng tinh, sản phẩm được căn giữa và chiếm 85% khung, như Amazon yêu cầu cho ảnh chính. Nền xám hay có màu thì chạy Xoá nền trước. Chọn tối đa ${MAX_LISTING_IMAGES} ảnh một lần để tải về một tệp .zip.`
                  : `Ảnh vuông 2048 × 2048 px, JPG: giữ trọn ảnh, thêm nền trắng xung quanh và tô trắng vùng trong suốt (Etsy hiện ảnh PNG trong suốt trên nền đen). Chọn tối đa ${MAX_LISTING_IMAGES} ảnh một lần để tải về một tệp .zip.`}
              </span>
            </div>

            <div className="field">
              <span id={sizeId} className="field-label">
                Kích thước
              </span>
              <div className={styles.size} role="group" aria-labelledby={sizeId}>
                <input type="number" min="1" max="8000" inputMode="numeric" aria-label="Chiều rộng (px)" value={out.width || ''} disabled={!file || busy || listing} onChange={(e) => dimension('width', Number(e.target.value))} />
                <span aria-hidden="true">×</span>
                <input type="number" min="1" max="8000" inputMode="numeric" aria-label="Chiều cao (px)" value={out.height || ''} disabled={!file || busy || listing} onChange={(e) => dimension('height', Number(e.target.value))} />
              </div>
              <div>
                <button
                  type="button"
                  className="enhance"
                  aria-pressed={preserve}
                  disabled={!file || busy || listing}
                  onClick={() => {
                    setPreserve(!preserve);
                    if (!preserve && image.current) setSize(resizedDimensions(image.current.width, image.current.height, 'width', size.width));
                  }}
                >
                  Giữ tỷ lệ
                </button>
              </div>
              <span className="help">Đổi kích thước kết quả; kích thước gốc được điền sẵn.</span>
            </div>

            {!listing && <Select label="Định dạng (tuỳ chọn)" icon="preset" heading="Chọn định dạng" value={format} options={IMAGE_FORMATS.map((f) => ({ value: f, label: formatName(f) }))} onChange={(v) => { setFormat(v as ImageFormat); setNotice(''); }} />}
            {file && <p className="help">{preset === 'amazon' ? 'Ảnh chính Amazon là JPG chất lượng 92%, vùng trong suốt thành nền trắng.' : 'JPG dùng nền trắng cho vùng trong suốt. JPG/WEBP dùng chất lượng 82%; dung lượng có thể lớn hơn bản gốc.'}</p>}
          </div>

          <div className="form-message">
            {reason && (
              <p id={reasonId} className="help" role="status">
                {reason}
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <FormNotice text={notice} onHistory={narrow ? () => setTab('history') : undefined} />
          </div>
          <div className="runbar">
            <button type="button" className="primary run" disabled={!canRun} aria-describedby={reason ? reasonId : undefined} onClick={() => void run()}>
              {busy ? (
                `Đang xử lý…${progress ? ` ${progress.done}/${progress.of} ảnh` : ''}`
              ) : (
                <>
                  Chạy
                  <span className="run-cost">· Miễn phí</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="side" id={`app-panel-${panel}`} role="tabpanel" aria-labelledby={`app-tab-${panel}`} hidden={narrow && shown === 'create'}>
          {shown === 'history' ? <OptimizerHistory entries={entries} /> : <AppAbout app={app} />}
        </div>
      </div>
    </section>
  );
}
