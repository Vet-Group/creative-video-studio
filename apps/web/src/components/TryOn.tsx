'use client';
// Try On: a settings card (garments, the model photo, an optional background, model, prompt, resolution, ratio) beside the History, Examples and About tabs,
// laid out like Create. Run posts a try_on job; the inputs go in the order the API expects: the person first, then the garments, then the background.
import { useEffect, useId, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { promptTooLong } from '@/lib/prompt-limit';
import { confirmRun } from '@/lib/run-guard';
import { tryOnPrompt } from '@/lib/try-on-prompt';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { useRecall } from '@/lib/use-recall';
import { useSamples } from '@/lib/use-samples';
import { backgroundsIn, GARMENT_CATEGORIES, garmentsOf, posesOf, stockModels } from '@/lib/try-on-stock';
import { ABOUT } from '@/lib/about-content';
import { About } from './About';
import { copyError, copySamples, Gallery, type Img, LockedFields, PhotoDialog, photoImg, RATIO_LABEL, Slot, THINKING_LABEL, uploadError, uploadImages, UPLOAD_ERROR, useImageChoice, useImageModels, useReuse, WorkTabs } from './image-tools';
import type { UploadSlot } from '@/lib/upload-slots';
import { FormContext, type Photo, type PhotoRole, useApplier, useJobs } from './jobs';
import { ModelPicker } from './ModelPicker';
import { PromptComposer } from './PromptComposer';
import { Select } from './Select';
import { Tray } from './Shell';
import { Templates } from './Templates';
import { PageHint } from './ToolGuide';

type Tab = 'create' | 'history' | 'examples' | 'about';
const TAB_LABEL: Record<Tab, string> = { create: 'Tạo', history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };
const MAX_GARMENTS = 5; // Fash's Nano Banana Pro try-on takes 5 garments (its MaxInputImageCount, read 2026-10-29)

export function TryOn({ reuse }: { reuse?: string }) {
  const { refresh, notify, loading } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const [garments, setGarments] = useState<Img[]>([]);
  const have = useSamples();
  /** The uploaded try-on samples of one kind, `try-on-garment-1.jpg` and so on, in name order. */
  const samplesOf = (kind: string) => [...have].filter((n) => n.startsWith(`try-on-${kind}-`)).sort();
  /** Fash's pickers: a model then its pose, a garment category then its garments, a named background. */
  const [picker, setPicker] = useState<{ role: 'model' | 'garment' | 'background'; of?: string } | null>(null);
  const models0 = stockModels(have);
  const backgrounds = backgroundsIn(have);
  const categories = GARMENT_CATEGORIES.filter((c) => garmentsOf(have, c.id).length > 0);
  /** The member's own model photos from earlier Try On jobs (Fash's My Models); a failure leaves just the stock ones. */
  const [myModels, setMyModels] = useState<Img[]>([]);
  useEffect(() => {
    api<{ assets: Img[] }>('/api/assets?recent=try-on-model').then(
      (r) => setMyModels(r.assets),
      () => {},
    );
  }, []);
  const [person, setPerson] = useState<Img[]>([]);
  const [background, setBackground] = useState<Img[]>([]);
  const [prompt, setPrompt] = useState('');
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (Create below 1024 px, else Examples)
  const opening: Tab = 'examples'; // owner, 2026-11-09: beside the form a page opens on Examples, History is one click away
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const promptId = useId();
  const reasonId = useId();
  const { models, failed } = useImageModels('try_on');
  const total = garments.length + person.length + background.length;
  const pick = useImageChoice(models, Math.max(2, total));
  const { chosen } = pick;
  // The member's last model and settings, unless a refill opens the page.
  const recall = useRecall(
    'try_on',
    (s) => {
      pick.setModelId(s.modelId);
      if (s.ratio) pick.setRatio(s.ratio);
      if (s.resolution) pick.setResolution(s.resolution);
    },
    { skip: reuse !== undefined },
  );
  const apply = useApplier((s) => {
    recall.touch();
    if (s.ratio) pick.setRatio(s.ratio);
    if (s.resolution) pick.setResolution(s.resolution);
  });

  // Reuse: the person first, then the garments (their count is kept on the job), then the background.
  const recreate = useReuse(
    reuse,
    'try_on',
    (j) => {
      recall.touch();
      const n = j.garments ?? j.images.length - 1;
      setPerson(j.images.slice(0, 1));
      setGarments(j.images.slice(1, 1 + n));
      setBackground(j.images.slice(1 + n, 2 + n));
      setPrompt(j.brief ?? '');
      pick.refill(j);
    },
    (e) => setError(copyError(e, 'Không tìm thấy ảnh để dùng lại.')),
  );

  // The first thing that stops Run, in the order the form is filled; null when it can go.
  const reason =
    !recall.answered
      ? 'Đang tải cài đặt đã dùng...'
      : models === null
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

  /** A detail's photo in its slot, as Fash's clicks on a detail's inputs and its Use Result do. */
  async function take(p: Photo, role: PhotoRole, note?: string) {
    if (role === 'garment' && garments.length >= MAX_GARMENTS) return notify(`Tối đa ${MAX_GARMENTS} ảnh trang phục`);
    setError('');
    try {
      const img = await photoImg(p).finally(loading('Đang tải ảnh...'));
      if (role === 'model') setPerson([img]);
      else if (role === 'background') setBackground([img]);
      else setGarments((cur) => (cur.length < MAX_GARMENTS ? [...cur, img] : cur));
      notify(note ?? (role === 'model' ? 'Đã dùng ảnh người mẫu' : role === 'background' ? 'Đã chọn bối cảnh' : 'Đã thêm trang phục'));
    } catch (e) {
      setError(copyError(e, UPLOAD_ERROR));
    }
  }

  async function put(set: (f: (cur: Img[]) => Img[]) => void, get: () => Promise<Img[]>) {
    setError('');
    setBusy(true);
    try {
      const assets = await get();
      set((cur) => [...cur, ...assets]);
    } catch (e) {
      setError(copyError(e, uploadError(e)));
    } finally {
      setBusy(false);
    }
  }
  const add = (set: (f: (cur: Img[]) => Img[]) => void, slot: UploadSlot) => (files: File[]) => void (files.length > 0 && put(set, () => uploadImages(files, 'image', '', slot).finally(loading('Đang tải lên…'))));
  /** A sample under an empty slot, copied on the server like Recreate's photos. */
  const addSample = (set: (f: (cur: Img[]) => Img[]) => void, slot: UploadSlot) => (name: string) => void put(set, () => copySamples([name], slot));

  async function run() {
    if (!(await confirmRun(pick.estimate))) return;
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
        params: { resolution: pick.resolution, ...(pick.thinking && { thinking: pick.thinking }), garments: String(garments.length), ...(text && { brief: text }) },
        ...(sent ? { prompt: sent } : {}),
      };
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
    <section aria-labelledby="tryon-title" className="create">
      <h1 id="tryon-title" className="sr-only">
        Thử đồ
      </h1>
      <div className="create-grid">
        <WorkTabs prefix="tryon" tabs={tabs} labels={TAB_LABEL} shown={shown} onSelect={setTab} />

        <div className="card form-card" id="tryon-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'tryon-tab-create' : undefined} hidden={narrow && shown !== 'create'} onPointerDownCapture={recall.touch} onKeyDownCapture={recall.touch}>
          <div className="form-scroll">
            <PageHint href="/try-on" />
            <Slot label="Trang phục" empty="Thêm 1 đến 5 ảnh trang phục" inputLabel="Ảnh trang phục" images={garments} max={MAX_GARMENTS} busy={busy} onAdd={add(setGarments, 'garment')} onRemove={(id) => setGarments((c) => c.filter((i) => i.id !== id))} samples={categories.length > 0 ? [] : samplesOf('garment')} onSample={addSample(setGarments, 'garment')} onBrowse={categories.length > 0 ? () => setPicker({ role: 'garment' }) : undefined} onPick={(a) => setGarments((c) => (c.length < MAX_GARMENTS ? [...c, a] : c))} />
            <Slot label="Người mẫu" empty="Thêm 1 ảnh người mẫu" inputLabel="Ảnh người mẫu" images={person} max={1} busy={busy} onAdd={add(setPerson, 'model')} onRemove={(id) => setPerson((c) => c.filter((i) => i.id !== id))} samples={models0.length > 0 ? [] : samplesOf('model')} onSample={addSample(setPerson, 'model')} onBrowse={models0.length + myModels.length > 0 ? () => setPicker({ role: 'model' }) : undefined} onPick={(a) => setPerson([a])} />
            <Slot label="Bối cảnh (tuỳ chọn)" empty="Thêm 1 ảnh bối cảnh nếu muốn" inputLabel="Ảnh bối cảnh" images={background} max={1} busy={busy} onAdd={add(setBackground, 'background')} onRemove={(id) => setBackground((c) => c.filter((i) => i.id !== id))} samples={backgrounds.length > 0 ? [] : samplesOf('background')} onSample={addSample(setBackground, 'background')} onBrowse={backgrounds.length > 0 ? () => setPicker({ role: 'background' }) : undefined} onPick={(a) => setBackground([a])} />
            <PhotoDialog
              open={picker !== null}
              title={picker?.of ? (picker.role === 'model' ? 'Chọn tư thế' : GARMENT_CATEGORIES.find((c) => c.id === picker.of)!.label) : picker?.role === 'model' ? 'Chọn người mẫu' : picker?.role === 'garment' ? 'Chọn trang phục' : 'Chọn bối cảnh'}
              tiles={
                !picker ? [] :
                picker.role === 'model' && !picker.of ? models0.map((name, i) => ({ key: name, src: `/api/samples/${name}`, label: `Người mẫu có sẵn ${i + 1}`, pick: () => (posesOf(have, name).length > 0 ? setPicker({ role: 'model', of: name }) : void take({ sample: name }, 'model')) })) :
                picker.role === 'model' ? posesOf(have, picker.of!).map((name, i) => ({ key: name, src: `/api/samples/${name}`, label: `Tư thế ${i + 1}`, pick: () => void take({ sample: name }, 'model') })) :
                picker.role === 'garment' && !picker.of ? categories.map((c) => ({ key: c.id, src: `/api/samples/${have.has(`try-on-stock-${c.id}.jpg`) ? `try-on-stock-${c.id}.jpg` : garmentsOf(have, c.id)[0]}`, label: c.label, pick: () => setPicker({ role: 'garment', of: c.id }) })) :
                picker.role === 'garment' ? garmentsOf(have, picker.of!).map((name, i) => ({ key: name, src: `/api/samples/${name}`, label: `${GARMENT_CATEGORIES.find((c) => c.id === picker.of)!.label} ${i + 1}`, pick: () => void take({ sample: name }, 'garment') })) :
                backgrounds.map((b) => ({ key: b.name, src: `/api/samples/${b.name}`, label: b.label, pick: () => void take({ sample: b.name }, 'background') }))
              }
              busy={busy}
              onFile={(files) => void (picker?.role === 'model' ? add(setPerson, 'model') : picker?.role === 'background' ? add(setBackground, 'background') : add(setGarments, 'garment'))(files)}
              onClose={() => setPicker(null)}
              onBack={picker?.of ? () => setPicker({ role: picker.role }) : undefined}
              mine={picker?.role === 'model' && !picker.of ? { title: 'Người mẫu của tôi', tiles: myModels.map((a) => ({ key: a.id, src: `/api/assets/${a.id}/content`, label: `Dùng lại ${a.filename}`, pick: () => setPerson([a]) })) } : undefined}
            />

            {models && models.length > 0 && <ModelPicker models={pick.options} value={pick.modelId} onChange={pick.setModelId} />}

            <PromptComposer
              id={promptId}
              label="Mô tả"
              optional
              feature="try_on"
              value={prompt}
              onChange={setPrompt}
              maxLength={room}
              onRun={() => canRun && void run()}
              placeholder="Ví dụ: người mẫu đứng trong studio sáng, toàn thân"
              ask={chosen ? () => ({ field: 'prompt', feature: 'try_on', text: prompt, ...(room !== undefined && { room }), model: chosen.id }) : null}
            />

            {models !== null && !failed && !chosen && <LockedFields />}
            {chosen && (
              <>
                <Select label="Độ phân giải" icon="preset" heading="Chọn độ phân giải" value={pick.resolution} options={chosen.resolutions.map((r) => ({ value: r, label: r }))} onChange={pick.setResolution} />
                <Select label="Tỉ lệ" icon="ratio" heading="Chọn tỉ lệ" value={pick.ratio} options={chosen.ratios.map((r) => ({ value: r, label: RATIO_LABEL[r] ?? r }))} onChange={pick.setRatio} />
                {pick.thinking && <Select label="Mức suy luận" icon="sliders" heading="Chọn mức suy luận" value={pick.thinking} options={chosen.thinking.map((t) => ({ value: t, label: THINKING_LABEL[t] ?? t }))} onChange={pick.setThinking} />}
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
            {pick.note && <p className="help" role="status">{pick.note}</p>}
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
          <FormContext.Provider
            value={{
              recreate: (from) => (recall.touch(), recreate(from), narrow && setTab('create')),
              apply,
              photo: (p, role) => void take(p, role),
              prompt: (text) => (setPrompt(text), notify('Đã chép mô tả')),
              result: (p) => void take(p, 'model', 'Đã dùng kết quả làm ảnh người mẫu'),
            }}
          >
            {shown === 'examples' ? <Gallery kind="try_on" samples="try-on-example-" cols={[2, 2, 3]} label="Ảnh thử đồ của công ty" emptyText="Chưa có ảnh thử đồ nào trong công ty." /> : shown === 'about' ? <About page={ABOUT.tryOn} /> : <Tray feature="try_on" />}
          </FormContext.Provider>
        </div>
      </div>
    </section>
  );
}
