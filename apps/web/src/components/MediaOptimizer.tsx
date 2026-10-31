'use client';

import { useEffect, useRef, useState } from 'react';
import { APP_ABOUT } from '@/lib/about-content';
import { About } from './About';
import styles from './MediaOptimizer.module.css';
import { IMAGE_FORMATS, decodeOptimizerImage, imageFileReason, imageSizeReason, optimizeImage, outputSizeText, resizedDimensions, type ImageFormat } from '@/lib/media-optimizer';

export function MediaOptimizer() {
  const image = useRef<ImageBitmap | null>(null);
  const generation = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [preserve, setPreserve] = useState(true);
  const [format, setFormat] = useState<ImageFormat>('image/webp');
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { generation.current++; image.current?.close(); }, []);
  useEffect(() => {
    if (!result) { setUrl(''); return; }
    const next = URL.createObjectURL(result.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [result]);

  async function choose(next?: File) {
    const current = ++generation.current;
    image.current?.close();
    image.current = null;
    setFile(null); setResult(null); setError('');
    if (!next) return;
    const reason = imageFileReason(next);
    if (reason) { setError(reason); return; }
    setBusy(true);
    try {
      const decoded = await decodeOptimizerImage(next);
      if (current !== generation.current) { decoded.close(); return; }
      const invalid = imageSizeReason(decoded.width, decoded.height);
      if (invalid) { decoded.close(); throw new Error(invalid); }
      image.current = decoded;
      setFile(next);
      setSize({ width: decoded.width, height: decoded.height });
      setPreserve(true);
    } catch (err) {
      if (current === generation.current) setError(err instanceof Error ? err.message : 'Không đọc được ảnh. Hãy chọn ảnh khác.');
    } finally { if (current === generation.current) setBusy(false); }
  }

  function dimension(side: 'width' | 'height', value: number) {
    setResult(null);
    setSize(preserve && image.current ? resizedDimensions(image.current.width, image.current.height, side, value) : { ...size, [side]: value });
  }

  async function run() {
    if (!image.current || !file) return;
    const current = generation.current;
    setBusy(true); setError(''); setResult(null);
    try {
      const blob = await optimizeImage(image.current, size.width, size.height, format);
      if (current === generation.current) setResult({ blob, name: `${file.name.replace(/\.[^.]+$/, '')}-optimized.${format === 'image/jpeg' ? 'jpg' : format.split('/')[1]}` });
    } catch (err) {
      if (current === generation.current) setError(err instanceof Error ? err.message : 'Không xử lý được ảnh.');
    } finally { if (current === generation.current) setBusy(false); }
  }

  const invalid = imageSizeReason(size.width, size.height);
  return <section className={styles.workspace} aria-labelledby="optimizer-title">
    <div className="work-left">
      <div className="card" style={{ padding: 24, display: 'grid', gap: 20 }}>
        <header><h1 id="optimizer-title">Media Optimizer</h1><p>Nén, đổi kích thước và chuyển định dạng ảnh — miễn phí.</p></header>
        <p>Ảnh được xử lý ngay trên thiết bị, không tải lên máy chủ. Chưa hỗ trợ video MP4/WEBM.</p>
        <label>Ảnh PNG, JPG hoặc WEBP<input type="file" accept={IMAGE_FORMATS.join(',')} disabled={busy} onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} /></label>
        <small>Tối đa 20 MB, 8000 px mỗi chiều và 16 triệu điểm ảnh. Ảnh động chỉ xuất một khung hình.</small>
        {file && <>
          <p>{file.name} · {(file.size / 1024).toFixed(1)} KB · {image.current?.width} × {image.current?.height} px</p>
          <fieldset disabled={busy} style={{ display: 'grid', gap: 12 }}><legend>Kích thước đầu ra</legend>
            <label>Chiều rộng (px)<input type="number" min="1" max="8000" value={size.width || ''} onChange={(e) => dimension('width', Number(e.target.value))} /></label>
            <label>Chiều cao (px)<input type="number" min="1" max="8000" value={size.height || ''} onChange={(e) => dimension('height', Number(e.target.value))} /></label>
            <label><input type="checkbox" checked={preserve} onChange={(e) => { setPreserve(e.target.checked); setResult(null); if (e.target.checked && image.current) setSize(resizedDimensions(image.current.width, image.current.height, 'width', size.width)); }} /> Giữ tỷ lệ</label>
            <label>Định dạng<select aria-label="Định dạng" value={format} onChange={(e) => { setFormat(e.target.value as ImageFormat); setResult(null); }}>{IMAGE_FORMATS.map((f) => <option key={f} value={f}>{f.slice(6).toUpperCase()}</option>)}</select></label>
          </fieldset>
          <small>JPG dùng nền trắng cho vùng trong suốt. JPG/WEBP dùng chất lượng 82%; dung lượng có thể lớn hơn bản gốc.</small>
          {invalid && <p role="status">{invalid}</p>}
        </>}
        <button className="btn primary" disabled={!file || busy || !!invalid} onClick={() => void run()}>{busy ? 'Đang xử lý…' : 'Tối ưu ảnh · Miễn phí'}</button>
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
    <div className="work-right" aria-live="polite">
      <div className="card" style={{ padding: 24 }}>
        <h2>Kết quả</h2>
        {result && file && url ? <>
          <img src={url} alt="Ảnh sau khi tối ưu" style={{ maxWidth: '100%', maxHeight: 480, objectFit: 'contain' }} />
          <p>{(result.blob.size / 1024).toFixed(1)} KB · {outputSizeText(file.size, result.blob.size)}</p>
          <a className="btn primary" href={url} download={result.name}>Tải ảnh xuống</a>
        </> : <p>Chọn ảnh và kích thước, rồi tối ưu để xem và tải kết quả.</p>}
        <p>Kết quả chỉ có trong phiên này, không lưu vào Thư viện hay Lịch sử. Tệp gốc không thay đổi.</p>
        {APP_ABOUT['media-optimizer'] && <details><summary>Giới thiệu</summary><About page={APP_ABOUT['media-optimizer']} /></details>}
      </div>
    </div>
  </section>;
}
