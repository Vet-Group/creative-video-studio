'use client';
// Image Generation: a settings card (reference images, style, model, prompt, ratio, resolution, Enhance, the brand kit) beside the History, Examples and
// About tabs, laid out like Try On and Create. Run posts an image job.
import { useId, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { ABOUT } from '@/lib/about-content';
import { promptTooLong } from '@/lib/prompt-limit';
import { confirmRun } from '@/lib/run-guard';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { useRecall } from '@/lib/use-recall';
import { About } from './About';
import { BrandPicker } from './BrandKit';
import { copyError, Gallery, type Img, LockedFields, photoImg, RATIO_LABEL, Slot, THINKING_LABEL, uploadError, uploadImages, UPLOAD_ERROR, useImageChoice, useImageModels, useReuse, WorkTabs } from './image-tools';
import { EnhanceToggle } from './EnhanceToggle';
import { FormContext, type Photo, useApplier, useJobs } from './jobs';
import { ModelPicker } from './ModelPicker';
import { PromptComposer } from './PromptComposer';
import { Select } from './Select';
import { Tray } from './Shell';
import { StylePicker } from './StylePicker';
import { Templates } from './Templates';
import { PageHint } from './ToolGuide';

type Tab = 'create' | 'history' | 'examples' | 'about';
const TAB_LABEL: Record<Tab, string> = { create: 'Tạo', history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };

export function ImageGeneration({ reuse, model }: { reuse?: string; model?: string }) {
  const { refresh, notify, loading } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const [images, setImages] = useState<Img[]>([]);
  const [prompt, setPrompt] = useState('');
  const [styleId, setStyleId] = useState(''); // '' for no style
  const [enhance, setEnhance] = useState(true); // on by default, as on Fash
  const [storeId, setStoreId] = useState('');
  const [useBrand, setUseBrand] = useState(false); // the chosen store's brand kit, added to the prompt on the server
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (Create below 1024 px, else Examples)
  const opening: Tab = 'examples';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const promptId = useId();
  const { models, failed } = useImageModels('image');
  const pick = useImageChoice(models, Math.max(1, images.length), model); // Explore's model card picks the model
  // The member's last model and settings, unless a refill or Explore's model card opens the page.
  const recall = useRecall(
    'image',
    (s) => {
      pick.setModelId(s.modelId);
      if (s.ratio) pick.setRatio(s.ratio);
      if (s.resolution) pick.setResolution(s.resolution);
      if (s.enhance !== null) setEnhance(s.enhance);
      if (s.storeId) setStoreId(s.storeId);
      if (s.brand !== null) setUseBrand(s.brand);
    },
    { skip: reuse !== undefined || model !== undefined },
  );
  const apply = useApplier((s) => {
    recall.touch();
    if (s.ratio) pick.setRatio(s.ratio);
    if (s.resolution) pick.setResolution(s.resolution);
  });
  const { chosen } = pick;
  const max = chosen?.maxImages ?? 4;
  /** A detail's photo or result as one more input, as Fash's "Image added to inputs". */
  async function take(p: Photo) {
    if (images.length >= max) return notify(`Tối đa ${max} ảnh`);
    setError('');
    try {
      const img = await photoImg(p).finally(loading('Đang tải ảnh...'));
      setImages((cur) => (cur.length < max ? [...cur, img] : cur));
      notify('Đã thêm ảnh vào đầu vào');
    } catch (e) {
      setError(copyError(e, UPLOAD_ERROR));
    }
  }

  const recreate = useReuse(
    reuse,
    'image',
    (j) => {
      recall.touch();
      setImages(j.images);
      setPrompt(j.brief ?? j.prompt ?? ''); // with a style or the brand kit, the job's prompt is composed and the member's own words are the brief
      setStyleId(j.presetId ?? '');
      setEnhance(j.enhance ?? true);
      pick.refill(j);
    },
    (e) => setError(copyError(e, 'Không tìm thấy ảnh để dùng lại.')),
  );

  // The first thing that stops Run; null when it can go.
  const reason =
    !recall.answered
      ? 'Đang tải cài đặt đã dùng...'
      : models === null
        ? 'Đang tải danh sách mô hình...'
        : failed
          ? 'Không tải được danh sách mô hình.'
          : !chosen
            ? 'Chưa bật mô hình nào cho Tạo ảnh. Admin bật trong Quản trị → Cài đặt → Mô hình.'
            : images.length === 0 && !chosen.textToImage
              ? 'Mô hình này cần ít nhất 1 ảnh tham chiếu.'
              : images.length > chosen.maxImages
                ? `Mô hình này nhận tối đa ${chosen.maxImages} ảnh.`
                : prompt.trim() === ''
                  ? 'Nhập mô tả cảnh bạn muốn tạo.'
                  : promptTooLong(chosen, prompt.trim().length);
  const canRun = reason === null && !busy;
  // With no image and a model that needs one, the best model that makes pictures from words is one click away (not switched to silently: its price differs).
  const wordsModel = chosen && images.length === 0 && !chosen.textToImage ? models?.filter((m) => m.textToImage).sort((a, b) => b.score - a.score)[0] : undefined;
  // Over Run too once the text nears the model's limit (or is over it after a switch).

  async function upload(files: File[]) {
    if (files.length === 0) return;
    const room = Math.max(0, max - images.length);
    if (room === 0) return notify(`Tối đa ${max} ảnh`);
    if (files.length > room) notify(`Chỉ lấy ${room} ảnh đầu`);
    setError('');
    setBusy(true);
    try {
      const assets = await uploadImages(files.slice(0, room), 'image', storeId, 'image').finally(loading('Đang tải lên…'));
      setImages((cur) => [...cur, ...assets]);
    } catch (e) {
      setError(uploadError(e));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!(await confirmRun(pick.estimate))) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = { feature: 'image', modelId: pick.modelId, assetIds: images.map((i) => i.id), prompt: prompt.trim(), ...(styleId && { presetId: styleId }), enhance, ratio: pick.ratio, storeId: storeId || null, useBrand, params: { resolution: pick.resolution, ...(pick.thinking && { thinking: pick.thinking }) } };
      await api('/api/jobs', sendJson('POST', body));
      setNotice('Đã gửi lượt tạo. Theo dõi trong tab "Lịch sử".');
      if (!narrow) setTab('history');
      await refresh();
    } catch (e) {
      setError(errorText(e, 'Không gửi được lượt tạo, hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  const tabs: Tab[] = narrow ? ['create', 'history', 'examples', 'about'] : ['history', 'examples', 'about'];
  const shown: Tab = narrow ? (tab ?? 'create') : tab === null || tab === 'create' ? opening : tab;
  const panel = shown === 'create' ? 'history' : shown;

  return (
    <section aria-labelledby="imagegen-title" className="create">
      <h1 id="imagegen-title" className="sr-only">
        Tạo ảnh
      </h1>
      <div className="create-grid">
        <WorkTabs prefix="imagegen" tabs={tabs} labels={TAB_LABEL} shown={shown} onSelect={setTab} />

        <div className="card form-card" id="imagegen-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'imagegen-tab-create' : undefined} hidden={narrow && shown !== 'create'} onPointerDownCapture={recall.touch} onKeyDownCapture={recall.touch}>
          <div className="form-scroll">
            <PageHint href="/image-generation" />
            <Slot label="Ảnh tham chiếu" optional empty={`Tối đa ${max} ảnh tham chiếu`} inputLabel="Ảnh tham chiếu" images={images} max={max} busy={busy} onAdd={(files) => void upload(files)} onRemove={(id) => setImages((cur) => cur.filter((x) => x.id !== id))} onPick={(img) => setImages((cur) => (cur.length < max ? [...cur, img] : cur))} storeId={storeId} slot="image" />
            {/* In a field for the form's spacing; the chip names itself, so it has no label above it. */}
            <div className="field">
              <StylePicker value={styleId} onChange={setStyleId} />
            </div>
            {models && models.length > 0 && <ModelPicker models={pick.options} value={pick.modelId} onChange={pick.setModelId} />}

            <PromptComposer
              id={promptId}
              label="Mô tả"
              feature="image"
              value={prompt}
              onChange={setPrompt}
              maxLength={chosen?.maxPromptChars}
              onRun={() => canRun && void run()}
              placeholder="Mô tả cảnh bạn muốn tạo…"
              ask={chosen ? () => ({ field: 'prompt', feature: 'image', text: prompt, room: chosen.maxPromptChars, model: chosen.id }) : null}
            />

            {models !== null && !failed && !chosen && <LockedFields />}
            {chosen && (
              <>
                <Select label="Tỉ lệ" icon="ratio" heading="Chọn tỉ lệ" value={pick.ratio} options={chosen.ratios.map((r) => ({ value: r, label: RATIO_LABEL[r] ?? r }))} onChange={pick.setRatio} />
                <Select label="Độ phân giải" icon="preset" heading="Chọn độ phân giải" value={pick.resolution} options={chosen.resolutions.map((r) => ({ value: r, label: r }))} onChange={pick.setResolution} />
                {pick.thinking && <Select label="Mức suy luận" icon="sliders" heading="Chọn mức suy luận" value={pick.thinking} options={chosen.thinking.map((t) => ({ value: t, label: THINKING_LABEL[t] ?? t }))} onChange={pick.setThinking} />}
              </>
            )}
            <EnhanceToggle on={enhance} onChange={setEnhance} />
            <BrandPicker storeId={storeId} onStore={(v) => (recall.touch(), setStoreId(v))} on={useBrand} onToggle={(v) => (recall.touch(), setUseBrand(v))} />
            <Templates feature="image" data={() => ({ images: images.map((i) => i.id), prompt: prompt.trim(), presetId: styleId, enhance, ratio: pick.ratio, resolution: pick.resolution, modelId: pick.modelId })} />
          </div>

          <div className="form-message">
            {reason && (
              <p className="help" id="imagegen-reason" role="status">
                {reason}
              </p>
            )}
            {wordsModel && (
              <button type="button" className="link-button" onClick={() => pick.setModelId(wordsModel.id)}>
                Dùng {wordsModel.label}
              </button>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {pick.note && <p className="help" role="status">{pick.note}</p>}
            {notice && <p role="status">{notice}</p>}
          </div>
          <div className="runbar">
            <button type="button" className="primary run" disabled={!canRun} aria-describedby={reason ? 'imagegen-reason' : undefined} onClick={() => void run()}>
              Tạo ảnh
              {pick.estimate !== undefined && <span className="run-cost">· ${pick.estimate}</span>}
            </button>
          </div>
        </div>

        <div className="side" id={`imagegen-panel-${panel}`} role="tabpanel" aria-labelledby={`imagegen-tab-${panel}`} hidden={narrow && shown === 'create'}>
          <FormContext.Provider value={{ recreate: (from) => (recall.touch(), recreate(from), narrow && setTab('create')), apply, photo: (p) => void take(p), prompt: (text) => (setPrompt(text), notify('Đã chép mô tả')), result: (p) => void take(p) }}>
            {shown === 'examples' ? <Gallery kind="image" samples="image-example-" label="Ảnh của công ty" emptyText="Chưa có ảnh nào trong công ty. Hãy tạo ảnh đầu tiên." /> : shown === 'about' ? <About page={ABOUT.image} /> : <Tray feature="image" />}
          </FormContext.Provider>
        </div>
      </div>
    </section>
  );
}
