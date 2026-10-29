'use client';
// Image Generation: tabs over the gallery of the company's images (or History, or About), and a floating prompt bar pinned to the bottom of the content area
// with an upload tile, the prompt, the model, ratio and resolution pills, and Run. Every pill is a Select or the model picker, so each works by keyboard.
import { useRef, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { ABOUT } from '@/lib/about-content';
import { promptTooLong } from '@/lib/prompt-limit';
import { confirmRun, runKey } from '@/lib/run-guard';
import { useHydrated } from '@/lib/use-hydrated';
import { useRecall } from '@/lib/use-recall';
import { About } from './About';
import { Gallery, type Img, photoImg, RATIO_LABEL, uploadImages, UPLOAD_ERROR, useImageChoice, useImageModels, useReuse, WorkTabs } from './image-tools';
import { EnhanceToggle } from './EnhanceToggle';
import { Icon } from './Icon';
import { FormContext, type Photo, useApplier, useJobs } from './jobs';
import { ModelPicker } from './ModelPicker';
import { PromptTools } from './PromptTools';
import { Select } from './Select';
import { Tray } from './Shell';
import { Templates } from './Templates';

type Tab = 'history' | 'examples' | 'about';
const TAB_LABEL: Record<Tab, string> = { history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };
const TABS: Tab[] = ['history', 'examples', 'about'];

export function ImageGeneration({ reuse, model }: { reuse?: string; model?: string }) {
  const { refresh, notify, loading } = useJobs();
  const hydrated = useHydrated();
  const [images, setImages] = useState<Img[]>([]);
  const [prompt, setPrompt] = useState('');
  const [enhance, setEnhance] = useState(true); // on by default, as on Fash
  const [tab, setTab] = useState<Tab>('examples');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
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
    } catch {
      setError(UPLOAD_ERROR);
    }
  }

  const recreate = useReuse(
    reuse,
    'image',
    (j) => {
      recall.touch();
      setImages(j.images);
      setPrompt(j.prompt ?? '');
      setEnhance(j.enhance ?? true);
      if (j.modelId) pick.setModelId(j.modelId);
      if (j.ratio) pick.setRatio(j.ratio);
      if (j.resolution) pick.setResolution(j.resolution);
    },
    () => setError('Không tìm thấy ảnh để dùng lại.'),
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
  // The bar has no counter, as on the live page, until the text nears the model's limit (or is over it after a switch).
  const count = chosen && prompt.length >= chosen.maxPromptChars * 0.8 ? `${prompt.length}/${chosen.maxPromptChars} ký tự` : null;

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setError('');
    setBusy(true);
    try {
      const assets = await uploadImages(files.slice(0, Math.max(0, max - images.length)));
      setImages((cur) => [...cur, ...assets]);
    } catch {
      setError(UPLOAD_ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!confirmRun(pick.estimate)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = { feature: 'image', modelId: pick.modelId, assetIds: images.map((i) => i.id), prompt: prompt.trim(), enhance, ratio: pick.ratio, params: { resolution: pick.resolution } };
      await api('/api/jobs', sendJson('POST', body));
      setNotice('Đã gửi job. Theo dõi trong tab "Lịch sử".');
      setTab('history');
      await refresh();
    } catch (e) {
      setError(errorText(e, 'Không gửi được job, hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="imagegen-title" className="imagegen">
      <h1 id="imagegen-title" className="sr-only">
        Tạo ảnh
      </h1>
      <WorkTabs prefix="imagegen" tabs={TABS} labels={TAB_LABEL} shown={tab} onSelect={setTab} />
      {/* Above the gallery, not in the prompt bar, which keeps Fash's one-row height. */}
      <Templates feature="image" data={() => ({ images: images.map((i) => i.id), prompt: prompt.trim(), enhance, ratio: pick.ratio, resolution: pick.resolution, modelId: pick.modelId })} />
      <div className="imagegen-side" id={`imagegen-panel-${tab}`} role="tabpanel" aria-labelledby={`imagegen-tab-${tab}`}>
        <FormContext.Provider value={{ recreate: (from) => (recall.touch(), recreate(from)), apply, photo: (p) => void take(p), prompt: (text) => (setPrompt(text), notify('Đã chép prompt')), result: (p) => void take(p) }}>
          {tab === 'examples' ? <Gallery kind="image" samples="image-example-" label="Ảnh của công ty" emptyText="Chưa có ảnh nào trong công ty. Hãy tạo ảnh đầu tiên bên dưới." /> : tab === 'about' ? <About page={ABOUT.image} /> : <Tray feature="image" />}
        </FormContext.Provider>
      </div>

      <div className="imagebar" role="group" aria-label="Thanh tạo ảnh" onPointerDownCapture={recall.touch} onKeyDownCapture={recall.touch}>
        <div className="imagebar-top">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            aria-label="Ảnh tham chiếu"
            disabled={!hydrated}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              void upload(files);
            }}
          />
          <ul className="bar-thumbs" aria-label="Ảnh đã chọn">
            {images.map((i) => (
              <li key={i.id}>
                <img src={`/api/assets/${i.id}/content`} alt={i.filename} />
                <button type="button" aria-label={`Bỏ ảnh ${i.filename}`} onClick={() => setImages((cur) => cur.filter((x) => x.id !== i.id))}>
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
            {images.length < max && (
              <li>
                <button type="button" className="bar-add" aria-label="Thêm ảnh tham chiếu" disabled={!hydrated || busy} onClick={() => input.current?.click()}>
                  <Icon name="plus" size={16} />
                </button>
              </li>
            )}
          </ul>
          <textarea aria-label="Mô tả cảnh bạn muốn tạo" placeholder="Mô tả cảnh bạn muốn tạo…" value={prompt} maxLength={chosen?.maxPromptChars} rows={2} onChange={(e) => setPrompt(e.target.value)} onKeyDown={runKey(() => canRun && void run())} />
          <PromptTools bare feature="image" value={prompt} onChange={setPrompt} maxLength={chosen?.maxPromptChars} onRun={() => canRun && void run()} />
        </div>
        {(reason || error || notice || count) && (
          <div className="bar-message">
            {count && <p className="help bar-count">{count}</p>}
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
            {notice && <p role="status">{notice}</p>}
          </div>
        )}
        <div className="imagebar-bottom">
          <div className="pills">
            {models && models.length > 0 && <ModelPicker models={pick.options} value={pick.modelId} onChange={pick.setModelId} />}
            {models !== null && !failed && !chosen && (
              <span className="locked-pills" aria-hidden="true">
                {([['Chưa bật mô hình', 'image'], ['Tỉ lệ', 'ratio'], ['Độ phân giải', 'preset']] as const).map(([label, icon]) => (
                  <span key={label} className="select-trigger locked">
                    <Icon name={icon} />
                    {label}
                  </span>
                ))}
              </span>
            )}
            {chosen && (
              <>
                <Select label="Tỉ lệ" icon="ratio" heading="Chọn tỉ lệ" value={pick.ratio} options={chosen.ratios.map((r) => ({ value: r, label: RATIO_LABEL[r] ?? r }))} onChange={pick.setRatio} />
                <Select label="Độ phân giải" icon="preset" heading="Chọn độ phân giải" value={pick.resolution} options={chosen.resolutions.map((r) => ({ value: r, label: r }))} onChange={pick.setResolution} />
              </>
            )}
          </div>
          <EnhanceToggle on={enhance} onChange={setEnhance} />
          <button type="button" className="primary bar-run" disabled={!canRun} aria-describedby={reason ? 'imagegen-reason' : undefined} onClick={() => void run()}>
            Tạo ảnh
            {pick.estimate !== undefined && <span className="run-cost">· ${pick.estimate}</span>}
          </button>
        </div>
      </div>
    </section>
  );
}
