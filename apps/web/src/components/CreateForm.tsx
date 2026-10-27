'use client';
import { type DragEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { cardSample, type Example, exampleForPreset, examplesFor, sampleSrc, splitColumns } from '@/lib/examples';
import { NARROW, useMediaQuery, WIDE } from '@/lib/use-media-query';
import { useHydrated } from '@/lib/use-hydrated';
import { useSamples } from '@/lib/use-samples';
import { ABOUT } from '@/lib/about-content';
import { About } from './About';
import { AudioSwitch } from './AudioSwitch';
import { CardMedia } from './CardMedia';
import { EnhanceToggle } from './EnhanceToggle';
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
  /** The one output resolution the stored price is for, e.g. '1080p'. */
  resolution: string | null;
  estimateUsd: string;
  /** The estimate with native audio on; null when the model cannot make audio. */
  audioEstimateUsd: string | null;
  passRate: number | null;
  score: number;
  recommended: boolean;
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
  enhance?: boolean;
  audio?: string | null;
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
  const [enhance, setEnhance] = useState(true); // on by default, as on Fash; it rewrites a free prompt only
  const [audio, setAudio] = useState(true); // native audio, on by default as on Fash, on a model that can make it
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
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (Create below 1024 px, else Examples, as on the live page)
  const [picking, setPicking] = useState(false);
  const [detail, setDetail] = useState<Example | null>(null);

  useEffect(() => {
    api<{ stores: { id: string; name: string }[] }>('/api/stores').then((r) => setStores(r.stores), () => setError('Không tải được danh sách cửa hàng.'));
  }, []);

  // The enabled presets the Admin set up; as on the live form, it starts on a free prompt unless Explore links to a preset.
  useEffect(() => {
    api<{ presets: { id: string; label: string }[] }>('/api/presets').then(
      (r) => {
        setPresets(r.presets);
        if (!reuse) setPresetId(r.presets.find((p) => p.id === preset)?.id ?? '');
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
        setEnhance(j.presetId === null ? (j.enhance ?? true) : true); // a preset job never had Enhance, so the default stays
        setAudio(j.audio === 'on'); // a clip from before the switch was silent
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
  const audioOn = audio && chosen?.audioEstimateUsd != null;
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
      await api('/api/jobs', sendJson('POST', { assetIds: images.map((i) => i.id), modelId, ...(presetId ? { presetId } : { prompt, enhance }), ratio, durationSec, storeId: storeId || null, params: { audio: audioOn ? 'on' : 'off' } }));
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
  const shown: Tab = narrow ? (tab ?? 'create') : tab === 'history' || tab === 'about' ? tab : 'examples';
  const current = presets?.find((p) => p.id === presetId);
  const have = useSamples();
  const media = (path: string) => sampleSrc(have, path);
  /** A preset's loop: its own `preset-<id>` sample (`preset-general` for the free prompt), else the sample clip that stands for it. */
  const presetMedia = (id: string) => {
    const ex = exampleForPreset(id);
    const own = cardSample(have, `preset-${id || 'general'}`, ex ? media(ex.poster) : null);
    return { video: own.video ?? (ex ? media(ex.src) : null), poster: own.poster, ex };
  };
  const banner = presetMedia(presetId);
  const free = presetMedia('');
  const examples = examplesFor(have);
  const detailAt = detail ? examples.findIndex((e) => e.id === detail.id) : -1;
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
            <div className="banner" aria-busy={presets === null}>
              <CardMedia video={banner.video} poster={banner.poster} />
              <div className="banner-text">
                <strong data-value={presetId}>{current?.label ?? 'Tự viết mô tả'}</strong>
              </div>
              {/* Short like the live "Prompts" chip; the name says what it does. */}
              <button type="button" className="banner-chip" aria-label="Chọn mẫu khác" onClick={() => setPicking(true)}>
                <Icon name="edit" size={12} />
                Mẫu
              </button>
            </div>

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
                      ? 'Tối đa 1 ảnh sản phẩm'
                      : `Tối đa ${maxImages} ảnh sản phẩm`
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
            </div>

            {models && models.models.length > 0 && (
              <ModelPicker
                models={models.models.map((m) => ({ id: m.id, label: m.label, isMock: m.isMock, supported: m.supported, rate: ratePct(m), estimateUsd: audio && m.audioEstimateUsd != null ? m.audioEstimateUsd : m.estimateUsd, score: m.score, recommended: m.recommended }))}
                value={modelId}
                onChange={setModelId}
              />
            )}
            {models && models.models.length === 0 && <p className="help">Chưa bật mô hình video nào. Admin bật trong Quản trị → Cài đặt → Mô hình.</p>}
            {tooMany && chosen && <p className="error">Mô hình này nhận tối đa {chosen.maxImages} ảnh.</p>}

            <div className="field">
              <label htmlFor={promptId} className="field-label">
                Mô tả chuyển động
              </label>
              <div className="prompt-box" data-disabled={presetId !== ''}>
                <textarea id={promptId} value={presetId === '' ? prompt : ''} maxLength={MAX_PROMPT} disabled={presetId !== ''} placeholder={presetId === '' ? 'Mô tả video bạn muốn, nên viết bằng tiếng Anh' : 'Đang dùng mẫu. Chọn "Tự viết mô tả" trong danh sách mẫu để tự nhập'} onChange={(e) => setPrompt(e.target.value)} />
                {/* The row stays while a preset is in use, so the box keeps the live 121 px height. */}
                <div className="prompt-foot">
                  {presetId === '' && <EnhanceToggle on={enhance} onChange={setEnhance} />}
                  {presetId === '' && (
                    <span>
                      {prompt.length}/{MAX_PROMPT}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Select label="Độ phân giải" icon="preset" heading="Độ phân giải" value={chosen?.resolution ?? ''} options={[{ value: chosen?.resolution ?? '', label: chosen?.resolution ?? 'Theo mô hình' }]} onChange={() => undefined} />
            <Select
              label="Thời lượng"
              icon="clock"
              heading="Chọn thời lượng"
              value={String(durationSec)}
              options={durations.map((d) => ({ value: String(d), label: `${d} giây` }))}
              onChange={(v) => setDurationSec(Number(v))}
            />
            <Select
              label="Tỉ lệ khung hình"
              icon="ratio"
              heading="Chọn tỉ lệ khung hình"
              value={ratio}
              options={[...new Set(ratios)].map((r) => ({ value: r, label: RATIO_LABEL[r] ?? r }))}
              onChange={setRatio}
            />
            <AudioSwitch on={audio} available={chosen?.audioEstimateUsd != null} onChange={setAudio} />
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
              {chosen && <span className="run-cost">· ${audioOn ? chosen.audioEstimateUsd : chosen.estimateUsd}</span>}
            </button>
          </div>
        </div>

        <div className="side" id={`create-panel-${shown === 'create' ? 'history' : shown}`} role="tabpanel" aria-labelledby={`create-tab-${shown === 'create' ? 'history' : shown}`} hidden={narrow && shown === 'create'}>
          {shown === 'examples' ? (
            <div className="masonry" role="group" aria-label="Video mẫu">
              {splitColumns(examples, narrow ? 2 : wide ? 4 : 3).map((column, c) => (
                <ul key={c} className="masonry-col">
                  {column.map((ex) => (
                    <li key={ex.id} className="example">
                      <Preview src={media(ex.src)} poster={media(ex.poster)} width={ex.width} height={ex.height} title={ex.title} paused={picking || detail !== null} />
                      <span className="chips">
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
            <About page={ABOUT.create} />
          ) : (
            <Tray feature="video" />
          )}
        </div>
      </div>

      <Modal open={picking} onClose={() => setPicking(false)} label="Bộ sưu tập mẫu">
        <h2>Chọn mẫu</h2>
        <p className="modal-sub">Mỗi mẫu là một kiểu chuyển động đã thử, kèm video ví dụ. Chọn một mẫu hoặc tự viết mô tả.</p>
        <ul className="preset-grid" aria-label="Danh sách mẫu">
          {presets?.map((p) => {
            const m = presetMedia(p.id);
            return (
              <li key={p.id} className="preset-card">
                {m.video ? <Preview src={m.video} poster={m.poster ?? ''} width={3} height={4} title={p.label} /> : <div className="banner-empty" />}
                <button
                  type="button"
                  data-value={p.id}
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
            {free.video ? <Preview src={free.video} poster={free.poster ?? ''} width={3} height={4} title="Tự viết mô tả" /> : <div className="banner-empty" />}
            <button
              type="button"
              data-value=""
              aria-pressed={presetId === ''}
              onClick={() => {
                setPresetId('');
                setPicking(false);
              }}
            >
              Tự viết mô tả
            </button>
          </li>
        </ul>
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
                setDetail(examples[detailAt - 1]!);
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
              hidden={detailAt >= examples.length - 1}
              onClick={() => {
                setDetail(examples[detailAt + 1]!);
                if (detailAt + 1 === examples.length - 1) prevStep.current?.focus();
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
