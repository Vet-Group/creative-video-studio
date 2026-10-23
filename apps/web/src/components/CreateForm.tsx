'use client';
import { type ChangeEvent, useEffect, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { useHydrated } from '@/lib/use-hydrated';
import { useJobs } from './jobs';

interface Model {
  id: string;
  label: string;
  isMock: boolean;
  durationsSec: number[];
  maxImages: number;
  estimateUsd: string;
  passRate: number | null;
  passes: number;
  total: number;
  supported: boolean;
}
interface ModelsResponse {
  models: Model[];
  defaultModelId: string | null;
  monthToDate: { usd: string; provisional: boolean };
  remainingBudgetUsd?: string;
}
interface Image {
  id: string;
  filename: string;
}
interface JobDetail {
  presetId: string | null;
  prompt: string;
  ratio: string;
  durationSec: number;
  modelId: string;
  storeId: string | null;
  images: Image[];
}

const MAX_IMAGES = 4;
const MAX_PROMPT = 2000;
const ratePct = (m: Model) => (m.passRate === null ? 'chưa có dữ liệu' : `${Math.round(m.passRate * 100)}% (${m.passes}/${m.total})`);

export function CreateForm({ reuse }: { reuse?: string }) {
  const { refresh } = useJobs();
  const hydrated = useHydrated();
  const [images, setImages] = useState<Image[]>([]);
  const [presets, setPresets] = useState<{ id: string; label: string }[] | null>(null);
  const [presetId, setPresetId] = useState(''); // '' means a free prompt
  const [prompt, setPrompt] = useState('');
  const [ratio, setRatio] = useState('9:16');
  const [durationSec, setDurationSec] = useState(8);
  const [modelId, setModelId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [ready, setReady] = useState(!reuse);
  const [refetch, setRefetch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api<{ stores: { id: string; name: string }[] }>('/api/stores').then((r) => setStores(r.stores), () => setError('Không tải được danh sách cửa hàng.'));
  }, []);

  // The enabled presets the Admin set up; the first is the default, and with none enabled the form starts on a free prompt.
  useEffect(() => {
    api<{ presets: { id: string; label: string }[] }>('/api/presets').then(
      (r) => {
        setPresets(r.presets);
        if (!reuse) setPresetId(r.presets[0]?.id ?? '');
      },
      () => {
        setPresets([]);
        setError('Không tải được danh sách mẫu chuyển động.');
      },
    );
  }, [reuse]);

  // Reuse: fill the form from the source clip; everything stays editable. A preset switched off since falls back to its prompt as a free prompt.
  useEffect(() => {
    if (!reuse || !presets) return;
    api<JobDetail>(`/api/jobs/${reuse}`)
      .then((j) => {
        const preset = presets.some((p) => p.id === j.presetId) ? j.presetId : null;
        setImages(j.images);
        setPresetId(preset ?? '');
        if (!preset) setPrompt(j.prompt);
        setRatio(j.ratio);
        setDurationSec(j.durationSec);
        setModelId(j.modelId);
        setStoreId(j.storeId ?? '');
      })
      .catch(() => setError('Không tìm thấy clip để dùng lại.'))
      .finally(() => setReady(true));
  }, [reuse, presets]);

  // The picker follows the ratio and duration; the chosen model stays while it supports them, else the server's default takes over.
  useEffect(() => {
    if (!ready) return;
    let stale = false;
    api<ModelsResponse>(`/api/models?ratio=${encodeURIComponent(ratio)}&durationSec=${durationSec}`).then(
      (r) => {
        if (stale) return;
        setModels(r);
        setModelId((cur) => (r.models.some((m) => m.id === cur && m.supported) ? cur : (r.defaultModelId ?? '')));
        const options = r.models.flatMap((m) => m.durationsSec);
        if (options.length > 0 && !options.includes(durationSec)) setDurationSec(Math.min(...options));
      },
      () => !stale && setError('Không tải được danh sách mô hình.'),
    );
    return () => {
      stale = true;
    };
  }, [ready, ratio, durationSec, refetch]);

  const durations = [...new Set(models?.models.flatMap((m) => m.durationsSec) ?? [durationSec])].sort((a, b) => a - b);
  const chosen = models?.models.find((m) => m.id === modelId);
  const tooMany = chosen !== undefined && images.length > chosen.maxImages;
  const promptOk = presetId !== '' || (prompt.trim() !== '' && prompt.trim().length <= MAX_PROMPT);
  const canRun = ready && !busy && images.length > 0 && chosen?.supported === true && !tooMany && promptOk;

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (files.length === 0) return;
    setError('');
    if (images.length + files.length > MAX_IMAGES) return setError(`Tối đa ${MAX_IMAGES} ảnh.`);
    const form = new FormData();
    for (const f of files) form.append('file', f);
    setBusy(true);
    try {
      const r = await api<{ assets: Image[] }>('/api/assets', { method: 'POST', body: form });
      setImages((cur) => [...cur, ...r.assets]);
    } catch {
      setError('Không tải ảnh lên được. Ảnh phải là JPEG, PNG hoặc WebP, tối đa 10 MB mỗi ảnh.');
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/api/jobs', sendJson('POST', { assetIds: images.map((i) => i.id), modelId, ...(presetId ? { presetId } : { prompt }), ratio, durationSec, storeId: storeId || null }));
      setNotice('Đã gửi job. Theo dõi trong mục "Job của tôi".');
      setRefetch((n) => n + 1);
      await refresh();
    } catch (e) {
      setError(errorText(e, 'Không gửi được job, hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="create-title">
      <h1 id="create-title">Tạo video</h1>

      <fieldset>
        <legend>Ảnh sản phẩm</legend>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Ảnh sản phẩm" disabled={!hydrated} onChange={(e) => void upload(e)} />
        <p className="muted">1 đến {MAX_IMAGES} ảnh JPEG, PNG hoặc WebP. Ảnh đầu tiên là sản phẩm chính. Chỉ tải lên ảnh mà công ty có quyền sử dụng.</p>
        <ul className="thumbs">
          {images.map((i) => (
            <li key={i.id}>
              <img src={`/api/assets/${i.id}/content`} alt={i.filename} />
              <button type="button" aria-label={`Bỏ ảnh ${i.filename}`} onClick={() => setImages((cur) => cur.filter((x) => x.id !== i.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

      <label>
        Mẫu chuyển động
        <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
          {presets?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="">Tự viết mô tả</option>
        </select>
      </label>

      <label>
        Mô tả chuyển động
        <textarea value={prompt} maxLength={MAX_PROMPT} rows={4} disabled={presetId !== ''} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <p className="muted">Chọn một mẫu, hoặc chọn "Tự viết mô tả" rồi nhập mô tả (tối đa {MAX_PROMPT} ký tự, nên viết bằng tiếng Anh).</p>

      <label>
        Tỉ lệ khung hình
        <select value={ratio} onChange={(e) => setRatio(e.target.value)}>
          <option value="9:16">9:16 (dọc)</option>
          <option value="1:1">1:1 (vuông)</option>
        </select>
      </label>

      <label>
        Thời lượng
        <select value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))}>
          {durations.map((d) => (
            <option key={d} value={d}>
              {d} giây
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Mô hình</legend>
        {models?.models.map((m) => (
          <label key={m.id} className="model">
            <input type="radio" name="model" value={m.id} checked={modelId === m.id} disabled={!m.supported} onChange={() => setModelId(m.id)} />
            <span>
              {m.label}
              {m.isMock && <span className="badge">MOCK</span>}
            </span>
            <span className="muted">Tỉ lệ đạt: {ratePct(m)}</span>
            <span className="muted">Ước tính: ${m.estimateUsd}</span>
            {!m.supported && <span className="muted">Không hỗ trợ lựa chọn này</span>}
          </label>
        ))}
        {models && models.models.length === 0 && <p className="muted">Chưa có mô hình nào được bật.</p>}
        {tooMany && chosen && <p className="error">Mô hình này nhận tối đa {chosen.maxImages} ảnh.</p>}
      </fieldset>

      <label>
        Cửa hàng/Thương hiệu
        <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="">Không chọn</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {models && (
        <p>
          Tháng này bạn đã dùng: ${models.monthToDate.usd}
          {models.monthToDate.provisional && <span className="tag">Tạm tính</span>}
          {models.remainingBudgetUsd !== undefined && <span> · Ngân sách tháng còn lại của công ty: ${models.remainingBudgetUsd}</span>}
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <button type="button" className="primary" disabled={!canRun} onClick={() => void run()}>
        Tạo video
      </button>
    </section>
  );
}
