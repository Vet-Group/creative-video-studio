'use client';
import { type DragEvent, type KeyboardEvent, useEffect, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { EXAMPLES, type Example, exampleForPreset } from '@/lib/examples';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { useHydrated } from '@/lib/use-hydrated';
import { Carousel } from './Carousel';
import { useJobs } from './jobs';
import { Modal } from './Modal';
import { Preview } from './Preview';
import { Tray } from './Shell';

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

type Tab = 'create' | 'history' | 'examples';
const TAB_LABEL: Record<Tab, string> = { create: 'Tạo', history: 'Lịch sử', examples: 'Ví dụ' };
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
  const narrow = useMediaQuery(NARROW);
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (Create below 1024 px, else History)
  const [picking, setPicking] = useState(false);
  const [detail, setDetail] = useState<Example | null>(null);

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

  async function upload(files: File[]) {
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
      if (!narrow) setTab('history'); // beside the form, the new job shows in History
      await refresh();
    } catch (e) {
      setError(errorText(e, 'Không gửi được job, hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  // Below 1024 px the form is one tab among Create / History / Examples; beside it, the tabs are History / Examples.
  const tabs: Tab[] = narrow ? ['create', 'history', 'examples'] : ['history', 'examples'];
  const shown: Tab = narrow ? (tab ?? 'create') : tab === 'examples' ? 'examples' : 'history';
  const current = presets?.find((p) => p.id === presetId);
  const banner = exampleForPreset(presetId);

  function onTabKey(e: KeyboardEvent) {
    const i = tabs.indexOf(shown);
    const moves: Record<string, number> = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 };
    const next = moves[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setTab(tabs[next]!);
    document.getElementById(`create-tab-${tabs[next]}`)?.focus();
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    if (hydrated) void upload([...e.dataTransfer.files]);
  }
  /** Fills the form from a sample; nothing is submitted. */
  function fillFromExample(ex: Example) {
    if (presets?.some((p) => p.id === ex.presetId)) setPresetId(ex.presetId);
    setRatio(ex.ratio);
    setDurationSec(ex.durationSec);
    setDetail(null);
    setPicking(false);
    if (narrow) setTab('create');
  }

  return (
    <section aria-labelledby="create-title" className="create">
      <h1 id="create-title">Tạo video</h1>
      <div className="create-grid">
        <div className="tabs" role="tablist" aria-label="Khu vực làm việc" onKeyDown={onTabKey}>
          {tabs.map((t) => (
            <button key={t} type="button" role="tab" id={`create-tab-${t}`} aria-selected={shown === t} aria-controls={`create-panel-${t}`} tabIndex={shown === t ? 0 : -1} onClick={() => setTab(t)}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="card form-card" id="create-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'create-tab-create' : undefined} hidden={narrow && shown !== 'create'}>
      <div className="banner">
        {banner ? <img src={banner.poster} alt="" /> : <div className="banner-empty" aria-hidden="true" />}
        <div className="banner-text">
          <strong>{current?.label ?? 'Tự viết mô tả'}</strong>
          <button type="button" onClick={() => setPicking(true)}>
            Chọn mẫu khác
          </button>
        </div>
      </div>

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

      <fieldset className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <legend>Ảnh sản phẩm</legend>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          aria-label="Ảnh sản phẩm"
          disabled={!hydrated}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void upload(files);
          }}
        />
        <p className="muted">Kéo ảnh vào đây hoặc chọn tệp. 1 đến {MAX_IMAGES} ảnh JPEG, PNG hoặc WebP. Ảnh đầu tiên là sản phẩm chính. Chỉ tải lên ảnh mà công ty có quyền sử dụng.</p>
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

      <fieldset className="models">
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
        Mô tả chuyển động
        <textarea value={prompt} maxLength={MAX_PROMPT} rows={4} disabled={presetId !== ''} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <p className="muted">Chọn một mẫu, hoặc chọn "Tự viết mô tả" rồi nhập mô tả (tối đa {MAX_PROMPT} ký tự, nên viết bằng tiếng Anh).</p>

      <div className="settings">
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
      </div>

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
      <div className="runbar">
        {chosen && <span className="muted">Mỗi clip: ${chosen.estimateUsd}</span>}
        <button type="button" className="primary" disabled={!canRun} onClick={() => void run()}>
          Tạo video
        </button>
      </div>
        </div>

        <div className="side" id={`create-panel-${shown === 'create' ? 'history' : shown}`} role="tabpanel" aria-labelledby={`create-tab-${shown === 'create' ? 'history' : shown}`} hidden={narrow && shown === 'create'}>
          {shown === 'examples' ? (
            <ul className="masonry" aria-label="Video mẫu">
              {EXAMPLES.map((ex) => (
                <li key={ex.id} className="example" onClick={() => setDetail(ex)}>
                  <div className="example-media">
                    <Preview src={ex.src} poster={ex.poster} width={ex.width} height={ex.height} title={ex.title} paused={picking || detail !== null} />
                    <span className="chips">
                      <span className="chip">Mẫu</span>
                      {ex.fixture && <span className="chip">fixture</span>}
                    </span>
                  </div>
                  <button type="button" className="example-title" onClick={() => setDetail(ex)}>
                    {ex.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Tray />
          )}
        </div>
      </div>

      <Modal open={picking} onClose={() => setPicking(false)} label="Bộ sưu tập mẫu">
        <h2>Chọn mẫu</h2>
        <Carousel label="Danh sách mẫu">
          {presets?.map((p) => {
            const ex = exampleForPreset(p.id);
            return (
              <li key={p.id} className="preset-card">
                {ex ? <Preview src={ex.src} poster={ex.poster} width={ex.width} height={ex.height} title={p.label} /> : <div className="banner-empty" />}
                <button
                  type="button"
                  aria-pressed={p.id === presetId}
                  onClick={() => {
                    setPresetId(p.id);
                    setPicking(false);
                  }}
                >
                  {p.label}
                </button>
              </li>
            );
          })}
          <li className="preset-card">
            <div className="banner-empty" />
            <button
              type="button"
              aria-pressed={presetId === ''}
              onClick={() => {
                setPresetId('');
                setPicking(false);
              }}
            >
              Tự viết mô tả
            </button>
          </li>
        </Carousel>
      </Modal>

      <Modal open={detail !== null} onClose={() => setDetail(null)} label="Chi tiết mẫu">
        {detail && (
          <>
            <h2>{detail.title}</h2>
            <Preview src={detail.src} poster={detail.poster} width={detail.width} height={detail.height} title={detail.title} />
            <p className="muted">
              Mẫu minh họa{detail.fixture ? ' (fixture)' : ''} · {detail.ratio} · {detail.durationSec} giây
            </p>
            <button type="button" className="primary" onClick={() => fillFromExample(detail)}>
              Dùng mẫu này
            </button>
          </>
        )}
      </Modal>
    </section>
  );
}
