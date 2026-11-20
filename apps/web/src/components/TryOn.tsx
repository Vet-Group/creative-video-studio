'use client';
// Try On: a settings card (garments, the model photo, an optional background, model, prompt, resolution, ratio) beside the History, Examples and About tabs,
// laid out like Create. Run posts a try_on job; the inputs go in the order the API expects: the person first, then the garments, then the background.
import { useEffect, useId, useState } from 'react';
import { api, errorText, thumbUrl } from '@/lib/api';
import { basePrompt, promptTooLong } from '@/lib/prompt-limit';
import { tryOnPlaces, tryOnSlots } from '@/lib/reuse';
import { confirmRun, sendRun } from '@/lib/run-guard';
import { tryOnPrompt } from '@/lib/try-on-prompt';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { parseFashionTraits } from '@/lib/fashion-model';
import { usable } from '@/lib/fashion-models';
import { useFashionModels } from '@/lib/use-fashion-models';
import { useRecall } from '@/lib/use-recall';
import { useDraftState } from '@/lib/use-draft';
import { sampleThumb, useSamples } from '@/lib/use-samples';
import { backgroundsIn, GARMENT_CATEGORIES, garmentCap, garmentsOf, PORTRAIT_FILTERS, portraitGender, portraitName, type PortraitFilter, portraitsIn, poseOf, POSES, posesOf, stockModels } from '@/lib/try-on-stock';
import { About } from './About';
import { copyError, copySamples, fashionTiles, FormNotice, Gallery, type Img, LockedFields, PhotoDialog, photoImg, RATIO_LABEL, Slot, THINKING_LABEL, uploadError, uploadImages, UPLOAD_ERROR, useImageChoice, useImageModels, useReuse, WorkTabs } from './image-tools';
import type { UploadSlot } from '@/lib/upload-slots';
import { Icon } from './Icon';
import { FormContext, type Photo, type PhotoRole, useApplier, useJobs } from './jobs';
import { ModelPicker } from './ModelPicker';
import { OwnModel } from './OwnModel';
import { PromptComposer } from './PromptComposer';
import { PromptPreview } from './PromptSections';
import { Select } from './Select';
import { Tray } from './Shell';
import { Templates } from './Templates';
import { PageHint } from './ToolGuide';

type Tab = 'create' | 'history' | 'examples' | 'about';
const TAB_LABEL: Record<Tab, string> = { create: 'Tạo', history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };

export function TryOn({ reuse, model }: { reuse?: string; model?: Img }) {
  const { refresh, notify, loading } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const [garments, setGarments] = useState<Img[]>([]);
  const have = useSamples();
  /** The uploaded try-on samples of one kind, `try-on-garment-1.jpg` and so on, in name order. */
  const samplesOf = (kind: string) => [...have].filter((n) => n.startsWith(`try-on-${kind}-`)).sort();
  /** Fash's pickers: a model then its pose, a garment category then its garments, a named background; `pose` is the pose step of the photo in the Model slot (its chip). */
  const [picker, setPicker] = useState<{ role: 'model' | 'garment' | 'background' | 'pose'; of?: string } | null>(null);
  const models0 = stockModels(have);
  const backgrounds = backgroundsIn(have);
  const categories = GARMENT_CATEGORIES.filter((c) => garmentsOf(have, c.id).length > 0);
  /** Fash's model catalog, by its four filters, and the pose a run asks for (null: the photo's own pose). */
  const [portraitFilter, setPortraitFilter] = useState<PortraitFilter>({});
  const portraits = portraitsIn(have, portraitFilter);
  const catalog = portraitsIn(have, {}).length > 0;
  const [pose, setPose] = useState<string | null>(null);
  const posesFor = (gender: 'woman' | 'man') => POSES.filter((p) => have.has(`try-on-pose-${gender}-${p.value}.jpg`));
  const stockTiles = models0.map((name, i) => ({ key: name, src: sampleThumb(name), label: `Người mẫu có sẵn ${i + 1}`, pick: () => (posesOf(have, name).length > 0 ? setPicker({ role: 'model', of: name }) : void take({ sample: name }, 'model')) }));
  // A catalog model goes on to Fash's pose step, the poses shown on a model of its gender.
  const portraitTiles = portraits.map((p) => {
    const name = `${p.name[0]!.toUpperCase()}${p.name.slice(1)}`;
    return { key: portraitName(p), src: sampleThumb(portraitName(p)), label: `Người mẫu ${name}`, caption: name, pick: () => (posesFor(p.gender).length > 0 ? setPicker({ role: 'model', of: portraitName(p) }) : void take({ sample: portraitName(p) }, 'model')) };
  });
  const portraitOf = picker?.role === 'model' && picker.of ? portraitGender(picker.of) : null;
  /** The member's own model photos from earlier Try On jobs (Fash's My Models); a failure leaves just the stock ones. */
  const [myModels, setMyModels] = useState<Img[]>([]);
  useEffect(() => {
    api<{ assets: Img[] }>('/api/assets?recent=try-on-model').then(
      (r) => setMyModels(r.assets),
      () => {},
    );
  }, []);
  /** Fash's "Create a model unique to your brand" in place of the model picker's photos; a save reads the AI models again. */
  const [own, setOwn] = useState(false);
  const [saved, setSaved] = useState(0);
  const aiModels = usable(useFashionModels(true, saved).models ?? []);
  const [person, setPerson] = useState<Img[]>(model ? [model] : []); // `model`: a saved AI model the page opened with (?model=)
  const [background, setBackground] = useState<Img[]>([]);
  const [prompt, setPrompt, clearDraft] = useDraftState('try-on', reuse !== undefined);
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (Create below 1024 px, else Examples)
  const opening: Tab = 'examples'; // owner, 2026-11-09: beside the form a page opens on Examples, History is one click away
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const promptId = useId();
  const reasonId = useId();
  const { models, failed } = useImageModels('try_on');
  const total = garments.length + person.length + background.length;
  // Without a model picked, the first one that takes the garments too (13 only on Nano Banana 2.1), so a long list is not judged by a 5-garment model.
  const pick = useImageChoice(models, Math.max(2, total), '', (m) => garmentCap(m.id) >= garments.length);
  const { chosen } = pick;
  /** How many garments the chosen model takes (13 on Nano Banana 2.1, else 5); a switch to a lower cap keeps the photos and stops Run until some go. */
  const cap = garmentCap(chosen?.id);
  /** How many the slot offers: the cap, within the model's image limit less the person and a background. */
  const slotCap = chosen ? Math.max(1, Math.min(cap, chosen.maxImages - 1 - background.length)) : cap;
  /** How many photos past the model's limit; when the background alone is that many, the reason names it, and garments only while one would stay. */
  const overBy = chosen ? total - chosen.maxImages : 0;
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

  // Reuse: the person first, then the garments (their count is kept on the job), then the background; a deleted photo leaves its slot empty.
  const recreate = useReuse(
    reuse,
    'try_on',
    (j) => {
      recall.touch();
      if (j.images) {
        const slots = tryOnSlots(j.inputIds, j.images, j.garments);
        setPerson(slots.person);
        setGarments(slots.garments);
        setBackground(slots.background);
      }
      setPose(j.pose ?? null);
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
              : garments.length > cap
                ? `Mô hình này nhận tối đa ${cap} ảnh trang phục. Bỏ bớt ${garments.length - cap} ảnh để chạy.`
                : person.length === 0
                  ? 'Tải lên ảnh người mẫu.'
                  : overBy > 0
                    ? background.length > 0 && overBy <= background.length
                      ? `Mô hình này nhận tối đa ${chosen.maxImages} ảnh, tính cả ảnh bối cảnh. ${garments.length > overBy ? `Bỏ ảnh bối cảnh hoặc bớt ${overBy} ảnh trang phục` : 'Bỏ ảnh bối cảnh'} để chạy.`
                      : `Mô hình này nhận tối đa ${chosen.maxImages} ảnh (người mẫu, trang phục và bối cảnh).`
                    : promptTooLong(chosen, tryOnPrompt(garments.length, background.length > 0, prompt, pose)?.length ?? 0);
  const canRun = reason === null && !busy;
  /** What the member may write: the model's limit less the image roles the prompt starts with. */
  const room = chosen && chosen.maxPromptChars - (tryOnPrompt(Math.max(1, garments.length), background.length > 0, 'x', pose)!.length - 1);
  const preview = basePrompt('try_on', tryOnPrompt(Math.max(1, garments.length), background.length > 0, prompt, pose))!;

  /** A detail's photo in its slot, as Fash's clicks on a detail's inputs and its Use Result do. */
  async function take(p: Photo, role: PhotoRole, note?: string) {
    if (role === 'garment' && garments.length >= slotCap) return notify(`Tối đa ${slotCap} ảnh trang phục`);
    setError('');
    try {
      const img = await photoImg(p).finally(loading('Đang tải ảnh...'));
      if (role === 'model') setPerson([img]);
      else if (role === 'background') setBackground([img]);
      else setGarments((cur) => (cur.length < slotCap ? [...cur, img] : cur));
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
      const sent = tryOnPrompt(garments.length, background.length > 0, text, pose); // with one garment, no background and no pose the server's default prompt says it all
      const body = {
        feature: 'try_on',
        modelId: pick.modelId,
        assetIds: [...person, ...garments, ...background].map((i) => i.id),
        ratio: pick.ratio,
        // The garment count and the member's own text are kept for reuse.
        params: { resolution: pick.resolution, ...(pick.thinking && { thinking: pick.thinking }), garments: String(garments.length), ...(pose && { pose }), ...(text && { brief: text }) },
        ...(sent ? { prompt: sent } : {}),
      };
      if (!(await sendRun(body))) return;
      clearDraft();
      setNotice('Đã gửi lượt tạo. Theo dõi trong tab "Lịch sử".');
      if (!narrow) setTab('history');
      await refresh();
    } catch (e) {
      setError(errorText(e, 'Không gửi được lượt tạo, hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  /** The pose step: after a model in the picker (`picker.of`: a pick takes that model too) or from the Model slot's chip (the photo in the slot: a pick sets the pose only). */
  const posing = picker?.role === 'pose' || (picker?.role === 'model' && picker.of !== undefined);
  const inSlot = picker?.role === 'pose' ? person[0] : undefined;
  // The chip's previews are of the portrait's gender, or an AI model's, else (an own photo) of the gender that has them.
  const aiGender = parseFashionTraits(aiModels.find((m) => m.assetId === inSlot?.id)?.traits)?.gender;
  const poseGender = picker?.role === 'pose' ? (portraitGender(inSlot?.filename ?? '') ?? (aiGender === 'male' ? 'man' : aiGender === 'female' ? 'woman' : null) ?? (posesFor('woman').length > 0 ? 'woman' : 'man')) : portraitOf;
  const poseSrc = inSlot ? (inSlot.url ?? thumbUrl(inSlot.id)) : picker?.role === 'model' && picker.of ? sampleThumb(picker.of) : undefined;
  const choosePose = (value: string | null) => {
    setPose(value);
    if (picker?.role === 'model') void take({ sample: picker.of! }, 'model');
  };
  // "Không chọn tư thế" first, as Fash's "No pose", then every pose: its picture on the model's gender, or its name until one is uploaded.
  // A stock model's own pose photos have no names, so no captions and no chosen mark.
  const poseTiles = [
    { key: 'none', label: 'Không chọn tư thế', note: 'Bạn có thể tả tư thế trong ô Mô tả. (Tuỳ chọn)', pressed: poseGender ? pose === null : undefined, pick: () => choosePose(null) },
    ...(poseGender
      ? POSES.map((p) => {
          const file = `try-on-pose-${poseGender}-${p.value}.jpg`;
          return { key: p.value, src: have.has(file) ? sampleThumb(file) : undefined, label: p.label, caption: p.label, pressed: pose === p.value, pick: () => choosePose(p.value) };
        })
      : picker?.of ? posesOf(have, picker.of).map((name, i) => ({ key: name, src: sampleThumb(name), label: `Tư thế ${i + 1}`, pick: () => void take({ sample: name }, 'model') })) : []),
  ];

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
            <Slot label="Trang phục" empty={slotCap === 1 ? 'Thêm 1 ảnh trang phục' : `Thêm 1 đến ${slotCap} ảnh trang phục`} inputLabel="Ảnh trang phục" images={garments} max={slotCap} count busy={busy} onAdd={add(setGarments, 'garment')} onRemove={(id) => setGarments((c) => c.filter((i) => i.id !== id))} samples={categories.length > 0 ? [] : samplesOf('garment')} onSample={addSample(setGarments, 'garment')} onBrowse={categories.length > 0 ? () => setPicker({ role: 'garment' }) : undefined} onPick={(a) => setGarments((c) => (c.length < slotCap ? [...c, a] : c))} />
            <Slot label="Người mẫu" empty="Thêm 1 ảnh người mẫu" inputLabel="Ảnh người mẫu" images={person} max={1} busy={busy} onAdd={add(setPerson, 'model')} onRemove={(id) => setPerson((c) => c.filter((i) => i.id !== id))} samples={models0.length > 0 ? [] : samplesOf('model')} onSample={addSample(setPerson, 'model')} onBrowse={() => setPicker({ role: 'model' })} onPick={(a) => setPerson([a])} extra={(person.length > 0 || pose) && (
              // The pose beside the model photo, as Fash's "Hand on Hip x" chip; it opens the pose step's pictures for the photo in the slot.
              // A click focuses it (Safari does not), so the closing dialog hands the focus back to it.
              <span className="pose-chip">
                <button type="button" className="pose-trigger" data-value={pose ?? ''} aria-haspopup="dialog" onClick={(e) => (e.currentTarget.focus(), setPicker({ role: 'pose' }))}>
                  <Icon name="model" />
                  <span className="sr-only">Tư thế: </span>
                  <span className="pose-name">{poseOf(pose)?.label ?? 'Chọn tư thế'}</span>
                  <Icon name="down" />
                </button>
                {pose && (
                  <button
                    type="button"
                    className="pose-clear"
                    aria-label="Bỏ tư thế"
                    onClick={(e) => {
                      const slot = e.currentTarget.closest('.slot');
                      setPose(null);
                      // This button goes: focus the chip, or the slot's upload button when the chip goes too (no photo).
                      requestAnimationFrame(() => (slot?.querySelector<HTMLElement>('.pose-trigger') ?? slot?.querySelector<HTMLElement>('.slot-add'))?.focus());
                    }}
                  >
                    <Icon name="x" size={12} />
                  </button>
                )}
              </span>
            )} />
            <Slot label="Bối cảnh (tuỳ chọn)" empty="Thêm 1 ảnh bối cảnh nếu muốn" inputLabel="Ảnh bối cảnh" images={background} max={1} busy={busy} onAdd={add(setBackground, 'background')} onRemove={(id) => setBackground((c) => c.filter((i) => i.id !== id))} samples={backgrounds.length > 0 ? [] : samplesOf('background')} onSample={addSample(setBackground, 'background')} onBrowse={backgrounds.length > 0 ? () => setPicker({ role: 'background' }) : undefined} onPick={(a) => setBackground([a])} />
            {own ? (
              <PhotoDialog
                open={picker !== null}
                title="Tạo người mẫu riêng"
                sub="Chọn đặc điểm, AI tạo một người mẫu toàn thân trên nền trắng và lưu vào mục Người mẫu AI để dùng lại."
                tiles={[]}
                busy={busy}
                onClose={() => (setOwn(false), setPicker(null))}
                onBack={() => setOwn(false)}
                filter={<OwnModel onSaved={() => setSaved((n) => n + 1)} onPick={(img) => (setOwn(false), setPicker(null), setPerson([img]))} />}
              />
            ) : (
            <PhotoDialog
              open={picker !== null}
              title={posing ? 'Chọn tư thế' : picker?.of ? GARMENT_CATEGORIES.find((c) => c.id === picker.of)!.label : picker?.role === 'model' ? 'Chọn người mẫu' : picker?.role === 'garment' ? 'Chọn trang phục' : 'Chọn bối cảnh'}
              tiles={
                !picker ? [] :
                posing ? poseTiles :
                picker.role === 'model' ? (catalog ? portraitTiles : stockTiles) :
                picker.role === 'garment' && !picker.of ? categories.map((c) => ({ key: c.id, src: sampleThumb(have.has(`try-on-stock-${c.id}.jpg`) ? `try-on-stock-${c.id}.jpg` : garmentsOf(have, c.id)[0]!), label: c.label, caption: c.label, pick: () => setPicker({ role: 'garment', of: c.id }) })) :
                picker.role === 'garment' ? garmentsOf(have, picker.of!).map((name, i) => ({ key: name, src: sampleThumb(name), label: `${GARMENT_CATEGORIES.find((c) => c.id === picker.of)!.label} ${i + 1}`, pick: () => void take({ sample: name }, 'garment') })) :
                backgrounds.map((b) => ({ key: b.name, src: sampleThumb(b.name), label: b.label, caption: b.label, pick: () => void take({ sample: b.name }, 'background') }))
              }
              busy={busy}
              // A pose is no photo of the member's own, so the pose step has no upload tile.
              onFile={posing ? undefined : (files) => void (picker?.role === 'model' ? add(setPerson, 'model') : picker?.role === 'background' ? add(setBackground, 'background') : add(setGarments, 'garment'))(files)}
              onClose={() => setPicker(null)}
              onBack={picker?.of ? () => setPicker({ role: picker.role }) : undefined}
              groups={picker?.role === 'model' && !picker.of ? [...(catalog ? [{ title: 'Người mẫu có sẵn', tiles: stockTiles }] : []), { title: 'Người mẫu AI', tiles: fashionTiles(aiModels, (img) => setPerson([img])) }] : []}
              filter={
                picker?.role === 'model' && !picker.of && catalog ? (
                  // Fash's filters: one row of pill chips ("Gender ▾"), each naming its filter until a value is chosen.
                  <div className="portrait-filter">
                    {PORTRAIT_FILTERS.map((f) => (
                      <Select key={f.key} chip label={f.label} icon="sliders" heading={f.label} value={portraitFilter[f.key] ?? ''} options={[{ value: '', label: f.all, short: f.label }, ...f.options.map(([value, label]) => ({ value, label }))]} onChange={(v) => setPortraitFilter((cur) => ({ ...cur, [f.key]: v || undefined }))} />
                    ))}
                  </div>
                ) : posing ? (
                  // Fash's pose step head: the model beside the question.
                  <div className="pose-head">
                    {poseSrc && (
                      <figure className="pose-model">
                        <img src={poseSrc} alt="" />
                        <figcaption className="photo-caption">Người mẫu của bạn</figcaption>
                      </figure>
                    )}
                    <div>
                      <h3>Người mẫu tạo dáng thế nào?</h3>
                      <p>Chọn một tư thế, người mẫu sẽ đứng đúng tư thế đó trong ảnh. Hoặc chọn Không chọn tư thế, rồi tả tư thế trong ô Mô tả nếu muốn.</p>
                    </div>
                  </div>
                ) : undefined
              }
              mine={picker?.role === 'model' && !picker.of ? { title: 'Người mẫu của tôi', tiles: myModels.map((a) => ({ key: a.id, src: thumbUrl(a.id), label: `Dùng lại ${a.filename}`, pick: () => setPerson([a]) })) } : undefined}
              create={picker?.role === 'model' && !picker.of ? { label: 'Tạo người mẫu riêng cho thương hiệu', onClick: () => setOwn(true) } : undefined}
            />
            )}

            {models && models.length > 0 && <ModelPicker models={pick.options} value={pick.modelId} onChange={pick.setModelId} />}

            <PromptComposer
              id={promptId}
              label="Mô tả"
              optional
              feature="try_on"
              value={prompt}
              onChange={setPrompt}
              maxLength={room}
              onRun={() => (canRun ? void run() : (reason ?? false))}
              placeholder="Ví dụ: người mẫu đứng trong studio sáng, toàn thân"
              ask={chosen ? () => ({ field: 'prompt', feature: 'try_on', text: prompt, ...(room !== undefined && { room }), model: chosen.id }) : null}
            />
            {pose && prompt.trim() && <p className="help">Tư thế đã chọn ở ô Người mẫu sẽ được ưu tiên.</p>}
            <PromptPreview feature="try_on" prompts={[preview]} limit={chosen?.maxPromptChars} system={preview.length - prompt.trim().length} />

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
                ...tryOnPlaces(person, garments, background),
                ...(pose && { pose }),
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
            <FormNotice text={notice} onHistory={narrow ? () => setTab('history') : undefined} />
          </div>
          <div className="runbar">
            <button type="button" className="primary run" disabled={!canRun} aria-describedby={reason ? reasonId : undefined} onClick={() => void run()}>
              Thử đồ
              {busy ? <span className="run-cost">· Đang gửi…</span> : !recall.answered || models === null ? <span className="run-cost">· Đang tải…</span> : pick.estimate !== undefined && <span className="run-cost">· ${pick.estimate}</span>}
            </button>
          </div>
        </div>

        <div className="side" id={`tryon-panel-${panel}`} role="tabpanel" aria-labelledby={`tryon-tab-${panel}`} hidden={narrow && shown === 'create'}>
          <FormContext.Provider
            value={{
              recreate: (from, recipe) => (recall.touch(), recreate(from, recipe), narrow && setTab('create')),
              apply,
              photo: (p, role) => void take(p, role),
              has: (asset) => [...person, ...garments, ...background].some((i) => i.id === asset),
              prompt: (text) => (setPrompt(text), notify('Đã chép mô tả')),
              result: (p) => void take(p, 'model', 'Đã dùng kết quả làm ảnh người mẫu'),
            }}
          >
            {shown === 'examples' ? <Gallery kind="try_on" samples="try-on-example-" cols={[2, 2, 3]} label="Ảnh thử đồ của công ty" emptyText="Chưa có ảnh thử đồ nào trong công ty." /> : shown === 'about' ? <About page="tryOn" /> : <Tray feature="try_on" />}
          </FormContext.Provider>
        </div>
      </div>
    </section>
  );
}
