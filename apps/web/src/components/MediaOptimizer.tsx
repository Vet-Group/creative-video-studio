'use client';
// Media Optimizer, laid out like the other app pages (AppPage's form card with the app header, an upload slot and Run, beside the History and About tabs).
// Everything runs in the browser; the History tab lists this session's results only, as object URLs that are revoked when an entry is dropped or the page closes.

import { useEffect, useId, useRef, useState } from 'react';
import type { AppConfig } from '@/lib/apps';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { addHistory } from '@/lib/optimizer-history';
import { IMAGE_FORMATS, decodeOptimizerImage, imageFileReason, imageSizeReason, optimizeImage, outputSizeText, resizedDimensions, type ImageFormat } from '@/lib/media-optimizer';
import { AppAbout, AppHeader, TAB_LABEL, type Tab } from './AppPage';
import { Slot, WorkTabs } from './image-tools';
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
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const formatName = (f: ImageFormat) => (f === 'image/jpeg' ? 'JPG' : f.slice(6).toUpperCase());

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
              <img src={e.url} alt={`Ảnh đã tối ưu: ${e.name}`} />
            </div>
            <div className="job-body">
              <h3>{e.name}</h3>
              <p className="job-text">
                {kb(e.before)} → {kb(e.after)} · {outputSizeText(e.before, e.after)}
              </p>
              <p className="job-chips">
                <span>{formatName(e.format)}</span>
                <span>
                  {e.width} × {e.height} px
                </span>
              </p>
              <div className="job-actions">
                <a className={`job-reuse ${styles.download}`} href={e.url} download={e.name}>
                  Tải xuống
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
  const nextId = useRef(1);
  const kept = useRef<OptimizerEntry[]>([]); // the same list as `entries`, for the unmount cleanup
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [preserve, setPreserve] = useState(true);
  const [format, setFormat] = useState<ImageFormat>('image/webp');
  const [entries, setEntries] = useState<OptimizerEntry[]>([]);
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (the form below 1024 px, else About)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sizeId = useId();
  const reasonId = useId();
  useEffect(
    () => () => {
      generation.current++;
      image.current?.close();
      for (const e of kept.current) URL.revokeObjectURL(e.url);
    },
    [],
  );
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
      if (current !== generation.current) {
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
      setSize({ width: decoded.width, height: decoded.height });
      setPreserve(true);
    } catch (err) {
      if (current === generation.current) setError(err instanceof Error ? err.message : 'Không đọc được ảnh. Hãy chọn ảnh khác.');
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }

  function dimension(side: 'width' | 'height', value: number) {
    setNotice('');
    setSize(preserve && image.current ? resizedDimensions(image.current.width, image.current.height, side, value) : { ...size, [side]: value });
  }

  async function run() {
    if (!image.current || !file) return;
    const current = generation.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const blob = await optimizeImage(image.current, size.width, size.height, format);
      if (current !== generation.current) return;
      const name = `${file.name.replace(/\.[^.]+$/, '')}-optimized.${format === 'image/jpeg' ? 'jpg' : format.split('/')[1]}`;
      const made = addHistory(kept.current, { id: nextId.current++, url: URL.createObjectURL(blob), name, before: file.size, after: blob.size, width: size.width, height: size.height, format });
      kept.current = made.list;
      setEntries(made.list);
      for (const dropped of made.dropped) URL.revokeObjectURL(dropped.url);
      setNotice('Đã tối ưu xong. Xem và tải ảnh trong tab "Lịch sử".');
      if (!narrow) setTab('history');
    } catch (err) {
      if (current === generation.current) setError(err instanceof Error ? err.message : 'Không xử lý được ảnh.');
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }

  const invalid = file ? imageSizeReason(size.width, size.height) : undefined;
  const reason = file ? invalid : 'Thêm một ảnh để bắt đầu.';
  const canRun = !!file && !busy && !invalid;
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
                empty="Thêm 1 ảnh PNG, JPG hoặc WEBP, tối đa 20 MB"
                inputLabel="Ảnh cần tối ưu"
                images={file && preview ? [{ id: 'local', filename: file.name, url: preview }] : []}
                max={1}
                busy={busy}
                onAdd={(files) => void choose(files[0])}
                onRemove={() => void choose()}
              />
            </div>
            <p className="help">Ảnh được xử lý ngay trên thiết bị, không tải lên máy chủ. Chưa hỗ trợ video MP4/WEBM.</p>
            <p className="help">Tối đa 20 MB, 8000 px mỗi chiều và 16 triệu điểm ảnh. Ảnh động chỉ xuất một khung hình.</p>
            {file && (
              <p className="help">
                {file.name} · {kb(file.size)} · {image.current?.width} × {image.current?.height} px
              </p>
            )}

            <div className="field">
              <span id={sizeId} className="field-label">
                Kích thước
              </span>
              <div className={styles.size} role="group" aria-labelledby={sizeId}>
                <input type="number" min="1" max="8000" inputMode="numeric" aria-label="Chiều rộng (px)" value={size.width || ''} disabled={!file || busy} onChange={(e) => dimension('width', Number(e.target.value))} />
                <span aria-hidden="true">×</span>
                <input type="number" min="1" max="8000" inputMode="numeric" aria-label="Chiều cao (px)" value={size.height || ''} disabled={!file || busy} onChange={(e) => dimension('height', Number(e.target.value))} />
              </div>
              <div>
                <button
                  type="button"
                  className="enhance"
                  aria-pressed={preserve}
                  disabled={!file || busy}
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

            <Select label="Định dạng (tuỳ chọn)" icon="preset" heading="Chọn định dạng" value={format} options={IMAGE_FORMATS.map((f) => ({ value: f, label: formatName(f) }))} onChange={(v) => { setFormat(v as ImageFormat); setNotice(''); }} />
            {file && <p className="help">JPG dùng nền trắng cho vùng trong suốt. JPG/WEBP dùng chất lượng 82%; dung lượng có thể lớn hơn bản gốc.</p>}
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
            {notice && <p role="status">{notice}</p>}
          </div>
          <div className="runbar">
            <button type="button" className="primary run" disabled={!canRun} aria-describedby={reason ? reasonId : undefined} onClick={() => void run()}>
              {busy ? (
                'Đang xử lý…'
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
