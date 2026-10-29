'use client';
// Try On: a settings card (garments, the model photo, an optional background, model, prompt, resolution, ratio) beside the History, Examples and About tabs,
// laid out like Create. Run posts a try_on job; the inputs go in the order the API expects: the person first, then the garments, then the background.
import { useId, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { promptTooLong } from '@/lib/prompt-limit';
import { tryOnPrompt } from '@/lib/try-on-prompt';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { useSamples } from '@/lib/use-samples';
import { ABOUT } from '@/lib/about-content';
import { About } from './About';
import { Gallery, type Img, LockedFields, RATIO_LABEL, Slot, uploadImages, UPLOAD_ERROR, useImageChoice, useImageModels, useReuse, WorkTabs } from './image-tools';
import { useApplier, useHasHistory, useJobs } from './jobs';
import { ModelPicker } from './ModelPicker';
import { Select } from './Select';
import { Tray } from './Shell';
import { Templates } from './Templates';

type Tab = 'create' | 'history' | 'examples' | 'about';
const TAB_LABEL: Record<Tab, string> = { create: 'Tạo', history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };
const MAX_GARMENTS = 5; // Fash's Nano Banana Pro try-on takes 5 garments (its MaxInputImageCount, read 2026-10-29)

export function TryOn({ reuse }: { reuse?: string }) {
  const { refresh } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const [garments, setGarments] = useState<Img[]>([]);
  const have = useSamples();
  /** The uploaded try-on samples of one kind, `try-on-garment-1.jpg` and so on, in name order. */
  const samplesOf = (kind: string) => [...have].filter((n) => n.startsWith(`try-on-${kind}-`)).sort();
  const [person, setPerson] = useState<Img[]>([]);
  const [background, setBackground] = useState<Img[]>([]);
  const [prompt, setPrompt] = useState('');
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (Create below 1024 px, else History or Examples)
  const opening: Tab = useHasHistory('try_on') ? 'history' : 'examples';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const promptId = useId();
  const reasonId = useId();
  const { models, failed } = useImageModels('try_on');
  const total = garments.length + person.length + background.length;
  const pick = useImageChoice(models, Math.max(2, total));
  const { chosen } = pick;
  const apply = useApplier((s) => {
    if (s.ratio) pick.setRatio(s.ratio);
    if (s.resolution) pick.setResolution(s.resolution);
  });

  // Reuse: the person first, then the garments (their count is kept on the job), then the background.
  useReuse(
    reuse,
    'try_on',
    (j) => {
      const n = j.garments ?? j.images.length - 1;
      setPerson(j.images.slice(0, 1));
      setGarments(j.images.slice(1, 1 + n));
      setBackground(j.images.slice(1 + n, 2 + n));
      setPrompt(j.brief ?? '');
      if (j.modelId) pick.setModelId(j.modelId);
      if (j.ratio) pick.setRatio(j.ratio);
      if (j.resolution) pick.setResolution(j.resolution);
    },
    () => setError('Không tìm thấy ảnh để dùng lại.'),
  );

  // The first thing that stops Run, in the order the form is filled; null when it can go.
  const reason =
    models === null
      ? 'Đang tải danh sách mô hình...'
      : failed
        ? 'Không tải được danh sách mô hình.'
        : !chosen
          ? 'Chưa bật mô hình nào cho Thử đồ. Admin bật trong Quản trị → Cài đặt → Mô hình.'
          : garments.length === 0
            ? 'Tải lên ít nhất 1 ảnh trang phục.'
            : person.length === 0
              ? 'Tải lên ảnh người mẫu.'
              : total > chosen.maxImages
                ? `Mô hình này nhận tối đa ${chosen.maxImages} ảnh (người mẫu, trang phục và bối cảnh).`
                : promptTooLong(chosen, tryOnPrompt(garments.length, background.length > 0, prompt)?.length ?? 0);
  const canRun = reason === null && !busy;
  /** What the member may write: the model's limit less the image roles the prompt starts with. */
  const room = chosen && chosen.maxPromptChars - (tryOnPrompt(Math.max(1, garments.length), background.length > 0, 'x')!.length - 1);

  function add(set: (f: (cur: Img[]) => Img[]) => void) {
    return async (files: File[]) => {
      if (files.length === 0) return;
      setError('');
      setBusy(true);
      try {
        const assets = await uploadImages(files);
        set((cur) => [...cur, ...assets]);
      } catch {
        setError(UPLOAD_ERROR);
      } finally {
        setBusy(false);
      }
    };
  }

  async function run() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const text = prompt.trim();
      const sent = tryOnPrompt(garments.length, background.length > 0, text); // with one garment and no background the server's default prompt says it all
      const body = {
        feature: 'try_on',
        modelId: pick.modelId,
        assetIds: [...person, ...garments, ...background].map((i) => i.id),
        ratio: pick.ratio,
        // The garment count and the member's own text are kept for reuse.
        params: { resolution: pick.resolution, garments: String(garments.length), ...(text && { brief: text }) },
        ...(sent ? { prompt: sent } : {}),
      };
      await api('/api/jobs', sendJson('POST', body));
      setNotice('Đã gửi job. Theo dõi trong tab "Lịch sử".');
      if (!narrow) setTab('history');
      await refresh();
    } catch (e) {
      setError(errorText(e, 'Không gửi được job, hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  const tabs: Tab[] = narrow ? ['create', 'history', 'examples', 'about'] : ['history', 'examples', 'about'];
  const shown: Tab = narrow ? (tab ?? 'create') : tab === null || tab === 'create' ? opening : tab;
  const panel = shown === 'create' ? 'history' : shown;

  return (
    <section aria-labelledby="tryon-title" className="create">
      <h1 id="tryon-title" className="sr-only">
        Thử đồ
      </h1>
      <div className="create-grid">
        <WorkTabs prefix="tryon" tabs={tabs} labels={TAB_LABEL} shown={shown} onSelect={setTab} />

        <div className="card form-card" id="tryon-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'tryon-tab-create' : undefined} hidden={narrow && shown !== 'create'}>
          <div className="form-scroll">
            <Slot label="Trang phục" empty="Thêm 1 đến 5 ảnh trang phục" inputLabel="Ảnh trang phục" images={garments} max={MAX_GARMENTS} busy={busy} onAdd={add(setGarments)} onRemove={(id) => setGarments((c) => c.filter((i) => i.id !== id))} samples={samplesOf('garment')} />
            <Slot label="Người mẫu" empty="Thêm 1 ảnh người mẫu" inputLabel="Ảnh người mẫu" images={person} max={1} busy={busy} onAdd={add(setPerson)} onRemove={(id) => setPerson((c) => c.filter((i) => i.id !== id))} samples={samplesOf('model')} />
            <Slot label="Bối cảnh (tuỳ chọn)" empty="Thêm 1 ảnh bối cảnh nếu muốn" inputLabel="Ảnh bối cảnh" images={background} max={1} busy={busy} onAdd={add(setBackground)} onRemove={(id) => setBackground((c) => c.filter((i) => i.id !== id))} samples={samplesOf('background')} />

            {models && models.length > 0 && <ModelPicker models={pick.options} value={pick.modelId} onChange={pick.setModelId} />}

            <div className="field">
              <label htmlFor={promptId} className="field-label">
                Prompt (tuỳ chọn)
              </label>
              <div className="prompt-box">
                <textarea id={promptId} value={prompt} maxLength={room} placeholder="Mô tả điều bạn muốn..." onChange={(e) => setPrompt(e.target.value)} />
                <div className="prompt-foot">
                  <span>
                    {prompt.length}
                    {room !== undefined && `/${room}`}
                  </span>
                </div>
              </div>
            </div>

            {models !== null && !failed && !chosen && <LockedFields />}
            {chosen && (
              <>
                <Select label="Độ phân giải" icon="preset" heading="Chọn độ phân giải" value={pick.resolution} options={chosen.resolutions.map((r) => ({ value: r, label: r }))} onChange={pick.setResolution} />
                <Select label="Tỉ lệ" icon="ratio" heading="Chọn tỉ lệ" value={pick.ratio} options={chosen.ratios.map((r) => ({ value: r, label: RATIO_LABEL[r] ?? r }))} onChange={pick.setRatio} />
              </>
            )}
            <Templates
              feature="try_on"
              data={() => ({
                images: [...person, ...garments, ...background].map((i) => i.id),
                ...(garments.length > 0 && { garments: garments.length }),
                brief: prompt.trim(),
                ratio: pick.ratio,
                resolution: pick.resolution,
                modelId: pick.modelId,
              })}
            />
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
              Thử đồ
              {pick.estimate !== undefined && <span className="run-cost">· ${pick.estimate}</span>}
            </button>
          </div>
        </div>

        <div className="side" id={`tryon-panel-${panel}`} role="tabpanel" aria-labelledby={`tryon-tab-${panel}`} hidden={narrow && shown === 'create'}>
          {shown === 'examples' ? <Gallery kind="try_on" samples="try-on-example-" cols={[2, 2, 3]} label="Ảnh thử đồ của công ty" emptyText="Chưa có ảnh thử đồ nào trong công ty." /> : shown === 'about' ? <About page={ABOUT.tryOn} /> : <Tray feature="try_on" apply={apply} />}
        </div>
      </div>
    </section>
  );
}
