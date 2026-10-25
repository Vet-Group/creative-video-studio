'use client';
import { type DragEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { EXAMPLES, type Example, exampleForPreset, sampleSrc, splitColumns } from '@/lib/examples';
import { NARROW, useMediaQuery, WIDE } from '@/lib/use-media-query';
import { useHydrated } from '@/lib/use-hydrated';
import { useSamples } from '@/lib/use-samples';
import { About } from './About';
import { Carousel } from './Carousel';
import { Icon } from './Icon';
import { useJobs } from './jobs';
import { Modal } from './Modal';
import { ModelPicker } from './ModelPicker';
import { Preview } from './Preview';
import { Select } from './Select';
import { Tray } from './Shell';

interface Model {
  id: string;
  label: string;
  isMock: boolean;
  ratios: string[];
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

type Tab = 'create' | 'history' | 'examples' | 'about';
const TAB_LABEL: Record<Tab, string> = { create: 'Tạo', history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };
const RATIO_LABEL: Record<string, string> = { '9:16': '9:16 (dọc)', '1:1': '1:1 (vuông)' };
const MAX_IMAGES = 4;
const MAX_PROMPT = 2000;
const ratePct = (m: Model) => (m.passRate === null ? 'chưa có dữ liệu' : `${Math.round(m.passRate * 100)}% (${m.passes}/${m.total})`);

/** `preset` and `model` pre-select the choices Explore links to; an unknown or switched-off one falls back to the default. */
export function CreateForm({ reuse, preset, model }: { reuse?: string; preset?: string; model?: string }) {
  const { refresh } = useJobs();
  const hydrated = useHydrated();
  const [images, setImages] = useState<Image[]>([]);
  const [presets, setPresets] = useState<{ id: string; label: string }[] | null>(null);
  const [presetId, setPresetId] = useState(''); // '' means a free prompt
  const [prompt, setPrompt] = useState('');
  const [ratio, setRatio] = useState('9:16');
  const [durationSec, setDurationSec] = useState(8);
  const [modelId, setModelId] = useState(model ?? '');
  const wanted = useRef(model); // the Explore choice, honoured once: the form takes its ratio and duration rather than dropping it
  const [storeId, setStoreId] = useState('');
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [ready, setReady] = useState(!reuse);
  const [refetch, setRefetch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const narrow = useMediaQuery(NARROW);
  const wide = useMediaQuery(WIDE);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const promptId = useId();
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
        if (!reuse) setPresetId(r.presets.find((p) => p.id === preset)?.id ?? r.presets[0]?.id ?? '');
      },
      () => {
        setPresets([]);
        setError('Không tải được danh sách mẫu chuyển động.');
      },
    );
  }, [reuse, preset]);

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
    api<ModelsResponse>(`/api/models?feature=video&ratio=${encodeURIComponent(ratio)}&durationSec=${durationSec}`).then(
      (r) => {
        if (stale) return;
        setModels(r);
        const want = r.models.find((m) => m.id === wanted.current);
        wanted.current = undefined;
        if (want && !want.supported && want.ratios.length > 0 && want.durationsSec.length > 0) {
          if (!want.ratios.includes(ratio)) setRatio(want.ratios[0]!);
          if (!want.durationsSec.includes(durationSec)) setDurationSec(want.durationsSec[0]!);
          return; // the next fetch, for the new ratio and duration, keeps the model
        }
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

  const chosen = models?.models.find((m) => m.id === modelId);
  // The options follow the chosen model; before one is chosen, every model's options show.
  const durations = [...new Set(chosen ? chosen.durationsSec : (models?.models.flatMap((m) => m.durationsSec) ?? [durationSec]))].sort((a, b) => a - b);
  const ratios = chosen ? chosen.ratios : (models?.models.flatMap((m) => m.ratios) ?? [ratio]);
  const tooMany = chosen !== undefined && images.length > chosen.maxImages;
  // The upload limit follows the chosen model (REA-video V02); the server caps every model at MAX_IMAGES.
  const maxImages = Math.min(MAX_IMAGES, chosen?.maxImages ?? MAX_IMAGES);
  const promptOk = presetId !== '' || (prompt.trim() !== '' && prompt.trim().length <= MAX_PROMPT);
  const canRun = ready && !busy && images.length > 0 && chosen?.supported === true && !tooMany && promptOk;

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setError('');
    if (images.length + files.length > maxImages) return setError(`Tối đa ${maxImages} ảnh.`);
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
      setNotice('Đã gửi job. Theo dõi trong tab "Lịch sử".');
      setRefetch((n) => n + 1);
      if (!narrow) setTab('history'); // beside the form, the new job shows in History
      await refresh();
    } catch (e) {
      setError(errorText(e, 'Không gửi được job, hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  // Below 1024 px the form is one tab among Create / History / Examples / About; beside it, the tabs are History / Examples / About.
  const tabs: Tab[] = narrow ? ['create', 'history', 'examples', 'about'] : ['history', 'examples', 'about'];
  const shown: Tab = narrow ? (tab ?? 'create') : tab === 'examples' || tab === 'about' ? tab : 'history';
  const current = presets?.find((p) => p.id === presetId);
  const have = useSamples();
  const media = (path: string) => sampleSrc(have, path);
  const banner = exampleForPreset(presetId);
  const detailAt = detail ? EXAMPLES.indexOf(detail) : -1;
  const prevStep = useRef<HTMLButtonElement>(null);
  const nextStep = useRef<HTMLButtonElement>(null);

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
    setDragOver(false);
    if (hydrated) void upload([...e.dataTransfer.files]);
  }
  /** Fills the form from a sample; nothing is submitted. A sample whose look has no matching form ratio leaves the ratio alone. */
  function fillFromExample(ex: Example) {
    if (presets?.some((p) => p.id === ex.presetId)) setPresetId(ex.presetId);
    if (ex.ratio) setRatio(ex.ratio);
    setDurationSec(ex.durationSec);
    setDetail(null);
    setPicking(false);
    if (narrow) setTab('create');
  }

  return (
    <section aria-labelledby="create-title" className="create">
      <h1 id="create-title" className="sr-only">
        Tạo video
      </h1>
      <div className="create-grid">
        <div className="tabs" role="tablist" aria-label="Khu vực làm việc" onKeyDown={onTabKey}>
          {tabs.map((t) => (
            <button key={t} type="button" role="tab" id={`create-tab-${t}`} aria-selected={shown === t} aria-controls={shown === t ? `create-panel-${t}` : undefined} tabIndex={shown === t ? 0 : -1} onClick={() => setTab(t)}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="card form-card" id="create-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'create-tab-create' : undefined} hidden={narrow && shown !== 'create'}>
          <div className="form-scroll">
            <div className="banner">
              {banner ? <img src={media(banner.poster)} alt="" /> : <div className="banner-empty" aria-hidden="true" />}
              <div className="banner-text">
                <strong>{current?.label ?? 'Tự viết mô tả'}</strong>
              </div>
              <button type="button" className="banner-chip" onClick={() => setPicking(true)}>
                Chọn mẫu khác
              </button>
            </div>

            <Select
              label="Mẫu chuyển động"
              icon="preset"
              heading="Chọn mẫu chuyển động"
              value={presetId}
              options={[...(presets ?? []).map((p) => ({ value: p.id, label: p.label })), { value: '', label: 'Tự viết mô tả' }]}
              onChange={setPresetId}
            />

            <div className="dropzone" data-over={dragOver} data-filled={images.length > 0} onDragOver={(e) => (e.preventDefault(), setDragOver(true))} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                aria-label="Ảnh sản phẩm"
                disabled={!hydrated}
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  e.target.value = '';
                  void upload(files);
                }}
              />
              <button type="button" className="dropzone-pick" disabled={!hydrated || images.length >= maxImages} onClick={() => fileInput.current?.click()}>
                {images.length === 0 && (
                  <span className="dropzone-plus" aria-hidden="true">
                    <Icon name="plus" size={16} />
                  </span>
                )}
                <span className="dropzone-hint">
                  {images.length === 0
                    ? maxImages === 1
                      ? 'Kéo thả hoặc bấm để thêm 1 ảnh sản phẩm'
                      : `Kéo thả hoặc bấm để thêm 1–${maxImages} ảnh sản phẩm`
                    : images.length >= maxImages
                      ? `Đã đủ ${maxImages} ảnh`
                      : `${images.length}/${maxImages} ảnh, bấm hoặc kéo thêm`}
                </span>
              </button>
              {images.length > 0 && (
                <ul className="thumbs" aria-label="Ảnh đã chọn">
                  {images.map((i) => (
                    <li key={i.id}>
                      <img src={`/api/assets/${i.id}/content`} alt={i.filename} />
                      <button type="button" aria-label={`Bỏ ảnh ${i.filename}`} onClick={() => setImages((cur) => cur.filter((x) => x.id !== i.id))}>
                        <Icon name="x" size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {images.length === 0 && <p className="dropzone-note">Ảnh đầu là sản phẩm chính. Chỉ dùng ảnh công ty có quyền sử dụng.</p>}
            </div>

            {models && models.models.length > 0 && (
              <ModelPicker
                models={models.models.map((m) => ({ id: m.id, label: m.label, isMock: m.isMock, supported: m.supported, rate: ratePct(m), estimateUsd: m.estimateUsd }))}
                value={modelId}
                onChange={setModelId}
              />
            )}
            {models && models.models.length === 0 && <p className="help">Chưa có mô hình nào được bật.</p>}
            {tooMany && chosen && <p className="error">Mô hình này nhận tối đa {chosen.maxImages} ảnh.</p>}

            <div className="field">
              <label htmlFor={promptId} className="field-label">
                Mô tả chuyển động
              </label>
              <div className="prompt-box" data-disabled={presetId !== ''}>
                <textarea id={promptId} value={presetId === '' ? prompt : ''} maxLength={MAX_PROMPT} disabled={presetId !== ''} placeholder={presetId === '' ? 'Mô tả chuyển động, nên viết bằng tiếng Anh' : 'Đang dùng mẫu; chọn "Tự viết mô tả" để tự nhập'} onChange={(e) => setPrompt(e.target.value)} />
                <div className="prompt-foot">
                  <span>Tối đa {MAX_PROMPT} ký tự</span>
                  <span>
                    {presetId === '' ? prompt.length : 0}/{MAX_PROMPT}
                  </span>
                </div>
              </div>
            </div>

            <Select
              label="Tỉ lệ khung hình"
              icon="ratio"
              heading="Chọn tỉ lệ khung hình"
              value={ratio}
              options={[...new Set(ratios)].map((r) => ({ value: r, label: RATIO_LABEL[r] ?? r }))}
              onChange={setRatio}
            />
            <Select
              label="Thời lượng"
              icon="clock"
              heading="Chọn thời lượng"
              value={String(durationSec)}
              options={durations.map((d) => ({ value: String(d), label: `${d} giây` }))}
              onChange={(v) => setDurationSec(Number(v))}
            />
            <Select
              label="Cửa hàng/Thương hiệu"
              icon="store"
              heading="Chọn cửa hàng hoặc thương hiệu"
              value={storeId}
              options={[{ value: '', label: 'Không chọn' }, ...stores.map((s) => ({ value: s.id, label: s.name }))]}
              onChange={setStoreId}
            />

            {models && (
              <p className="help">
                Tháng này bạn đã dùng: ${models.monthToDate.usd}
                {models.monthToDate.provisional && <span className="tag">Tạm tính</span>}
                {models.remainingBudgetUsd !== undefined && <span> · Ngân sách tháng còn lại của công ty: ${models.remainingBudgetUsd}</span>}
              </p>
            )}
          </div>

          {(error || notice) && (
            <div className="form-message">
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {notice && <p role="status">{notice}</p>}
            </div>
          )}
          <div className="runbar">
            <button type="button" className="primary run" disabled={!canRun} onClick={() => void run()}>
              Tạo video
              {chosen && <span className="run-cost">· ${chosen.estimateUsd}</span>}
            </button>
          </div>
        </div>

        <div className="side" id={`create-panel-${shown === 'create' ? 'history' : shown}`} role="tabpanel" aria-labelledby={`create-tab-${shown === 'create' ? 'history' : shown}`} hidden={narrow && shown === 'create'}>
          {shown === 'examples' ? (
            <div className="masonry" role="group" aria-label="Video mẫu">
              {splitColumns(EXAMPLES, narrow ? 2 : wide ? 4 : 3).map((column, c) => (
                <ul key={c} className="masonry-col">
                  {column.map((ex) => (
                    <li key={ex.id} className="example">
                      <Preview src={media(ex.src)} poster={media(ex.poster)} width={ex.width} height={ex.height} title={ex.title} paused={picking || detail !== null} />
                      <span className="chips">
                        <span className="chip">Mẫu</span>
                        {ex.fixture && media(ex.src) === ex.src && <span className="chip">fixture</span>}
                      </span>
                      <button type="button" className="example-open" onClick={() => setDetail(ex)}>
                        <span className="example-caption">{ex.title}</span>
                      </button>
                      <button type="button" className="example-use" aria-label={`Dùng mẫu này: ${ex.title}`} onClick={() => fillFromExample(ex)}>
                        Dùng mẫu này
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          ) : shown === 'about' ? (
            <About />
          ) : (
            <Tray feature="video" />
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
                {ex ? <Preview src={media(ex.src)} poster={media(ex.poster)} width={ex.width} height={ex.height} title={p.label} /> : <div className="banner-empty" />}
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

      {/* The live Example dialog (REA-video V01, measured 2026-10-23): the clip on black with Close at its top-left, the details column,
          and Previous/Next as round buttons at the viewport edges that stop at the first and last sample. Nothing here submits a job. */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} label="Chi tiết mẫu" className="example-detail">
        {detail && (
          <>
            <div className="detail-media">
              <Preview key={detail.id} src={media(detail.src)} poster={media(detail.poster)} width={detail.width} height={detail.height} title={detail.title} />
            </div>
            {/* Before the details, so Tab meets Previous and Next first. Stepping onto an end hides the pressed button, so the focus moves to the other one. */}
            <button
              ref={prevStep}
              type="button"
              className="detail-step prev"
              aria-label="Mẫu trước"
              hidden={detailAt <= 0}
              onClick={() => {
                setDetail(EXAMPLES[detailAt - 1]!);
                if (detailAt - 1 === 0) nextStep.current?.focus();
              }}
            >
              <Icon name="left" size={18} />
            </button>
            <button
              ref={nextStep}
              type="button"
              className="detail-step next"
              aria-label="Mẫu sau"
              hidden={detailAt >= EXAMPLES.length - 1}
              onClick={() => {
                setDetail(EXAMPLES[detailAt + 1]!);
                if (detailAt + 1 === EXAMPLES.length - 1) prevStep.current?.focus();
              }}
            >
              <Icon name="right" size={18} />
            </button>
            <div className="detail-info">
              <span className="detail-chip">
                <img src={media(exampleForPreset(detail.presetId)?.poster ?? detail.poster)} alt="" width={36} height={36} />
                {presets?.find((p) => p.id === detail.presetId)?.label}
              </span>
              <h2>{detail.title}</h2>
              <img className="detail-input" src={media(detail.poster)} alt="Khung hình mẫu" width={48} height={48} />
              <ul className="detail-pills" aria-label="Thông số">
                <li aria-label={`Thời lượng ${detail.durationSec} giây`}>{detail.durationSec}s</li>
                <li aria-label={`Tỉ lệ ${detail.aspect}`}>{detail.aspect}</li>
              </ul>
              <div className="detail-foot">
                <p className="detail-date">Mẫu minh họa{detail.fixture && media(detail.src) === detail.src ? ' (fixture)' : ''}</p>
                <div className="detail-tools">
                  <a href={media(detail.src)} download aria-label="Tải video mẫu" title="Tải video mẫu">
                    <Icon name="download" />
                  </a>
                  <a href={media(detail.src)} target="_blank" rel="noreferrer" aria-label="Mở trong tab mới" title="Mở trong tab mới">
                    <Icon name="external" />
                  </a>
                </div>
                <button type="button" className="detail-use" onClick={() => fillFromExample(detail)}>
                  <Icon name="copy" />
                  Dùng mẫu này
                </button>
              </div>
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}
