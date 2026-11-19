'use client';
// One app of the Apps index, driven by its entry in lib/apps.ts: a card with the app's header, upload slots, fields and Run, beside the History and About tabs
// (laid out like Try On). An app that is not built yet shows why instead of the form.
import { FEATURE_PROMPTS, PRODUCT_VIEWS } from '@cvs/core/models';
import Link from 'next/link';
import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { type AppConfig, appInputs, appReason, type AppCategory, DEFAULT_VIEWS, motionReason, runTotal, slotMax, splitImages, stockGroups, VIEW_LABELS, visibleApps } from '@/lib/apps';
import { basePrompt, promptTooLong } from '@/lib/prompt-limit';
import { alignInputs, placesOf, type Skipped, skippedNote } from '@/lib/reuse';
import { confirmRun, sendRun } from '@/lib/run-guard';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { useRecall } from '@/lib/use-recall';
import { useDraftState } from '@/lib/use-draft';
import { cardSample, GALLERY_SAMPLES } from '@/lib/examples';
import { sampleThumb, useSamples } from '@/lib/use-samples';
import { About } from './About';
import { CardMedia, LoopVideo } from './CardMedia';
import { Icon, type IconName } from './Icon';
import { copyError, copySamples, FormNotice, Gallery, type Img, PhotoDialog, RATIO_LABEL, Slot, uploadError, uploadImages, UPLOAD_ERROR, type UploadKind, useImageChoice, useImageModels, useReuse, WorkTabs } from './image-tools';
import { FormContext, useApplier, useJobs } from './jobs';
import { type ModelOption, ModelPicker } from './ModelPicker';
import { PromptComposer } from './PromptComposer';
import { PromptPreview } from './PromptSections';
import { ReferenceVideoSlot } from './ReferenceVideo';
import { Select } from './Select';
import { HistoryArtContext, Tray } from './Shell';
import { useSmartRemakeEnabled } from './SmartRemakeGate';
import { Templates } from './Templates';

export type Tab = 'create' | 'history' | 'examples' | 'about';
export const TAB_LABEL: Record<Tab, string> = { create: 'Tạo', history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };
const CATEGORY_ICON: Record<AppCategory, IconName> = { fashion: 'tryon', photo: 'image', video: 'create', utility: 'library' };

/** The picture of an app on a card and in the page header: its sample loop or still, else a tinted tile with the icon of its category. The loop plays under reduced motion too, as on the reference site's Apps pages. */
export function AppArt({ app, page }: { app: AppConfig; page?: boolean }) {
  const media = cardSample(useSamples(), `app-${app.slug}`);
  const has = Boolean(media.video || media.poster);
  if (page && !has) return null; // on its own page an app with no art shows nothing rather than a bare tile
  return (
    <span className="app-art" data-category={app.category} data-page={page || undefined} aria-hidden="true">
      {has ? <CardMedia {...media} /> : <Icon name={CATEGORY_ICON[app.category]} size={36} />}
    </span>
  );
}

/** Puts the app's art in the empty History of the page below it, in place of the generic picture; an app with no art keeps that picture. */
export function AppHistoryArt({ app, children }: { app: AppConfig; children: ReactNode }) {
  const media = cardSample(useSamples(), `app-${app.slug}`);
  return <HistoryArtContext.Provider value={media.video || media.poster ? <AppArt app={app} page /> : null}>{children}</HistoryArtContext.Provider>;
}

/** The change-app button of the header card and the list of apps it opens. */
function ChangeMenu({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const smartRemake = useSmartRemakeEnabled();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div
      className="app-change"
      ref={root}
      onKeyDown={(e) => e.key === 'Escape' && open && (e.stopPropagation(), setOpen(false), trigger.current?.focus())}
      onBlur={(e) => open && e.relatedTarget instanceof Node && !root.current?.contains(e.relatedTarget) && setOpen(false)} // a click elsewhere is handled below; this is the Tab key
    >
      {/* Short like the live "Change" chip and Create's banner chip; the name says what it changes. */}
      <button ref={trigger} type="button" aria-label="Đổi ứng dụng" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen(!open)}>
        <Icon name="edit" size={12} />
        Đổi
      </button>
      {open && (
        <ul id={listId} className="app-change-list" aria-label="Ứng dụng">
          {visibleApps(smartRemake).map((a) => (
            <li key={a.slug}>
              <Link href={`/apps/${a.slug}`} aria-current={a.slug === current ? 'page' : undefined} onClick={() => setOpen(false)}>
                {a.name}
                {a.soon && <span className="badge-soon">Sắp có</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AppHeader({ app }: { app: AppConfig }) {
  const photo = `app-${app.slug}.jpg`;
  const have = useSamples();
  return (
    <div className="app-head" data-category={app.category} data-photo={have.has(photo) || undefined} style={have.has(photo) ? ({ '--photo': `url(/api/samples/${photo})` } as CSSProperties) : undefined}>
      {have.has(`app-${app.slug}.mp4`) && (
        <span className="head-loop">
          <LoopVideo src={`/api/samples/app-${app.slug}.mp4`} poster={have.has(photo) ? `/api/samples/${photo}` : null} />
        </span>
      )}
      <strong>{app.name}</strong>
      <ChangeMenu current={app.slug} />
    </div>
  );
}

function AppForm({ app, reuse }: { app: AppConfig; reuse?: string }) {
  const { refresh, loading, notify } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const [images, setImages] = useState<Img[][]>(() => app.slots.map(() => []));
  const [prompt, setPrompt, clearDraft] = useDraftState(`app.${app.slug}`, reuse !== undefined);
  const [picker, setPicker] = useState<number | null>(null); // the slot whose stock-photo dialog is open
  const have = useSamples();
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (the form below 1024 px, else About)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [views, setViews] = useState(DEFAULT_VIEWS); // the multi-angle app: one job per view
  const promptId = useId();
  const reasonId = useId();
  const viewsId = useId();
  const { models, failed } = useImageModels(app.feature);
  const count = images.reduce((n, list) => n + list.length, 0);
  const pick = useImageChoice(models, Math.max(1, count));
  const { chosen } = pick;
  // The member's last model and settings, unless a refill opens the page.
  const recall = useRecall(
    app.feature,
    (s) => {
      pick.setModelId(s.modelId);
      if (s.ratio) pick.setRatio(s.ratio);
      if (s.resolution) pick.setResolution(s.resolution);
    },
    { skip: reuse !== undefined },
  );
  const settings = [...(app.ratio ? (['ratio'] as const) : []), ...(app.resolution ? (['resolution'] as const) : [])];
  const apply = useApplier((s) => {
    recall.touch();
    if (s.ratio) pick.setRatio(s.ratio);
    if (s.resolution) pick.setResolution(s.resolution);
  });

  // Reuse: the images back in their slots, in the order they were sent, and the member's own text.
  const recreate = useReuse(
    reuse,
    app.feature,
    (j) => {
      recall.touch();
      // Photos beyond the app's slots have no place on the form; a deleted one leaves its slot empty.
      const slots = j.images ? splitImages(app, alignInputs(j.inputIds, j.images)) : null;
      const placed = slots?.map((s) => s.filter((i) => i !== null));
      if (placed) setImages(placed);
      const extra = j.images && placed ? j.images.length - placed.flat().length : 0;
      setPrompt(j.brief ?? '');
      if (j.view) setViews([j.view]);
      pick.refill({ ...j, ...(extra > 0 && { extra: { count: extra, max: slots!.flat().length } }) });
    },
    (e) => setError(copyError(e, 'Không tìm thấy ảnh để dùng lại.')),
  );
  // The swaps add the member's text to their fixed instruction, so it shares the model's limit with it.
  const fixed = app.prompt === 'optional' ? FEATURE_PROMPTS[app.feature]!.length + 2 : 0;
  const room = chosen && chosen.maxPromptChars - fixed;
  const reason = (recall.answered ? null : 'Đang tải cài đặt đã dùng...') ?? appReason(app, { images, prompt, models: chosen ? [chosen] : models === null ? null : [], failed, views: views.length }) ?? promptTooLong(chosen, prompt.trim() ? prompt.trim().length + fixed : 0);
  const canRun = reason === null && !busy;
  /** What Run sends: the app's fixed instruction, with or replaced by the member's words as POST /api/jobs composes it. */
  const sent = basePrompt(app.feature, appInputs(app, { images, prompt }).prompt);
  // The multi-angle app sends one job per view picked, in the order of PRODUCT_VIEWS; every other app one job without a view.
  const runs: (string | undefined)[] = app.views ? PRODUCT_VIEWS.filter((v) => views.includes(v.id)).map((v) => v.id) : [undefined];
  const estimate = app.views ? runTotal(pick.estimate, runs.length) : pick.estimate;

  function add(slot: number) {
    return async (files: File[]) => {
      if (files.length === 0) return;
      setError('');
      setBusy(true);
      try {
        const assets = await uploadImages(files).finally(loading('Đang tải lên…'));
        setImages((cur) => cur.map((list, i) => (i === slot ? [...list, ...assets] : list)));
      } catch (e) {
        setError(uploadError(e));
      } finally {
        setBusy(false);
      }
    };
  }

  /** A stock photo is copied on the server as the member's own picture, so the job only ever holds the member's own assets. */
  async function pickStock(slot: number, name: string) {
    setError('');
    setBusy(true);
    try {
      const copied = await copySamples([name]);
      setImages((cur) => cur.map((list, i) => (i === slot ? copied : list)));
    } catch (e) {
      setError(copyError(e, UPLOAD_ERROR));
    } finally {
      setBusy(false);
    }
  }
  const stockTiles = (slot: number, names: string[], label: string) => names.map((name, n) => ({ key: name, src: sampleThumb(name), label: `${label} ${n + 1}`, pick: () => void pickStock(slot, name) }));
  const stock = picker === null ? [] : stockGroups(app.slots[picker]!, have);

  async function run() {
    if (!(await confirmRun(estimate))) return;
    setBusy(true);
    setError('');
    setNotice('');
    let done = 0;
    try {
      for (const view of runs) {
        const body = {
          feature: app.feature,
          modelId: pick.modelId,
          ...appInputs(app, { images, prompt }),
          ratio: pick.ratio,
          params: { resolution: pick.resolution, ...(app.prompt && prompt.trim() && { brief: prompt.trim() }), ...(view && { view }) }, // the member's own text, kept for reuse
        };
        // As on Create's angles, the first job stands for the batch: a batch the same as the last one asks before anything is sent.
        if (done > 0) await api('/api/jobs', sendJson('POST', body));
        else if (!(await sendRun(body))) return;
        done++;
      }
      clearDraft();
      setNotice('Đã gửi lượt tạo. Theo dõi trong tab "Lịch sử".');
      if (!narrow) setTab('history');
      await refresh();
    } catch (e) {
      setError(`${errorText(e, 'Không gửi được lượt tạo, hãy thử lại.')}${done > 0 ? ` Đã gửi ${done}/${runs.length} ảnh.` : ''}`);
      if (done > 0) await refresh();
    } finally {
      setBusy(false);
    }
  }

  const samples = GALLERY_SAMPLES[app.feature]; // only the apps an Admin may put examples on have the Examples tab
  const tabs: Tab[] = [...(narrow ? (['create'] as const) : []), 'history', ...(samples ? (['examples'] as const) : []), 'about'];
  const shown: Tab = narrow ? (tab ?? 'create') : tab === 'history' || tab === 'examples' ? tab : 'about';
  const panel = shown === 'create' ? 'about' : shown;
  const two = app.slots.length === 2;

  return (
    <section aria-labelledby="app-title" className="create app-page">
      <h1 id="app-title" className="sr-only">
        {app.name}
      </h1>
      <div className="create-grid">
        <WorkTabs prefix="app" tabs={tabs} labels={TAB_LABEL} shown={shown} onSelect={setTab} />

        <div className="card form-card" id="app-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'app-tab-create' : undefined} hidden={narrow && shown !== 'create'} onPointerDownCapture={recall.touch} onKeyDownCapture={recall.touch}>
          <div className="form-scroll">
            <AppHeader app={app} />
            <div className="app-slots" data-two={two}>
              {app.slots.map((s, i) => (
                <Slot
                  key={s.inputLabel}
                  label={s.label}
                  empty={s.empty}
                  inputLabel={s.inputLabel}
                  images={images[i]!}
                  max={slotMax(app, i, chosen?.maxImages ?? 1)}
                  busy={busy}
                  onAdd={add(i)}
                  onRemove={(id) => setImages((cur) => cur.map((list, j) => (j === i ? list.filter((x) => x.id !== id) : list)))}
                  onBrowse={stockGroups(s, have).length > 0 ? () => setPicker(i) : undefined}
                />
              ))}
            </div>
            <PhotoDialog
              open={picker !== null}
              title={picker === null ? '' : app.slots[picker]!.stock!.title}
              tiles={stock.filter((g) => !g.label).flatMap((g) => stockTiles(picker!, g.names, 'Người mẫu có sẵn'))}
              groups={stock.filter((g) => g.label).map((g) => ({ title: g.label!, tiles: stockTiles(picker!, g.names, g.label!) }))}
              busy={busy}
              onFile={(files) => void add(picker!)(files)}
              onClose={() => setPicker(null)}
            />

            {models && models.length > 1 && <ModelPicker models={pick.options} value={pick.modelId} onChange={pick.setModelId} />}

            {app.views && (
              <div className="field">
                <span id={viewsId} className="field-label">
                  Góc cần tạo
                </span>
                <div className="segmented theme-choice angle-choice" role="group" aria-labelledby={viewsId}>
                  {PRODUCT_VIEWS.map((v) => (
                    <label key={v.id}>
                      <input type="checkbox" checked={views.includes(v.id)} onChange={() => setViews((cur) => (cur.includes(v.id) ? cur.filter((x) => x !== v.id) : [...cur, v.id]))} />
                      {VIEW_LABELS[v.id]}
                    </label>
                  ))}
                </div>
                <p className="help">Mỗi góc tạo một ảnh riêng và tính tiền riêng. Mặt sau và hai bên là AI đoán từ ảnh mặt trước; nếu có ảnh thật thì dùng ảnh thật.</p>
                {runs.length > 0 && pick.estimate !== undefined && (
                  <p className="help" role="status">
                    {runs.length} ảnh × ${pick.estimate} = ${estimate}
                  </p>
                )}
              </div>
            )}

            {app.prompt && (
              <PromptComposer
                id={promptId}
                label={app.prompt === 'background' ? 'Mô tả nền' : 'Mô tả'}
                optional
                feature={app.feature}
                value={prompt}
                onChange={setPrompt}
                maxLength={room}
                onRun={() => canRun && void run()}
                placeholder={app.prompt === 'background' ? 'Ví dụ: quán cà phê ngoài trời đầy nắng, bàn đá cẩm thạch' : 'Mô tả điều bạn muốn thêm...'}
                ask={chosen ? () => ({ field: 'prompt', feature: app.feature, text: prompt, ...(room !== undefined && { room }), model: chosen.id }) : null}
              />
            )}
            {sent && <PromptPreview feature={app.feature} prompts={[sent]} limit={chosen?.maxPromptChars} />}

            {chosen && app.ratio && <Select label="Tỉ lệ" icon="ratio" heading="Chọn tỉ lệ" value={pick.ratio} options={chosen.ratios.map((r) => ({ value: r, label: RATIO_LABEL[r] ?? r }))} onChange={pick.setRatio} />}
            {chosen && app.resolution && <Select label="Độ phân giải" icon="preset" heading="Chọn độ phân giải" value={pick.resolution} options={chosen.resolutions.map((r) => ({ value: r, label: r }))} onChange={pick.setResolution} />}
            <Templates
              feature={app.feature}
              data={() => ({ images: placesOf(images, app.slots), brief: prompt.trim(), ratio: pick.ratio, resolution: pick.resolution, modelId: pick.modelId })}
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
              Chạy
              {busy ? <span className="run-cost">· Đang gửi…</span> : estimate !== undefined && <span className="run-cost">· ${estimate}</span>}
            </button>
          </div>
        </div>

        <div className="side" id={`app-panel-${panel}`} role="tabpanel" aria-labelledby={`app-tab-${panel}`} hidden={narrow && shown === 'create'}>
          <FormContext.Provider
            value={{
              recreate: (from, recipe) => (recall.touch(), recreate(from, recipe), narrow && setTab('create')),
              // As on Try On, a card's chips and words go on the form; only the settings this app has.
              ...(settings.length > 0 && { apply, settings }),
              ...(app.prompt && { prompt: (text: string) => (setPrompt(text), notify('Đã chép mô tả')) }),
            }}
          >
            {shown === 'history' ? (
              <Tray feature={app.feature} />
            ) : shown === 'examples' ? (
              <Gallery kind={app.feature} samples={samples} cols={[2, 2, 3]} label={`Ảnh ${app.name.toLowerCase()} của công ty`} emptyText={`Chưa có ảnh ${app.name.toLowerCase()} nào trong công ty.`} />
            ) : (
              <AppAbout app={app} />
            )}
          </FormContext.Provider>
        </div>
      </div>
    </section>
  );
}

/** The page of an app that is not built yet. */
function Soon({ app, text }: { app: AppConfig; text: string }) {
  return (
    <section aria-labelledby="app-title" className="apps">
      <h1 id="app-title">{app.name}</h1>
      <div className="soon">
        <AppArt app={app} />
        <p>
          <span className="badge-soon">Sắp có</span>
        </p>
        <p>{text}</p>
        <Link href="/apps" className="button">
          Xem các ứng dụng khác
        </Link>
      </div>
    </section>
  );
}

export function AppPage({ app, reuse }: { app: AppConfig; reuse?: string }) {
  if (app.soon) return <Soon app={app} text={app.soon} />;
  return <AppHistoryArt app={app}>{app.feature === 'motion_control' ? <MotionForm app={app} reuse={reuse} /> : <AppForm app={app} reuse={reuse} />}</AppHistoryArt>;
}

/** An uploaded reference video and its length. */
interface RefVideo {
  id: string;
  filename: string;
  durationMs: number;
}
const ORIENTATIONS = [
  { id: 'video', label: 'Theo video (tối đa 30 giây)' },
  { id: 'image', label: 'Theo ảnh (tối đa 10 giây)' },
] as const;
type MotionModel = ModelOption & { durationsSec: number[]; maxPromptChars: number };
type Uploaded = Img & { durationMs: number | null };

/** Motion Control: a character image and a reference video, a model of the feature, an optional prompt. The cost follows the video's length. */
function MotionForm({ app, reuse }: { app: AppConfig; reuse?: string }) {
  const { refresh, loading } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const [image, setImage] = useState<Img[]>([]);
  const [video, setVideo] = useState<RefVideo | null>(null);
  const [prompt, setPrompt, clearDraft] = useDraftState(`app.${app.slug}`, reuse !== undefined);
  const [tab, setTab] = useState<Tab | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [list, setList] = useState<{ models: MotionModel[]; best: string | null; failed: boolean } | null>(null);
  const [modelId, setModelId] = useState('');
  /** What a refill left out (told under the form until the member picks a model): the lost photos, the extra ones and the job's model. */
  const [left, setLeft] = useState<{ modelId: string | null; modelLabel: string | null; lost: number; extra?: Skipped['extra']; kept: number } | null>(null);
  const [orientation, setOrientation] = useState<'video' | 'image'>('video');
  const recall = useRecall(app.feature, (s) => setModelId(s.modelId), { skip: reuse !== undefined }); // the member's last model, unless a refill comes
  const promptId = useId();
  const reasonId = useId();
  const orientationName = useId();
  // The estimate is per second of the video, so the list is asked again for its length (5 s until a video is chosen).
  const seconds = video ? Math.ceil(video.durationMs / 1000) : 5;
  useEffect(() => {
    api<{ models: MotionModel[]; defaultModelId: string | null }>(`/api/models?feature=motion_control&ratio=auto&durationSec=${seconds}`).then(
      (r) => setList({ models: r.models, best: r.defaultModelId, failed: false }),
      () => setList({ models: [], best: null, failed: true }),
    );
  }, [seconds]);
  // Reuse: the character image, the reference video, the member's own prompt and the model.
  const recreate = useReuse(
    reuse,
    app.feature,
    (j) => {
      recall.touch();
      if (j.images) {
        const inputs = j.images as (Img & { mime?: string; durationMs?: number | null })[];
        const ref = inputs.find((i) => i.mime?.startsWith('video/'));
        const pictures = inputs.filter((i) => i !== ref);
        setImage(pictures.slice(0, 1));
        setVideo(ref ? { id: ref.id, filename: ref.filename, durationMs: ref.durationMs ?? 0 } : null);
        // Pictures beyond the one character image have no place on the form.
        const extra = Math.max(0, pictures.length - 1);
        setLeft({ modelId: j.modelId, modelLabel: j.modelLabel ?? null, lost: j.lost ?? 0, extra: extra > 0 ? { count: extra, max: 1 } : undefined, kept: inputs.length - extra });
      }
      setPrompt(j.prompt ?? '');
      if (j.modelId) setModelId(j.modelId);
      setOrientation(j.orientation === 'image' ? 'image' : 'video');
    },
    (e) => setError(copyError(e, 'Không tìm thấy video để dùng lại.')),
  );
  const chosen = list?.models.find((m) => m.id === modelId) ?? list?.models.find((m) => m.id === list.best) ?? list?.models[0];
  const leftNote = left && list && chosen ? skippedNote(left.kept, { lost: left.lost, extra: left.extra, ...(left.modelId && !list.models.some((m) => m.id === left.modelId) && { model: { label: left.modelLabel, instead: chosen.label } }) }) : '';
  const reason = (recall.answered ? null : 'Đang tải cài đặt đã dùng...') ?? motionReason({ image: image.length > 0, videoMs: video?.durationMs ?? null, model: list === null ? null : chosen, failed: list?.failed ?? false, orientation }) ?? promptTooLong(chosen, prompt.trim().length);
  const canRun = reason === null && !busy;

  async function upload(files: File[], then: (assets: Uploaded[]) => void, kind: UploadKind) {
    if (files.length === 0) return;
    setError('');
    setBusy(true);
    try {
      then((await uploadImages(files, kind).finally(loading('Đang tải lên…'))) as Uploaded[]);
    } catch (e) {
      setError(uploadError(e, kind));
    } finally {
      setBusy(false);
    }
  }

  // A History clip is copied as the member's own input, as Marketing Advanced's reference video is.
  async function copyVideo(assetId: string) {
    setError('');
    setBusy(true);
    try {
      const [v] = (await api<{ assets: RefVideo[] }>('/api/assets/copy', sendJson('POST', { assetId }))).assets;
      if (v) setVideo({ id: v.id, filename: v.filename, durationMs: v.durationMs });
    } catch (e) {
      setError(copyError(e, 'Không dùng được video này.'));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!(await confirmRun(chosen?.estimateUsd))) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const written = prompt.trim();
      const body = { feature: app.feature, modelId: chosen!.id, assetIds: [image[0]!.id, video!.id], ratio: 'auto', params: { orientation }, ...(written && { prompt: written }) };
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

  const tabs: Tab[] = narrow ? ['create', 'history', 'about'] : ['history', 'about'];
  const shown: Tab = narrow ? (tab ?? 'create') : tab === 'history' ? 'history' : 'about';
  const panel = shown === 'create' ? 'about' : shown;

  return (
    <section aria-labelledby="app-title" className="create app-page">
      <h1 id="app-title" className="sr-only">
        {app.name}
      </h1>
      <div className="create-grid">
        <WorkTabs prefix="app" tabs={tabs} labels={TAB_LABEL} shown={shown} onSelect={setTab} />

        <div className="card form-card" id="app-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'app-tab-create' : undefined} hidden={narrow && shown !== 'create'} onPointerDownCapture={recall.touch} onKeyDownCapture={recall.touch}>
          <div className="form-scroll">
            <AppHeader app={app} />
            <div className="app-slots" data-two>
              <Slot
                label="Nhân vật"
                empty="Thêm 1 ảnh thấy rõ từ đầu tới hông của người sẽ làm động tác"
                inputLabel="Ảnh nhân vật"
                images={image}
                max={1}
                busy={busy}
                onAdd={(files) => void upload(files, setImage, 'image')}
                onRemove={() => setImage([])}
              />
              <ReferenceVideoSlot
                label="Video chuyển động"
                optional={false}
                fileLabel="Tệp video chuyển động"
                hint="Thêm 1 video MP4 hoặc MOV thấy rõ nửa thân trên, 3 đến 30 giây chuyển động liên tục, tối đa 20 MB"
                video={video}
                busy={busy}
                onFile={(file) => void upload([file], ([v]) => v && setVideo({ id: v.id, filename: v.filename, durationMs: v.durationMs ?? 0 }), 'video')}
                onHistory={(id) => void copyVideo(id)}
                onRemove={() => setVideo(null)}
              />
            </div>
            <p className="help">Ảnh JPEG, PNG hoặc WebP; video MP4 hoặc MOV. Chỉ tải lên ảnh và video mà công ty có quyền sử dụng.</p>

            <div className="field">
              <span className="field-label" id={`${orientationName}-label`}>Hướng nhân vật</span>
              <div className="segmented theme-choice orientation-choice" role="radiogroup" aria-labelledby={`${orientationName}-label`}>
                {ORIENTATIONS.map((o) => (
                  <label key={o.id}>
                    <input type="radio" name={orientationName} value={o.id} checked={orientation === o.id} onChange={() => setOrientation(o.id)} />
                    {o.label}
                  </label>
                ))}
              </div>
              {orientation === 'image' && <p className="help">Giữ hướng nhân vật như trong ảnh; chuyển động vẫn theo video.</p>}
            </div>

            {list && list.models.length > 1 && <ModelPicker models={list.models} value={chosen?.id ?? ''} onChange={(id) => (setLeft(null), setModelId(id))} />}

            <PromptComposer
              id={promptId}
              label="Mô tả"
              optional
              feature={app.feature}
              value={prompt}
              onChange={setPrompt}
              maxLength={chosen?.maxPromptChars}
              onRun={() => canRun && void run()}
              placeholder="Ví dụ: sân khấu ánh đèn ấm, nhân vật mặc nguyên bộ đồ trong ảnh"
              ask={chosen ? () => ({ field: 'prompt', feature: app.feature, text: prompt, room: chosen.maxPromptChars, model: chosen.id }) : null}
            />
            <Templates feature={app.feature} data={() => ({ images: [...image, ...(video ? [video] : [])].map((i) => i.id), prompt: prompt.trim(), modelId: chosen?.id, orientation })} />
          </div>

          <div className="form-message">
            {reason && (
              <p id={reasonId} className="help" role="status">
                {reason}
              </p>
            )}
            {leftNote && <p className="help" role="status">{leftNote}</p>}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <FormNotice text={notice} onHistory={narrow ? () => setTab('history') : undefined} />
          </div>
          <div className="runbar">
            <button type="button" className="primary run" disabled={!canRun} aria-describedby={reason ? reasonId : undefined} onClick={() => void run()}>
              Chạy
              {busy ? <span className="run-cost">· Đang gửi…</span> : video && chosen && <span className="run-cost">· ${chosen.estimateUsd}</span>}
            </button>
          </div>
        </div>

        <div className="side" id={`app-panel-${panel}`} role="tabpanel" aria-labelledby={`app-tab-${panel}`} hidden={narrow && shown === 'create'}>
          <FormContext.Provider value={{ recreate: (from) => (recall.touch(), recreate(from), narrow && setTab('create')) }}>
            {shown === 'history' ? <Tray feature={app.feature} /> : <AppAbout app={app} />}
          </FormContext.Provider>
        </div>
      </div>
    </section>
  );
}

export function AppAbout({ app }: { app: AppConfig }) {
  return (
    <>
      <AppArt app={app} page />
      <About app={app.slug} long />
    </>
  );
}
