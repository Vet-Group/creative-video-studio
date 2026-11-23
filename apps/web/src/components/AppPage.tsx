'use client';
// One app of the Apps index, driven by its entry in lib/apps.ts: a card with the app's header, upload slots, fields and Run, beside the History and About tabs
// (laid out like Try On). An app that is not built yet shows why instead of the form.
import { FEATURE_PROMPTS, PRODUCT_VIEWS } from '@cvs/core/models';
import Link from 'next/link';
import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { type AppConfig, appInputs, appReason, jobImages, type AppCategory, BATCH_FEATURES, type BatchItem, cleanName, colorLabel, DEFAULT_VIEWS, DOG_BREEDS, itemLabel, itemPrompt, LISTING_SHOTS, MAX_BATCH, MAX_NAME, MAX_PICTURES, MAX_POSE_TEXT, MAX_POSES, MOCKUP_PRODUCTS, motionReason, OWN_POSE, parseHexColor, parseNames, PET_STYLES, POSE_BACKGROUNDS, POSE_PHOTOS, RECOLOR_COLORS, runTotal, slotMax, splitImages, stockGroups, unsentPicks, VIEW_LABELS, visibleApps } from '@/lib/apps';
import { waitLabel } from '@/lib/explore';
import { parseFashionTraits } from '@/lib/fashion-model';
import { usable } from '@/lib/fashion-models';
import { basePrompt, promptTooLong } from '@/lib/prompt-limit';
import { alignInputs, placesOf, type Skipped, skippedNote } from '@/lib/reuse';
import { confirmRun, sendRun, usd } from '@/lib/run-guard';
import { portraitGender, POSE_PRESETS, POSES } from '@/lib/try-on-stock';
import { useFashionModels } from '@/lib/use-fashion-models';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { useRecall } from '@/lib/use-recall';
import { useDraftState } from '@/lib/use-draft';
import { cardSample, GALLERY_SAMPLES } from '@/lib/examples';
import { sampleThumb, samplesPending, useSamples } from '@/lib/use-samples';
import { About } from './About';
import { CardMedia, LoopVideo } from './CardMedia';
import { CsvNames } from './CsvNames';
import { Icon, type IconName } from './Icon';
import { copyError, copySamples, fashionTiles, FormNotice, Gallery, type Img, PhotoDialog, photoImg, RATIO_LABEL, Slot, uploadError, uploadImages, UPLOAD_ERROR, type UploadKind, useImageChoice, useImageModels, useReuse, WorkTabs } from './image-tools';
import { FormContext, type Photo, useApplier, useJobs } from './jobs';
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
/** Under the prompt preview of an app that writes one prompt per item: what the other items' prompts change. */
const REST_NOTE: Record<string, string> = {
  breed_swap: 'giống còn lại dùng prompt như trên, chỉ khác tên giống.',
  pet_portrait: 'phong cách còn lại dùng prompt như trên, chỉ khác phần mô tả phong cách.',
  mockup_pack: 'sản phẩm còn lại dùng prompt như trên, chỉ khác phần mô tả sản phẩm.',
  name_swap: 'ảnh còn lại dùng prompt như trên, chỉ khác tên (và giống chó).',
  pose_generator: 'tư thế còn lại dùng prompt như trên, chỉ khác phần mô tả tư thế.',
  product_recolor: 'màu còn lại dùng prompt như trên, chỉ khác tên và mã màu.',
  listing_set: 'cảnh còn lại dùng prompt như trên, chỉ khác phần mô tả cảnh.',
};

/** A batch app's items to pick (the pet portrait's styles, the mockup pack's products, the recolor's colours, the listing set's shots) as a row of checkbox chips, as the views and breeds are;
 * `children` add the help and the price under them. */
function ItemChecks({ label, items, picked, onChange, single, children }: { label: string; items: { id: string; label: ReactNode }[]; picked: string[]; onChange: (ids: string[]) => void; single?: boolean; children?: ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <span id={id} className="field-label">
        {label}
      </span>
      <div className="segmented theme-choice angle-choice" role="group" aria-labelledby={id}>
        {items.map((it) => (
          <label key={it.id}>
            <input type="checkbox" checked={picked.includes(it.id)} onChange={() => onChange(picked.includes(it.id) ? picked.filter((x) => x !== it.id) : single ? [it.id] : [...picked, it.id])} />
            {it.label}
          </label>
        ))}
      </div>
      {children}
    </div>
  );
}

/** The picture of an app on a card and in the page header: its sample loop or still, else a tinted tile with the icon of its category. The loop plays under reduced motion too, as on the reference site's Apps pages. */
export function AppArt({ app, page }: { app: AppConfig; page?: boolean }) {
  const media = cardSample(useSamples(), `app-${app.slug}`);
  const has = Boolean(media.video || media.poster);
  // On its own page an app with no art shows nothing rather than a bare tile; while the sample list loads, the empty box keeps the art's place, so the About text below does not jump down when the art arrives.
  if (page && !has && !samplesPending()) return null;
  return (
    <span className="app-art" data-category={app.category} data-page={page || undefined} aria-hidden="true">
      {has ? <CardMedia {...media} /> : !page && <Icon name={CATEGORY_ICON[app.category]} size={36} />}
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
  const narrow = useMediaQuery(NARROW);
  return (
    <>
      <div className="app-head" data-category={app.category} data-photo={have.has(photo) || undefined} style={have.has(photo) ? ({ '--photo': `url(/api/samples/${photo})` } as CSSProperties) : undefined}>
        {have.has(`app-${app.slug}.mp4`) && (
          <span className="head-loop">
            <LoopVideo src={`/api/samples/app-${app.slug}.mp4`} poster={have.has(photo) ? `/api/samples/${photo}` : null} />
          </span>
        )}
        <strong>{app.name}</strong>
        <ChangeMenu current={app.slug} />
      </div>
      {/* On a phone the About tab is not beside the form, so the form says in one line what the app does. */}
      {narrow && <p className="help app-lede">{app.description}</p>}
    </>
  );
}

function AppForm({ app, reuse, image }: { app: AppConfig; reuse?: string; image?: Img }) {
  const { refresh, loading, notify } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const [images, setImages] = useState<Img[][]>(() => app.slots.map((_, n) => (n === 0 && image ? [image] : []))); // `image`: a photo the page opened with (?image=)
  const [prompt, setPrompt, clearDraft] = useDraftState(`app.${app.slug}`, reuse !== undefined);
  const [picker, setPicker] = useState<number | null>(null); // the slot whose stock-photo dialog is open
  const have = useSamples();
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (the form below 1024 px, else About)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [views, setViews] = useState(DEFAULT_VIEWS); // the multi-angle app: one job per view
  const [breeds, setBreeds] = useState<string[]>([]); // the breed swap app: one job per breed, none until the member picks (each costs a job); optional on name swap
  const [styles, setStyles] = useState<string[]>([]); // the pet portrait app: one job per style, none until picked
  const [products, setProducts] = useState<string[]>([]); // the mockup pack: one job per product, none until picked
  const [names, setNames] = useState(''); // the name swap app's box: one job per name (or per name and breed)
  const [poses, setPoses] = useState<string[]>([]); // the pose generator: one job per pose, none until picked
  const [poseText, setPoseText] = useState(''); // its own words for one more pose, a job of their own
  const [poseRefs, setPoseRefs] = useState<Img[]>([]); // pictures of someone in the wanted pose, each one more pose and a job of its own (the person's photo is the first image of the job, the picture the second)
  const [background, setBackground] = useState('keep'); // the pose generator's background: the photo's own, a white studio or one lifestyle scene (POSE_BACKGROUNDS)
  const [poseGender, setPoseGender] = useState<'woman' | 'man' | null>(null); // the pose pictures' gender the member chose, else the photo's
  const [colors, setColors] = useState<string[]>([]); // product recolor: one job per colour (#RRGGBB, a swatch's or the member's own), none until picked
  const [hexText, setHexText] = useState(''); // its box for one more colour of the member's own
  const [hexProblem, setHexProblem] = useState('');
  const [shots, setShots] = useState<string[]>([]); // the listing set: one job per shot, none until picked
  const promptId = useId();
  const reasonId = useId();
  const viewsId = useId();
  const breedsId = useId();
  const namesId = useId();
  const namesHelpId = useId();
  const namesErrorId = useId();
  const posesId = useId();
  const poseTextId = useId();
  const genderName = useId();
  const backgroundName = useId();
  const backgroundId = useId();
  const presetHelpId = useId();
  const hexId = useId();
  const hexErrorId = useId();
  const { models, failed } = useImageModels(app.feature);
  const count = jobImages(app, images) + (poseRefs.length > 0 ? 1 : 0); // a pose photo job sends the person and the picture
  const pick = useImageChoice(models, Math.max(1, count));
  const { chosen } = pick;
  // The saved AI models a slot offers (the pose generator's model photo), as Try On's model picker does.
  const aiModels = usable(useFashionModels(app.slots.some((s) => s.aiModels)).models ?? []);
  // The pose pictures' gender: the member's choice, else the photo's (a catalog portrait's, a saved AI model's), else the first one with pictures, as Try On's pose step.
  const pictured = (g: 'woman' | 'man') => POSES.some((p) => have.has(`try-on-pose-${g}-${p.value}.jpg`));
  const person = images[0]?.[0];
  const aiGender = parseFashionTraits(aiModels.find((m) => m.assetId === person?.id)?.traits)?.gender;
  const gender = poseGender ?? portraitGender(person?.filename ?? '') ?? (aiGender === 'male' ? 'man' : aiGender === 'female' ? 'woman' : null) ?? (pictured('woman') ? 'woman' : 'man');
  const ownPose = cleanName(poseText.replace(/\p{Cc}/gu, ' ')); // the box's words as a job takes them: control characters (pasted) as spaces, trimmed, one space between words
  const posesPicked = poses.length + (ownPose ? 1 : 0) + poseRefs.length;
  const poseRoom = MAX_POSES - poses.length - (ownPose ? 1 : 0); // how many pose photos the picked tiles and own words leave room for, those already added included
  const togglePose = (v: string) => (poses.includes(v) ? setPoses(poses.filter((x) => x !== v)) : posesPicked >= MAX_POSES ? notify(`Tối đa ${MAX_POSES} tư thế mỗi lần chạy`) : setPoses([...poses, v]));
  // A colour past the Run's MAX_PICTURES is refused, as a fifth pose is; the member's own colour is added (picked) by its box, and unticking it takes it off the list.
  const pickColors = (next: string[]) => (next.length > MAX_PICTURES ? notify(`Tối đa ${MAX_PICTURES} màu mỗi lần chạy`) : setColors(next));
  const addHex = () => {
    const hex = parseHexColor(hexText);
    if (!hex) return setHexProblem('Nhập mã màu dạng #RRGGBB, ví dụ #2E8B57.');
    setHexProblem('');
    if (!colors.includes(hex) && colors.length >= MAX_PICTURES) return notify(`Tối đa ${MAX_PICTURES} màu mỗi lần chạy`);
    if (!colors.includes(hex)) setColors([...colors, hex]);
    setHexText('');
  };
  // A marketplace preset's poses; the own words and each pose photo take one of the Run's slots, so only the first of the preset that are left are used.
  const presetPoses = (pr: (typeof POSE_PRESETS)[number]) => pr.poses.slice(0, MAX_POSES - (ownPose ? 1 : 0) - poseRefs.length);
  const presetOn = (pr: (typeof POSE_PRESETS)[number]) => presetPoses(pr).length > 0 && background === pr.background && poses.length === presetPoses(pr).length && presetPoses(pr).every((v) => poses.includes(v));
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
      // A pose-photo job's second input is its pose photo: it goes back in its own box below, so it is no extra photo.
      const extra = j.images && placed ? j.images.length - placed.flat().length - (j.poseRef && j.images.some((i) => i.id === j.poseRef) ? 1 : 0) : 0;
      setPrompt(j.brief ?? '');
      // A batch app's job brings back every item of its Run, so the member changes one thing and runs the batch again (another member's job, only its own).
      const items: BatchItem[] = j.batchItems ?? [j];
      const all = (k: keyof BatchItem) => [...new Set(items.map((i) => i[k]).filter((v): v is string => !!v))];
      if (j.view) setViews(all('view'));
      if (j.breed || j.name) setBreeds(all('breed'));
      if (j.style) setStyles(all('style'));
      if (j.product) setProducts(all('product'));
      if (j.name) setNames(all('name').join('\n'));
      // The Run's pose photos that still exist, in the order sent; one that was deleted is lost like any other input (the job's own is already counted in `j.lost`).
      const refs = all('poseRef');
      const found = refs.flatMap((id) => [...(j.poseImages ?? []), ...(j.images ?? [])].find((i) => i.id === id) ?? []);
      const gone = refs.length - found.length - (j.poseRef && !found.some((i) => i.id === j.poseRef) ? 1 : 0);
      if (j.pose || j.poseText || j.poseRef) {
        setPoses(all('pose'));
        setPoseText(all('poseText')[0] ?? '');
        setPoseRefs(found);
        setBackground(j.background ?? 'keep');
      }
      if (j.color) setColors(all('color'));
      if (j.shot) setShots(all('shot'));
      pick.refill({ ...j, lost: (j.lost ?? 0) + gone, ...(extra > 0 && { extra: { count: extra, max: slots!.flat().length } }) });
    },
    (e) => setError(copyError(e, 'Không tìm thấy ảnh để dùng lại.')),
  );
  // The swaps add the member's text to their fixed instruction, so it shares the model's limit with it.
  const fixed = app.prompt === 'optional' ? FEATURE_PROMPTS[app.feature]!.length + 2 : 0;
  const room = chosen && chosen.maxPromptChars - fixed;
  // Background Changer: a reference photo stands in for the description, whose box is off meanwhile; its words stay in the box's state but are not used.
  const reference = app.prompt === 'background' && images[1]!.length > 0;
  const used = reference ? '' : prompt;
  const reason = (recall.answered ? null : 'Đang tải cài đặt đã dùng...') ?? appReason(app, { images, prompt: used, models: chosen ? [chosen] : models === null ? null : [], failed, views: views.length, breeds: breeds.length, styles: styles.length, products: products.length, names, poses: posesPicked, colors: colors.length, shots: shots.length, poseRefs: poseRefs.length }) ?? (poseRefs.some((r) => r.id === person?.id) ? `${POSE_PHOTOS} không được trùng ảnh người mẫu: bỏ một trong hai.` : null) ?? promptTooLong(chosen, used.trim() ? used.trim().length + fixed : 0);
  const canRun = reason === null && !busy;
  /** What Run sends: the app's fixed instruction, with or replaced by the member's words as POST /api/jobs composes it. */
  const sent = basePrompt(app.feature, appInputs(app, { images, prompt: used }).prompt);
  const blank = app.products === true && images[1]!.length > 0; // the mockup pack's own blank product photo
  // The blank is one product: with several ticked, the first in the list stays and the rest are unticked (the notice by the chips says so).
  useEffect(() => {
    if (blank && products.length > 1) setProducts(MOCKUP_PRODUCTS.filter((p) => products.includes(p.id)).slice(0, 1).map((p) => p.id));
  }, [blank, products]);
  const pickedBreeds = DOG_BREEDS.filter((b) => breeds.includes(b));
  // A batch app sends one job per item picked, in the order of its list (PRODUCT_VIEWS, DOG_BREEDS, PET_STYLES, MOCKUP_PRODUCTS), and the name swap app one per name, or per name and breed,
  // each with the prompt its item makes (itemPrompt) but the multi-angle app's; every other app one job with none.
  const runs: BatchItem[] = app.views
    ? PRODUCT_VIEWS.filter((v) => views.includes(v.id)).map((v) => ({ view: v.id }))
    : app.breeds
      ? pickedBreeds.map((breed) => ({ breed }))
      : app.styles
        ? PET_STYLES.filter((s) => styles.includes(s.id)).map((s) => ({ style: s.id }))
        : app.products
          ? MOCKUP_PRODUCTS.filter((p) => products.includes(p.id)).map((p) => ({ product: p.id }))
          : app.names
            ? parseNames(names).names.flatMap((name) => (pickedBreeds.length > 0 ? pickedBreeds.map((breed) => ({ name, breed })) : [{ name }]))
            : app.poses
              ? [...POSES.filter((p) => poses.includes(p.value)).map((p) => ({ pose: p.value, background })), ...(ownPose ? [{ poseText: ownPose, background }] : []), ...poseRefs.map((r) => ({ poseRef: r.id, background }))]
              : app.colors
                ? colors.map((color) => ({ color })) // in the order picked
                : app.shots
                  ? LISTING_SHOTS.filter((s) => shots.includes(s.id)).map((s) => ({ shot: s.id }))
                  : app.bulk
                    ? images[0]!.map(() => ({})) // one job per photo of the first slot
                    : [{}];
  // A bulk app with one photo runs as before: one job, no batch.
  const batchApp = BATCH_FEATURES.includes(app.feature) && !(app.bulk && runs.length < 2);
  // What is wrong with the typed names, said under the box; an empty box only waits, as the reason under Run says.
  const namesProblem = app.names && names.trim() ? parseNames(names).problem : null;
  // Nothing picked yet on a batch app, or names it cannot run, show no price rather than a free-looking $0.00 or one that counts the bad names.
  const priced = runs.length > 0 && !namesProblem;
  const estimate = batchApp ? (priced ? runTotal(pick.estimate, runs.length) : undefined) : pick.estimate;
  // The item prompts differ only in their item, so the preview shows the first one.
  const first = runs[0] && itemPrompt(app.feature, runs[0], blank);
  const prompts = first ? [first] : sent ? [sent] : [];
  const runCost = priced && pick.estimate !== undefined && (
    <p className="help" role="status">
      {runs.length} ảnh × {usd(pick.estimate)} = {usd(estimate!)}
    </p>
  );

  /** The files of an upload box, uploaded and handed to `put`. */
  function upload(put: (assets: Img[]) => void) {
    return async (files: File[]) => {
      if (files.length === 0) return;
      setError('');
      setBusy(true);
      try {
        put(await uploadImages(files).finally(loading('Đang tải lên…')));
      } catch (e) {
        setError(uploadError(e));
      } finally {
        setBusy(false);
      }
    };
  }

  const add = (slot: number) => upload((assets) => setImages((cur) => cur.map((list, i) => (i === slot ? [...list, ...assets] : list))));
  const addPoseRefs = upload((assets) => setPoseRefs((cur) => [...cur, ...assets]));

  /** History's Dùng kết quả: the result, copied as the member's own input, in the last required slot (the picture the app works on: the swaps' target,
   * the try-ons' wearer, a one-slot app's photo), so it goes through this app again. */
  async function takeResult(p: Photo) {
    const into = app.slots.map((s) => !s.optional).lastIndexOf(true);
    setError('');
    try {
      const img = await photoImg(p).finally(loading('Đang tải ảnh...'));
      // A one-photo slot, or a bulk slot holding one photo at most, takes the result in place; a bulk slot with a batch waiting adds it, up to its max.
      setImages((cur) =>
        cur.map((list, i) => {
          if (i !== into) return list;
          const max = slotMax(app, i, chosen?.maxImages ?? 1);
          return max === 1 || (app.bulk && list.length <= 1) ? [img] : app.bulk && list.length >= max ? list : [...list, img];
        }),
      );
      notify(`Đã dùng kết quả cho ô ${app.slots[into]!.label}`);
      if (narrow) setTab('create');
    } catch (e) {
      setError(copyError(e, UPLOAD_ERROR));
    }
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
    if (!(await confirmRun(estimate, `Tạo lượt này với giá ${usd(estimate ?? 0)}?`))) return; // the price as the button shows it
    setBusy(true);
    setError('');
    setNotice('');
    let done = 0;
    const batch = batchApp ? crypto.randomUUID() : undefined; // one id on every job of this Run, by which History's Reuse and "Chọn cả lô" find it again
    try {
      for (const [n, one] of runs.entries()) {
        const own = itemPrompt(app.feature, one, blank);
        const inputs = appInputs(app, { images: app.bulk ? images.map((list, i) => (i === 0 ? [list[n]!] : list)) : images, prompt: used });
        const body = {
          feature: app.feature,
          modelId: pick.modelId,
          ...inputs,
          ...(one.poseRef && { assetIds: [...inputs.assetIds, one.poseRef] }), // the pose photo goes second
          ...(own && { prompt: own }),
          ratio: pick.ratio,
          params: { resolution: pick.resolution, ...(app.prompt && used.trim() && { brief: used.trim() }), ...one, ...(batch && { batch }) }, // the member's own text, kept for reuse
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
      let sent = '';
      if (done > 0 && app.bulk) {
        // The photos sent leave the slot, by id (one may have been removed meanwhile), so Run again sends only the rest.
        const gone = new Set(images[0]!.slice(0, done).map((x) => x.id));
        setImages((cur) => cur.map((list, i) => (i === 0 ? list.filter((x) => !gone.has(x.id)) : list)));
        sent = ` Đã gửi ${done}/${runs.length} ảnh và bỏ các ảnh đã gửi khỏi ô Ảnh.`;
      } else if (done > 0) {
        // What was sent is unticked, so Run again sends only the rest instead of every item a second time.
        const p = unsentPicks(runs, done);
        if (app.views) setViews(p.view);
        if (app.breeds || app.names) setBreeds(p.breed);
        if (app.styles) setStyles(p.style);
        if (app.products) setProducts(p.product);
        if (app.names) setNames(p.name.join('\n'));
        if (app.poses) {
          setPoses(p.pose);
          setPoseText(p.poseText[0] ?? '');
          setPoseRefs((cur) => cur.filter((r) => p.poseRef.includes(r.id)));
        }
        if (app.colors) setColors(p.color);
        if (app.shots) setShots(p.shot);
        sent = ` Đã gửi ${done}/${runs.length} ảnh và bỏ chọn các mục đã gửi.${p.left.length > 0 ? ` Chưa gửi: ${p.left.map(itemLabel).join(', ')}.` : ''}`;
      }
      setError(`${errorText(e, 'Không gửi được lượt tạo, hãy thử lại.')}${sent}`);
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
              {app.slots.map((s, i) => {
                const max = slotMax(app, i, chosen?.maxImages ?? 1);
                const templates = stockGroups(s, have).length > 0;
                const offersModels = s.aiModels && aiModels.length > 0;
                return (
                  <Slot
                    key={s.inputLabel}
                    label={s.label}
                    // A slot whose tile opens stock photos says so, as it looks like any other upload tile.
                    empty={templates ? `${s.empty}, hoặc ${s.stock!.title.toLowerCase()} có sẵn` : s.empty}
                    inputLabel={s.inputLabel}
                    images={images[i]!}
                    max={max}
                    count={s.many || (app.bulk && i === 0)}
                    one={app.bulk && i === 0}
                    busy={busy}
                    onAdd={add(i)}
                    onRemove={(id) => setImages((cur) => cur.map((list, j) => (j === i ? list.filter((x) => x.id !== id) : list)))}
                    onPick={(img) => setImages((cur) => cur.map((list, j) => (j === i ? (max === 1 ? [img] : [...list, img]) : list)))}
                    onBrowse={templates || offersModels ? () => setPicker(i) : undefined}
                  />
                );
              })}
            </div>
            {app.bulk && runs.length > 1 && runCost}
            <PhotoDialog
              open={picker !== null}
              title={picker === null ? '' : (app.slots[picker]!.stock?.title ?? 'Chọn người mẫu')}
              tiles={stock.filter((g) => !g.label).flatMap((g) => stockTiles(picker!, g.names, 'Người mẫu có sẵn'))}
              groups={[
                ...stock.filter((g) => g.label).map((g) => ({ title: g.label!, tiles: stockTiles(picker!, g.names, g.label!) })),
                ...(picker !== null && app.slots[picker]!.aiModels ? [{ title: 'Người mẫu AI', tiles: fashionTiles(aiModels, (img) => setImages((cur) => cur.map((list, j) => (j === picker ? [img] : list)))) }] : []),
              ]}
              // Many groups make a long dialog (Jewelry's 7), so their names at the top jump to each one.
              filter={
                stock.filter((g) => g.label).length > 1 && (
                  <nav className="photo-jump" aria-label="Nhóm ảnh mẫu">
                    {stock.flatMap((g) =>
                      g.label
                        ? [
                            <button key={g.label} type="button" onClick={(e) => [...(e.currentTarget.closest('dialog')?.querySelectorAll('section') ?? [])].find((el) => el.getAttribute('aria-label') === g.label)?.scrollIntoView({ block: 'start' })}>
                              {g.label}
                            </button>,
                          ]
                        : [],
                    )}
                  </nav>
                )
              }
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
                {runCost}
              </div>
            )}

            {app.styles && (
              <ItemChecks label="Phong cách cần tạo" items={PET_STYLES} picked={styles} onChange={setStyles}>
                <p className="help">Mỗi phong cách tạo một thiết kế riêng trên nền trắng và tính tiền riêng. AI giữ khuôn mặt, đốm lông và màu mắt của thú cưng; hãy xem lại từng ảnh trước khi in.</p>
                {runCost}
              </ItemChecks>
            )}

            {app.products && (
              <ItemChecks label="Sản phẩm cần tạo" items={MOCKUP_PRODUCTS} picked={products} onChange={setProducts} single={blank}>
                {blank && <p className="help" role="status">Có ảnh sản phẩm trơn nên chỉ chọn được một sản phẩm.</p>}
                <p className="help">Mỗi sản phẩm tạo một ảnh mockup riêng và tính tiền riêng. Có ảnh sản phẩm trơn thì chỉ chọn một sản phẩm, đúng loại trong ảnh đó: AI in thiết kế lên chính sản phẩm ấy.</p>
                {runCost}
              </ItemChecks>
            )}

            {app.poses && (
              <>
                <div className="field">
                  {/* Many pictures: how many poses are picked out of the Run's four, and a way to untick them all, by the label rather than in a long scroll. */}
                  <div className="field-head">
                    <span id={posesId} className="field-label">
                      Tư thế cần tạo
                    </span>
                    {posesPicked > 0 && (
                      <span className="pick-count">
                        {posesPicked}/{MAX_POSES} đã chọn
                        {poses.length > 0 && (
                          <>
                            {' · '}
                            <button type="button" className="link-button" onClick={() => setPoses([])}>
                              Bỏ chọn hết
                            </button>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="segmented theme-choice preset-chips" role="group" aria-label="Chọn nhanh theo sàn" aria-describedby={presetHelpId}>
                    {POSE_PRESETS.map((pr) => (
                      <button
                        key={pr.id}
                        type="button"
                        aria-pressed={presetOn(pr)}
                        disabled={busy || presetPoses(pr).length === 0} // no room left for a pose of the preset: the pose photos and own words fill the Run
                        onClick={() => {
                          // A pressed chip toggles off: no picks and the photo's own background.
                          setPoses(presetOn(pr) ? [] : [...presetPoses(pr)]);
                          setBackground(presetOn(pr) ? 'keep' : pr.background);
                        }}
                      >
                        {pr.label}
                      </button>
                    ))}
                  </div>
                  <p id={presetHelpId} className="help">
                    {`Chọn nhanh tư thế và nền hợp quy định ảnh của từng sàn (${MAX_POSES} tư thế, hoặc ít hơn khi đã có ô ${OWN_POSE} hoặc ảnh tư thế mẫu).`}
                  </p>
                  <span id={backgroundId} className="field-label">
                    Nền
                  </span>
                  <div className="segmented theme-choice" role="radiogroup" aria-labelledby={backgroundId}>
                    {POSE_BACKGROUNDS.map((b) => (
                      <label key={b.value}>
                        <input type="radio" name={backgroundName} checked={background === b.value} disabled={busy} onChange={() => setBackground(b.value)} />
                        {b.label}
                      </label>
                    ))}
                  </div>
                  {(pictured('woman') || pictured('man')) && (
                    <div className="segmented theme-choice" role="radiogroup" aria-label="Giới tính ảnh tư thế">
                      {(['woman', 'man'] as const).map((g) => (
                        <label key={g}>
                          <input type="radio" name={genderName} checked={gender === g} onChange={() => setPoseGender(g)} />
                          {g === 'woman' ? 'Nữ' : 'Nam'}
                        </label>
                      ))}
                    </div>
                  )}
                  {/* Try On's pose pictures as toggles: each pose's picture on that gender, or its name until one is uploaded; a picked one carries the check mark
                      and, once the company's sample model has been run in that pose (pose-result-<gender>-<pose>.jpg), shows that result as a preview. */}
                  {/* Keys 1 to 9 toggle the first nine poses while a pose has focus. */}
                  <div
                    className="choice-grid model-grid pose-grid"
                    role="group"
                    aria-labelledby={posesId}
                    onKeyDown={(e) => {
                      const p = /^[1-9]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey ? POSES[Number(e.key) - 1] : undefined;
                      if (!p || busy || e.repeat) return;
                      e.preventDefault();
                      togglePose(p.value);
                      e.currentTarget.querySelectorAll('button')[Number(e.key) - 1]?.focus(); // focus follows, so a screen reader reads the pose it changed
                    }}
                  >
                    {POSES.map((p, i) => {
                      const picked = poses.includes(p.value);
                      const result = `pose-result-${gender}-${p.value}.jpg`;
                      const file = picked && have.has(result) ? result : `try-on-pose-${gender}-${p.value}.jpg`;
                      return (
                        <button key={p.value} type="button" className={have.has(file) ? undefined : 'photo-name'} aria-label={p.label} aria-pressed={picked} aria-keyshortcuts={i < 9 ? String(i + 1) : undefined} disabled={busy} onClick={() => togglePose(p.value)}>
                          {have.has(file) ? <img src={sampleThumb(file)} alt="" /> : <strong>{p.label}</strong>}
                          {have.has(file) && <span className="photo-caption">{p.label}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={poseTextId} className="field-label">
                    {OWN_POSE} (tuỳ chọn)
                  </label>
                  <textarea id={poseTextId} className="names-box" rows={2} maxLength={MAX_POSE_TEXT} value={poseText} placeholder="Ví dụ: ngồi trên bậc thềm, tay chống cằm, nhìn ra xa" onChange={(e) => setPoseText(e.target.value)} />
                  <p className="help">Mỗi tư thế tạo một ảnh riêng và tính tiền riêng, tối đa {MAX_POSES} tư thế mỗi lần chạy. Ô này tính là một tư thế và chạy thành ảnh riêng, không trộn với tư thế đã chọn. AI giữ khuôn mặt, tóc, dáng người và trang phục; hãy xem lại từng ảnh. Ô đã chọn hiện ảnh kết quả mẫu để bạn hình dung trước. Đang ở một ô tư thế, bấm phím 1 đến 9 để chọn nhanh chín tư thế đầu.</p>
                </div>
                {/* Pictures of someone in the wanted pose: each is one more pose, up to what is left of the Run's four. */}
                <Slot
                  label={POSE_PHOTOS}
                  empty="Thêm ảnh một người ở đúng tư thế muốn tạo"
                  inputLabel={POSE_PHOTOS}
                  images={poseRefs}
                  max={poseRoom}
                  count
                  optional
                  busy={busy}
                  onAdd={addPoseRefs}
                  onRemove={(id) => setPoseRefs((cur) => cur.filter((x) => x.id !== id))}
                  onPick={(img) => setPoseRefs((cur) => (poseRoom === 1 ? [img] : [...cur, img]))}
                />
                <p className="help">
                  Mỗi ảnh là một tư thế, tạo một ảnh riêng và tính tiền riêng; còn chỗ cho {Math.max(0, poseRoom - poseRefs.length)} ảnh. AI chỉ lấy tư thế, góc người và khung hình từ ảnh này; khuôn mặt, tóc, dáng người và trang phục vẫn theo ảnh người mẫu, còn nền theo mục Nền.
                </p>
                {runCost}
              </>
            )}

            {app.colors && (
              <>
                <ItemChecks
                  label="Màu cần tạo"
                  // The swatches, then the member's own colours, each with its patch of colour.
                  items={[...RECOLOR_COLORS.map((c) => c.hex), ...colors.filter((h) => !RECOLOR_COLORS.some((c) => c.hex === h))].map((hex) => ({
                    id: hex,
                    label: (
                      <>
                        <span className="swatch" style={{ background: hex }} aria-hidden="true" />
                        {RECOLOR_COLORS.some((c) => c.hex === hex) ? `${colorLabel(hex)} ${hex}` : colorLabel(hex)}
                      </>
                    ),
                  }))}
                  picked={colors}
                  onChange={pickColors}
                />
                <div className="field">
                  <label htmlFor={hexId} className="field-label">
                    Màu riêng (tuỳ chọn)
                  </label>
                  <div className="hex-add">
                    <input
                      id={hexId}
                      value={hexText}
                      placeholder="#2E8B57"
                      maxLength={7}
                      spellCheck={false}
                      disabled={busy}
                      aria-invalid={hexProblem ? true : undefined}
                      aria-describedby={hexProblem ? hexErrorId : undefined}
                      onChange={(e) => (setHexText(e.target.value), setHexProblem(''))}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addHex())}
                    />
                    <button type="button" disabled={busy || !hexText.trim()} onClick={addHex}>
                      Thêm màu
                    </button>
                  </div>
                  {hexProblem && (
                    <p id={hexErrorId} className="error">
                      {hexProblem}
                    </p>
                  )}
                  <p className="help">Mỗi màu tạo một ảnh riêng và tính tiền riêng, tối đa {MAX_PICTURES} màu mỗi lần chạy. Màu riêng thêm vào danh sách ở trên; bỏ chọn là xoá. AI chỉ đổi màu chất liệu của sản phẩm, giữ nguyên hình in, chữ, nếp vải, ánh sáng và nền; nên chọn màu tương phản với hình in để chữ vẫn rõ, và xem lại từng ảnh trước khi đăng bán.</p>
                  {runCost}
                </div>
              </>
            )}

            {app.shots && (
              <>
                <ItemChecks label="Cảnh cơ bản" items={LISTING_SHOTS.filter((s) => s.group === 'basic')} picked={shots} onChange={setShots} />
                <ItemChecks label="Cảnh theo mùa" items={LISTING_SHOTS.filter((s) => s.group === 'seasonal')} picked={shots} onChange={setShots}>
                  <p className="help">Mỗi cảnh tạo một ảnh riêng và tính tiền riêng, tối đa {MAX_PICTURES} ảnh mỗi lần chạy. Nền trắng là ảnh chính chuẩn Amazon. AI giữ nguyên hình dáng, màu, hình in và chữ của sản phẩm; hãy xem lại từng ảnh trước khi đăng bán.</p>
                  {runCost}
                </ItemChecks>
              </>
            )}

            {app.names && (
              <div className="field">
                <label htmlFor={namesId} className="field-label">
                  Tên mới, mỗi dòng một tên
                </label>
                <textarea id={namesId} className="names-box" rows={5} value={names} placeholder={'Max\nBella\nCharlie'} aria-invalid={namesProblem ? true : undefined} aria-describedby={namesProblem ? `${namesErrorId} ${namesHelpId}` : namesHelpId} onChange={(e) => setNames(e.target.value)} />
                {namesProblem && (
                  <p id={namesErrorId} className="error">
                    {namesProblem}
                  </p>
                )}
                <p id={namesHelpId} className="help">
                  Tối đa {MAX_BATCH} tên, mỗi tên tối đa {MAX_NAME} ký tự: chữ cái (có dấu), chữ số, khoảng trắng, dấu nháy đơn và gạch nối. Tên trùng chỉ tạo một lần.
                </p>
                <CsvNames disabled={busy} names={names} onNames={setNames} />
              </div>
            )}

            {(app.breeds || app.names) && (
              <div className="field">
                {/* 25 chips: how many are picked and a way to untick them all, by the label rather than in a long scroll. */}
                <div className="field-head">
                  <span id={breedsId} className="field-label">
                    {app.names ? 'Đổi cả giống chó (tuỳ chọn)' : 'Giống chó cần tạo'}
                  </span>
                  {breeds.length > 0 && (
                    <span className="pick-count">
                      {breeds.length} đã chọn ·{' '}
                      <button type="button" className="link-button" onClick={() => setBreeds([])}>
                        Bỏ chọn hết
                      </button>
                    </span>
                  )}
                </div>
                <div className="segmented theme-choice angle-choice" role="group" aria-labelledby={breedsId}>
                  {DOG_BREEDS.map((b) => (
                    <label key={b}>
                      <input type="checkbox" checked={breeds.includes(b)} onChange={() => setBreeds((cur) => (cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]))} />
                      {b}
                    </label>
                  ))}
                </div>
                <p className="help">
                  {app.names
                    ? `Không chọn giống nào thì chỉ đổi tên. Chọn giống thì mỗi tên ra một ảnh cho mỗi giống, tối đa ${MAX_BATCH} ảnh mỗi lần chạy; mỗi ảnh tính tiền riêng. Hãy xem lại chính tả từng tên trước khi đăng bán.`
                    : 'Mỗi giống tạo một ảnh riêng và tính tiền riêng. AI chỉ đổi chú chó, giữ nguyên chữ, tên và bố cục; hãy xem lại từng ảnh trước khi đăng bán.'}
                </p>
                {runCost}
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
                disabled={reference}
                placeholder={reference ? 'Đang dùng ảnh tham chiếu' : app.prompt === 'background' ? 'Ví dụ: quán cà phê ngoài trời đầy nắng, bàn đá cẩm thạch' : 'Mô tả điều bạn muốn thêm...'}
                ask={chosen ? () => ({ field: 'prompt', feature: app.feature, text: prompt, ...(room !== undefined && { room }), model: chosen.id }) : null}
              />
            )}
            {prompts.length > 0 && (
              <PromptPreview
                feature={app.feature}
                prompts={prompts}
                labels={first ? [itemLabel(runs[0]!)] : undefined}
                limit={chosen?.maxPromptChars}
                note={first && runs.length > 1 ? `${runs.length - 1} ${REST_NOTE[app.feature]}` : undefined}
              />
            )}

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
              {/* The usual wait of the model beside its price, from the company's recent runs, so a first Run is not a guess. */}
              {busy ? <span className="run-cost">· Đang gửi…</span> : estimate !== undefined && <span className="run-cost">· {usd(estimate)}{chosen?.typicalSec && ` · ${waitLabel(chosen.typicalSec)}`}</span>}
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
              result: (p) => void takeResult(p),
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

export function AppPage({ app, reuse, image }: { app: AppConfig; reuse?: string; image?: Img }) {
  if (app.soon) return <Soon app={app} text={app.soon} />;
  return <AppHistoryArt app={app}>{app.feature === 'motion_control' ? <MotionForm app={app} reuse={reuse} /> : <AppForm app={app} reuse={reuse} image={image} />}</AppHistoryArt>;
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
type MotionModel = ModelOption & { durationsSec: number[]; maxPromptChars: number; typicalSec?: { p50: number; p75: number } | null };
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
    if (!(await confirmRun(chosen?.estimateUsd, `Tạo lượt này với giá ${usd(chosen?.estimateUsd ?? 0)}?`))) return;
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
              {/* Before a video the price is per second (the 5 s estimate over 5), so the member knows what a clip will cost; then the video's total. */}
              {busy ? <span className="run-cost">· Đang gửi…</span> : chosen && <span className="run-cost">· {video ? usd(chosen.estimateUsd) : `${usd(Number(chosen.estimateUsd) / seconds)}/giây`}{chosen.typicalSec && ` · ${waitLabel(chosen.typicalSec)}`}</span>}
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
