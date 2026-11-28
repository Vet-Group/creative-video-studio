'use client';
// Marketing Studio, in four formats. UGC Try On: a creator-style try-on video from two photos (the model, then the product), laid out like Try On.
// Advanced (/marketing-studio/advanced): 1 to 7 reference images, the member's brief, an optional script and the audio switch. Unboxing
// (/marketing-studio/unboxing): the product photo, with an optional model photo (none: POV, hands only) and an optional packaging photo. Review
// (/marketing-studio/review): the model and the product photos, 1 to 3 highlight lines and an optional script. Each composes one English prompt
// (lib/marketing.ts) and posts a `marketing` video job on a video model that lists the feature; the other formats add params format and audio.
import { useRouter } from 'next/navigation';
import { type CSSProperties, useEffect, useId, useState } from 'react';
import { NO_CAP } from '@/lib/caps';
import { api, errorText, sendJson, thumbUrl } from '@/lib/api';
import { ADVANCED_MAX_IMAGES, ADVANCED_MAX_SCRIPT, advancedPrompt, briefRoom, cardTitleOfFormat, clipMatrix, clipRoom, END_TEXT_POSITIONS, type EndTextPosition, FORMAT_HREF, FORMAT_NAME, highlightLines, hrefOfFormat, marketingPrompt, type MarketingFormat, MAX_CLIPS, reviewPrompt, sectionPrompt, unboxingPrompt, unboxingRoles } from '@/lib/marketing';
import { PROMPT_TEMPLATES } from '@/lib/prompt-starters';
import { WIZARD_KEY } from '@/lib/onboarding';
import { type BrandKit, withBrand } from '@/lib/brand';
import { promptTooLong } from '@/lib/prompt-limit';
import { confirmRun, sendRun, usd } from '@/lib/run-guard';
import { confirmDialog } from './Confirm';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { useRecall } from '@/lib/use-recall';
import { useDraftState } from '@/lib/use-draft';
import { sampleThumb, useSamples } from '@/lib/use-samples';
import { cardSample } from '@/lib/examples';
import { alignInputs, asExample, dropRefillQuery, lostInputs, nothingNote, nothingRefilled, placesOf, queryOf, skippedNote } from '@/lib/reuse';
import { About } from './About';
import { FreeLeft } from './AllowanceBar';
import { AudioSwitch } from './AudioSwitch';
import { BrandPicker } from './BrandKit';
import { CardMedia, LoopVideo } from './CardMedia';
import { builtInChoices, type Choice, ChoiceBox, ChoiceDialog, PhraseChoice, useChoiceLists } from './Choices';
import { EndScene } from './EndScene';
import { Highlights } from './Highlights';
import { Icon } from './Icon';
import { copyError, copySamples, EXAMPLE_USED, FormNotice, Gallery, HISTORY_SIZE_KEY, type Img, PhotoDialog, photoImg, RunSummary, SizeSlider, Slot, uploadError, uploadImages, UPLOAD_ERROR, useSize, WorkTabs } from './image-tools';
import type { UploadSlot } from '@/lib/upload-slots';
import { FormContext, type FormActions, type Photo, type PhotoRole, useApplier, useJobs, useRecreated } from './jobs';
import { Modal } from './Modal';
import { ModelPicker } from './ModelPicker';
import { PromptComposer } from './PromptComposer';
import { ReferenceVideoSlot, type RefVideo, videoReason, type VideoRefs } from './ReferenceVideo';
import { PromptPreview, PromptSections, usePromptMode } from './PromptSections';
import { Select } from './Select';
import { Tray } from './Shell';
import { fillBlanks } from './TemplateBlanks';
import { Templates } from './Templates';
import { PageHint } from './ToolGuide';
import { VideoSettings } from './VideoSettings';

interface VideoModel {
  id: string;
  label: string;
  isMock: boolean;
  ratios: string[];
  durationsSec: number[];
  /** The rows of its duplicate pair (one entry, migration 0078). */
  pairIds: string[];
  estimateUsd: string;
  /** The estimate with native audio on; null when the model cannot make audio. */
  audioEstimateUsd: string | null;
  /** The model always makes sound, so the audio switch stays on. */
  alwaysAudio: boolean;
  maxImages: number;
  /** The model's prompt limit (the API caps it at PROMPT_CEILING). */
  maxPromptChars: number;
  supported: boolean;
  score: number;
  recommended: boolean;
  /** The output resolution, e.g. '1080p'. */
  resolution: string | null;
  /** The model takes an end frame (videoInputs). */
  endFrame: boolean;
  /** The reference video it takes, null when none (videoInputs). */
  videoRefs: VideoRefs | null;
  /** Added in the last 14 days. */
  isNew: boolean;
  creditUsd: string | null;
  creditShown: boolean;
  /** How many marks the score rests on. */
  total: number;
}

const VIDEO_ERROR = 'Không tải được video. Hãy thử lại.';

/** The most hook variants one Run makes, one clip in each of its ratios. */
const MAX_VARIANTS = 3;
/** The most ratios a Run adds to the primary one, each hook once more in each (within MAX_CLIPS clips). */
const MAX_EXTRA_RATIOS = 2;

type Tab = 'create' | 'history' | 'examples' | 'about';
const TAB_LABEL: Record<Tab, string> = { create: 'Tạo', history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };
/** The ratios of the page, in the order of the menu; a model offers some of them. */
const RATIO_LABEL: Record<string, string> = { '9:16': '9:16 (dọc)', '16:9': '16:9 (ngang)', '1:1': '1:1 (vuông)' };

const QUIET_REASONS = ['Tải lên ảnh người mẫu.', 'Tải lên ảnh sản phẩm.', 'Viết mô tả video bạn muốn.'];

/** What each format makes and needs, on its card in the format picker: "Editorial" alone says little, and each format wants other photos. */
const FORMAT_LINE: Record<MarketingFormat, string> = {
  ugc: 'Người mẫu mặc thử sản phẩm, quay như video tự quay. Cần: ảnh người mẫu, ảnh sản phẩm.',
  advanced: 'Video quảng cáo theo brief của bạn, nhiều ảnh tham chiếu và lời thoại. Cần: 1 ảnh trở lên và brief.',
  unboxing: 'Mở hộp sản phẩm trước camera. Cần: ảnh sản phẩm; người mẫu và bao bì tuỳ chọn.',
  review: 'Người mẫu đánh giá sản phẩm theo các ý bạn đưa. Cần: ảnh người mẫu, ảnh sản phẩm, 1–3 ý.',
};

/** The formats of the format picker, each with the name of its sample photo and loop (Review's keeps the name the first upload used). */
const FORMATS: { id: MarketingFormat; sample: string }[] = [
  { id: 'ugc', sample: 'marketing-format-ugc' },
  { id: 'advanced', sample: 'marketing-format-advanced' },
  { id: 'unboxing', sample: 'marketing-format-unboxing' },
  { id: 'review', sample: 'marketing-format-product-review' },
];

/** What the reuse link reads back from a Marketing Studio job (GET /api/jobs/:id), a saved template (GET /api/templates/:id) or a sample on the Examples tab (its details file, photos named as samples). */
interface MarketingJob {
  feature: string;
  format: string | null;
  images: (Img | { sample: string })[];
  /** How many input images the job had or the template saved (not a sample's). */
  inputCount?: number;
  /** The job's input ids in the order sent, a deleted one's too (alignInputs). */
  inputIds?: string[];
  /** Whether the brand kit was added to the job, its store and whether that store is hidden since (a job's, not a template's or a sample's). */
  brand?: boolean;
  storeId?: string | null;
  storeLost?: boolean;
  hook: string | null;
  /** The member's own hook and how a template's prompt was written; an older job has neither. */
  hookText?: string | null;
  promptMode?: 'sections' | 'free' | null;
  location: string | null;
  brief: string | null;
  script: string | null;
  /** Unboxing's photo roles in the order of `images`, and Review's highlight lines. */
  roles?: string | null;
  highlights?: string[] | null;
  /** The end frame, last shot and end text; a sample or an older job has none. */
  endFrame?: Img | null;
  /** Advanced's reference video; a sample or an older job has none. */
  videoRef?: RefVideo | null;
  ending?: string | null;
  endText?: string | null;
  endTextPos?: string | null;
  audio: string | null;
  ratio: string | null;
  durationSec: number | null;
  modelId: string | null;
}

export function MarketingStudio({ format = 'ugc', reuse, recipe, wizardDefault = false }: { format?: MarketingFormat; reuse?: string; recipe?: boolean; wizardDefault?: boolean }) {
  const advanced = format === 'advanced';
  const unboxing = format === 'unboxing';
  const review = format === 'review';
  /** The format the API and the page's own lists are told (UGC, the one with none, leaves it out). */
  const pf = format === 'ugc' ? undefined : format;
  const router = useRouter();
  const have = useSamples();
  const { refresh, clips, notify, loading } = useJobs();
  const recreated = useRecreated();
  const narrow = useMediaQuery(NARROW);
  const [historySize, resizeHistory] = useSize(HISTORY_SIZE_KEY, 1, 1); // history: 0 two columns, 1 one
  const [person, setPerson] = useState<Img[]>([]);
  const [product, setProduct] = useState<Img[]>([]);
  const [refs, setRefs] = useState<Img[]>([]);
  const [packaging, setPackaging] = useState<Img[]>([]); // Unboxing's optional box photo
  const [highlights, setHighlights] = useState(['']); // Review's lines
  const [script, setScript] = useState('');
  const [endFrame, setEndFrame] = useState<Img | null>(null); // sent only on a model that takes one
  const [video, setVideo] = useState<RefVideo | null>(null); // Advanced's reference video, sent only on a model that takes one (the Run says so otherwise)
  const [ending, setEnding] = useState(''); // ③ Ending of the sections, with the own hook of ①; the brief is ② Body
  const [hookText, setHookText] = useState('');
  const [freeText, setFreeText, clearFreeDraft] = useDraftState(`${pf ? `marketing-${pf}` : 'marketing'}.free`, reuse !== undefined); // the free writing box, which keeps its own words
  const [mode, setMode] = usePromptMode(pf ? `marketing-${pf}` : 'marketing');
  const sec = mode === 'sections';
  const [endText, setEndText] = useState('');
  const [endTextPos, setEndTextPos] = useState<EndTextPosition>('bottom');
  const [audio, setAudio] = useState(true);
  /** The chosen hooks: one, or with variants on up to MAX_VARIANTS, one clip each. */
  const [hooks, setHooks] = useState<string[]>([]);
  const [many, setMany] = useState(false);
  const [location, setLocation] = useState('');
  /** The member's own and the company's hooks, locations and endings, and the often-used ids; null until loaded (the built-in ones show meanwhile). */
  const choices = useChoiceLists(pf);
  const { lists: custom, setLists: setCustom, reload: loadChoices, remove: removeChoice } = choices;
  const [picker, setPicker] = useState<'hook' | 'location' | 'format' | 'model' | 'product' | null>(null);
  const [allFormats, setAllFormats] = useState(false); // History and Examples: this format's only, or every format's
  /** The member's past UGC product photos (Fash's My Products), offered by the product slot. */
  const [myProducts, setMyProducts] = useState<Img[]>([]);
  const [prompt, setPrompt, clearBodyDraft] = useDraftState(`${pf ? `marketing-${pf}` : 'marketing'}.body`, reuse !== undefined);
  const [modelId, setModelId] = useState('');
  const [ratio, setRatio] = useState('9:16');
  /** The other ratios the Run also makes (the same ad in more frame shapes); the primary `ratio` still drives the model list and the price per clip. */
  const [extras, setExtras] = useState<string[]>([]);
  const [durationSec, setDurationSec] = useState(10);
  const [storeId, setStoreId] = useState('');
  const [useBrand, setUseBrand] = useState(false); // the chosen store's brand kit, added to the prompt on the server
  const [kit, setKit] = useState<BrandKit | null>(null);
  /** The stores that are not hidden: the pickers' store filter and the store templates and choices are shared with. */
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  // The member's last model and settings on this format, unless a refill opens the page; the list then follows the ratio and duration.
  const recall = useRecall(
    'marketing',
    (s) => {
      setModelId(s.modelId);
      if (s.ratio) setRatio(s.ratio);
      if (s.durationSec) setDurationSec(s.durationSec);
      if (s.audio !== null) setAudio(s.audio);
      if (s.storeId) setStoreId(s.storeId);
      if (s.brand !== null) setUseBrand(s.brand);
    },
    { format: pf, skip: reuse !== undefined },
  );
  const apply = useApplier((s) => {
    recall.touch();
    if (s.ratio) takeRatio(s.ratio);
    if (s.durationSec) setDurationSec(s.durationSec);
  });
  const [source, setSource] = useState<{ from: string; recipe?: boolean } | null>(reuse ? { from: reuse, recipe } : null); // what the form refills from; Recreate sets a new one in place. `recipe`: a company example, its photos marked as the example's (asExample)
  /** `extra`: the list of each extra ratio, in the order of `extras`. */
  const [list, setList] = useState<{ key: string; models: VideoModel[]; defaultId: string | null; extra: VideoModel[][] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (the form below 1024 px, else Examples)
  const opening: Tab = 'examples'; // owner, 2026-11-09: beside the form a page opens on Examples, History is one click away
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const promptId = useId();
  const scriptId = useId();
  const reasonId = useId();
  const extraId = useId();
  // The guided wizard walks a Seller through format → photos → content → settings, one step at a time; off is the full form below, unchanged. Default from the team (wizardDefault), then the member's own remembered choice.
  const [wizard, setWizard] = useState(wizardDefault);
  const [step, setStep] = useState(0);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(WIZARD_KEY);
      if (saved !== null) setWizard(saved === '1');
    } catch {}
  }, []);
  const setWizardMode = (on: boolean) => {
    setWizard(on);
    setStep(0);
    try {
      localStorage.setItem(WIZARD_KEY, on ? '1' : '0');
    } catch {}
  };

  // The ratio and duration menus offer what any marketing model offers, so a model whose options differ from the chosen one's can still be picked;
  // switching to a model moves the ratio and the duration to that model's own when it lacks them.
  const models = list?.models ?? null;
  const chosen = models?.find((m) => m.id === modelId);
  const ratios = Object.keys(RATIO_LABEL).filter((r) => models?.some((m) => m.ratios.includes(r)));
  const durations = [...new Set(models?.flatMap((m) => m.durationsSec))].sort((a, b) => a - b);
  // A reference video's billed seconds change some estimates, so the list follows its length.
  const videoSec = advanced && video ? Math.ceil(video.durationMs / 1000) : 0;
  /** The ratios a Run makes, the primary first: each hook is made once in each. */
  const shapes = [ratio, ...extras];
  const key = `${shapes.join(',')}/${durationSec}/${videoSec}`;
  const fresh = list !== null && list.key === key;
  // Advanced: the slot takes up to the chosen model's reference cap (7 at most); a model that takes fewer images than are chosen cannot be picked.
  const maxRefs = Math.min(ADVANCED_MAX_IMAGES, chosen?.maxImages ?? ADVANCED_MAX_IMAGES);
  // Native audio is on by default in both formats, as on the reference site, on a model that can make it, and always on one that cannot be silent.
  // A Run with a reference video on a model whose video request has no audio switch (Kling O3) comes out silent, so sound and a script mean nothing.
  const silentWithVideo = advanced && video !== null && chosen?.videoRefs?.silent === true;
  const audioOn = (audio || chosen?.alwaysAudio === true) && chosen?.audioEstimateUsd != null && !silentWithVideo;
  const cost = audioOn ? chosen!.audioEstimateUsd! : chosen?.estimateUsd;
  const words = script.trim() ? script.trim().split(/\s+/).length : 0;
  /** The English prompt Run sends, shown as is under the form. */
  const variants = hooks.length > 0 ? hooks : [''];
  const hookList = custom?.hooks ?? builtInChoices('hook');
  const locationList = custom?.locations ?? builtInChoices('location');
  const own = { hooks: custom?.hooks, locations: custom?.locations };
  /** The words of ② Body, or of the free writing box; the own hook (used only while no hook is chosen) and the last shot count in the sections only. */
  const brief = sec ? prompt : freeText;
  const parts = { hookText: sec ? hookText : '', ending: sec ? ending : '' };
  /** The photos a Run sends, in the order the prompt names them [Image1]..: Unboxing's model is left out for POV and its packaging comes last. */
  const images = advanced ? refs : unboxing ? [...person, ...product, ...packaging] : [...person, ...product];
  const composeFor = (hook: string, brief: string, r = ratio) => {
    const shared = { hook, location, prompt: brief, ...parts, audio: audioOn, ratio: r };
    return advanced
      ? advancedPrompt({ brief, images: refs.length, video: video !== null, hook, location, script, ...parts, audio: audioOn }, own)
      : unboxing
        ? unboxingPrompt({ ...shared, model: person.length > 0, packaging: packaging.length > 0 }, own)
        : review
          ? reviewPrompt({ ...shared, highlights, script }, own)
          : marketingPrompt(shared, own);
  };
  /** A sent prompt as the provider gets it: the server adds the brand kit after it, so the preview and the limit count it too. */
  const branded = (text: string) => (kit ? withBrand(text, kit, 'marketing') : text);
  const compose = (hook: string, r = ratio) => composeFor(hook, brief, r);
  const line = (text: string) => text.replace(/\s+/g, ' ').trim();
  // The request a Run with a video makes may take no end frame (Kling O3): the slot is replaced by a note and the frame is not sent.
  const endAllowed = chosen?.endFrame === true && !(advanced && video !== null && chosen.videoRefs !== null && !chosen.videoRefs.endFrame);
  const endAssetId = endAllowed ? endFrame?.id : undefined;
  /** The clips of a Run: each hook variant in each ratio, the primary ratio last, as the next visit's settings come from the newest job (/api/recall). */
  const matrix = clipMatrix(variants, [...extras, ratio]);
  /** What the brief may take: the chosen model's limit less what the page adds around it, for the longest clip (the frame words differ by ratio). */
  const room = chosen && Math.min(...matrix.map((c) => briefRoom((b) => branded(composeFor(c.hook, b, c.ratio)), chosen.maxPromptChars)));
  /** What a Run sends for each clip, in order. */
  const sent = matrix.map((c) => compose(c.hook, c.ratio));
  const n = matrix.length;
  /** The chosen model in each extra ratio's list: a duplicate pair may make another ratio on another row (servingRow), at its price, or not at this length. */
  const extraModels = extras.map((_, i) => (fresh ? list.extra[i] : undefined)?.find((m) => m.id === chosen?.id));
  /** The estimate per clip in each ratio of the Run, the primary first. */
  const costs = [cost, ...extraModels.map((m) => m && (audioOn && m.audioEstimateUsd != null ? m.audioEstimateUsd : m.estimateUsd))];
  /** The estimate of the whole Run, at the estimate's own precision. */
  const total = cost === undefined || costs.includes(undefined) ? undefined : (variants.length * costs.reduce((s, c) => s + Number(c), 0)).toFixed(cost.split('.')[1]?.length ?? 2);
  /** The Run's shape, said when it makes more than one ratio. */
  const shape = shapes.length < 2 ? '' : variants.length > 1 ? ` (${variants.length} hook × ${shapes.length} tỉ lệ)` : ` (${shapes.length} tỉ lệ)`;
  /** How many hooks fit beside the ratios, and whether another ratio fits beside the hooks, within MAX_CLIPS. */
  const maxHooks = Math.min(MAX_VARIANTS, clipRoom(shapes.length));
  const ratiosFull = shapes.length >= Math.min(1 + MAX_EXTRA_RATIOS, clipRoom(variants.length));
  /** The extra ratios offered: the chosen model's own, in the menu's order, but the primary one. */
  const extraRatios = Object.keys(RATIO_LABEL).filter((r) => r !== ratio && chosen?.ratios.includes(r));
  const hookName = (id: string) => hookList.find((c) => c.id === id)?.name ?? id;
  const name = FORMAT_NAME[format];
  const sample = FORMATS.find((f) => f.id === format)!.sample;
  /** The sample photo and loop behind the format header, when an Admin uploaded them. */
  const photo = `${sample}.jpg`;
  /** The stock model photos an Admin uploaded (`marketing-model-1.jpg`...), offered by the model slot as on Fash's Choose model dialog. */
  const stockModels = [...have].filter((n) => /^marketing-model-\d+\.(jpg|png|webp)$/.test(n)).sort((a, b) => parseInt(a.slice(16)) - parseInt(b.slice(16)));
  const loop = `${sample}.mp4`;

  // Every model can be picked (the picker is told all are supported): switching moves the ratio and the duration to the model's own.
  function pickModel(m: VideoModel) {
    setModelId(m.id);
    const own = Object.keys(RATIO_LABEL).filter((r) => m.ratios.includes(r));
    const next = own.length > 0 && !own.includes(ratio) ? own[0]! : ratio;
    if (next !== ratio) setRatio(next);
    setExtras((cur) => cur.filter((r) => r !== next && m.ratios.includes(r))); // the extra ratios the new model does not make are dropped
    const ownDurations = [...m.durationsSec].sort((a, b) => a - b);
    if (ownDurations.length > 0 && !ownDurations.includes(durationSec)) setDurationSec(ownDurations[0]!);
  }
  /** A new primary ratio leaves the extra ratios. */
  function takeRatio(r: string) {
    setRatio(r);
    setExtras((cur) => cur.filter((x) => x !== r));
  }

  // The lists (with the estimate for this duration) are fetched again when a ratio or the duration changes, or when the member retries after a failure.
  // Each extra ratio has its own list: only it says what the chosen model costs in that ratio and whether it makes it at this length.
  useEffect(() => {
    let stale = false;
    const get = (r: string) => api<{ models: VideoModel[]; defaultModelId: string | null }>(`/api/models?feature=marketing&ratio=${encodeURIComponent(r)}&durationSec=${durationSec}${videoSec > 0 ? `&videoSec=${videoSec}` : ''}`);
    Promise.all(shapes.map(get)).then(
      ([r, ...more]) => !stale && (setList({ key, models: r!.models, defaultId: r!.defaultModelId, extra: more.map((m) => m.models) }), setFailed(false)),
      () => !stale && setFailed(true),
    );
    return () => {
      stale = true;
    };
  }, [key, attempt]);

  // Reuse: refill the form from the source job, everything stays editable. A job of the other format opens on its own page; without the
  // member's own text (a job from before it was kept, or someone else's) the rest is refilled and the brief is asked for again.
  useEffect(() => {
    if (!source) return;
    const reuse = source.from;
    let stale = false; // a refill superseded (another link, or a re-run effect) must not fill or upload
    api<MarketingJob>(reuse)
      .then(async (loaded) => {
        if (stale) return;
        if (loaded.feature !== 'marketing') return setError('Không tìm thấy clip để dùng lại.');
        // Another format's clip refills on its own page: the toast says why the page changed.
        if (hrefOfFormat(loaded.format) !== FORMAT_HREF[format]) return (notify(`Clip này làm bằng ${cardTitleOfFormat(loaded.format)}: đã mở trang đó để dùng lại.`), router.replace(`${hrefOfFormat(loaded.format)}?${queryOf(reuse)}${source.recipe ? '&recipe=1' : ''}`));
        const j = await fillBlanks(reuse, loaded);
        if (stale) return; // superseded while the member filled the blanks
        if (!j) return dropRefillQuery(); // cancelled: the form stays as it is
        if (nothingRefilled({ ...j, prompt: j.brief ?? j.hookText ?? j.ending ?? j.script })) {
          notify(nothingNote(lostInputs(j), reuse)); // nothing to bring back: the form stays as it is
          return dropRefillQuery();
        }
        // A sample's photos become this member's inputs first, copied on the server.
        const samples = j.images.map((i) => ('sample' in i ? i.sample : null)).filter((s) => s !== null);
        const copied = samples.length > 0 ? await copySamples(samples) : (j.images as Img[]);
        if (stale) return; // superseded while the photos were copied
        const inputs = source.recipe ? asExample(copied) : copied;
        // The photos keep the places they were sent in, a deleted one leaving its role empty.
        const placed = alignInputs(j.inputIds, inputs);
        if (advanced) setRefs(inputs);
        else if (unboxing) {
          // The roles say which of them the job had.
          const roles = j.roles?.split(',') ?? (placed.length === 1 ? ['product'] : ['model', 'product']);
          const photo = (role: string) => placed.flatMap((i, n) => (i && roles[n] === role ? [i] : [])).slice(0, 1);
          setPerson(photo('model'));
          setProduct(photo('product'));
          setPackaging(photo('packaging'));
        } else (setPerson(placed.slice(0, 1).filter((i) => i !== null)), setProduct(placed.slice(1, 2).filter((i) => i !== null)));
        setEndFrame(j.endFrame ?? null);
        setVideo(advanced ? (j.videoRef ?? null) : null);
        if (review) setHighlights(j.highlights?.length ? j.highlights : ['']);
        setHooks(j.hook ? [j.hook] : []);
        setLocation(j.location ?? '');
        // A job with an own hook or a last shot was written in sections; a template keeps the way it was written; else the brief goes where the member writes now.
        const next = j.promptMode ?? (j.hookText || j.ending ? 'sections' : mode);
        if (next !== mode) setMode(next);
        // An example without its words (an older job) leaves the member's own.
        if (j.brief !== null || !source.recipe) {
          if (next === 'free') setFreeText(j.brief ?? '');
          else setPrompt(j.brief ?? '');
        }
        setHookText(j.hookText ?? '');
        setScript(j.script ?? '');
        setEnding(j.ending ?? '');
        setEndText(j.endText ?? '');
        setEndTextPos((END_TEXT_POSITIONS as readonly string[]).includes(j.endTextPos ?? '') ? (j.endTextPos as EndTextPosition) : 'bottom');
        setAudio(j.audio !== 'off');
        // The brand kit switch comes back with its store (a company example keeps the member's own, a template has no switch); a store hidden since leaves it off.
        if (!source.recipe && j.brand !== undefined) {
          const on = j.brand && !j.storeLost;
          setUseBrand(on);
          if (on) setStoreId(j.storeId ?? '');
        }
        // A saved template may leave these out; the form's defaults stay. One job's clip is made again: its one ratio, no extra ones.
        setExtras([]);
        if (j.ratio) setRatio(j.ratio);
        if (j.durationSec) setDurationSec(j.durationSec);
        if (j.modelId) setModelId(j.modelId);
        if (source.recipe) notify(EXAMPLE_USED);
        else {
          const said = [j.brief === null && advanced && 'Clip này không có mô tả gốc: đã điền lại ảnh và cài đặt, hãy nhập lại mô tả.', skippedNote(inputs.length, { lost: lostInputs(j), store: j.brand === true && j.storeLost === true })].filter(Boolean).join(' ');
          if (said) setNotice(said);
          recreated(reuse);
        }
        dropRefillQuery();
      })
      .catch((e) => setError(copyError(e, 'Không tìm thấy clip để dùng lại.')))
      .finally(loading(source.recipe ? 'Đang tải mẫu...' : 'Đang tải ảnh...'));
    return () => {
      stale = true;
    };
  }, [source]);

  useEffect(() => void api<{ stores: { id: string; name: string }[] }>('/api/stores').then((r) => setStores(r.stores), () => {}), []); // a failure leaves no store filter
  // A refilled hook or location that no longer exists (deleted, or another member's) is dropped once the lists are known.
  useEffect(() => {
    if (!custom) return;
    if (hooks.some((h) => !hookList.some((c) => c.id === h))) setHooks((cur) => cur.filter((h) => hookList.some((c) => c.id === h)));
    if (location && !locationList.some((c) => c.id === location)) setLocation('');
  }, [custom, hooks, location]);
  /** A new hook or location is listed and chosen at once. */
  function added(kind: 'hook' | 'location', c: Choice) {
    setCustom((cur) => cur && { ...cur, [kind === 'hook' ? 'hooks' : 'locations']: [c, ...cur[kind === 'hook' ? 'hooks' : 'locations']] });
    if (!custom) void loadChoices(); // the lists failed to load at first: fetch them, so the new one has its phrase and name
    if (kind === 'hook') pickHook(c.id);
    else (setLocation(c.id), setPicker(null));
  }
  const pickHook = (id: string) => (many && id ? setHooks((cur) => (cur.includes(id) ? cur.filter((h) => h !== id) : cur.length < maxHooks ? [...cur, id] : cur)) : (setHooks(id ? [id] : []), setPicker(null)));

  // My products: loaded once; a failure just leaves the plain upload slot.
  useEffect(() => {
    if (advanced || unboxing) return;
    api<{ assets: Img[] }>('/api/assets?recent=marketing-product').then(
      (r) => setMyProducts(r.assets),
      () => {},
    );
  }, [advanced, unboxing]);

  // The first list picks the server's default model (the best of those that offer the starting ratio and duration), else the first; a model switched off since is replaced the same way.
  // It waits for the remembered model: a list that lands just before it would otherwise pick the default after it.
  useEffect(() => {
    if (!list || !recall.answered || list.models.some((m) => m.id === modelId)) return;
    // A job made on a duplicate pair's twin keeps the pair's entry.
    const first = list.models.find((m) => m.pairIds.includes(modelId)) ?? list.models.find((m) => m.id === list.defaultId) ?? list.models[0];
    if (first) pickModel(first);
    // modelId too: a reused job's twin id can land after the list, and must still map to its pair's entry.
  }, [list, recall.answered, modelId]);

  /** The photo the format still needs: Advanced one reference, Unboxing the product (its model and packaging are optional), the others the model and the product. */
  const photoReason = advanced
    ? refs.length === 0
      ? 'Tải lên ít nhất 1 ảnh tham chiếu.'
      : null
    : !unboxing && person.length === 0
      ? 'Tải lên ảnh người mẫu.'
      : product.length === 0
        ? 'Tải lên ảnh sản phẩm.'
        : null;
  /** An extra ratio the chosen model does not make with these choices: the row that serves it may lack the end frame, the sound or the video the Run sends. */
  const unmade = extras.find((_, i) => {
    const m = extraModels[i];
    return !m?.supported || (endAssetId !== undefined && !m.endFrame) || (audioOn && m.audioEstimateUsd == null) || (advanced && video !== null && videoReason(video, m.videoRefs, refs.length) !== null);
  });
  // The first thing that stops Run, in the order the form is filled; null when it can go. The prompt's length comes last.
  const formReason =
    !recall.answered
      ? 'Đang tải cài đặt đã dùng...'
      : failed
        ? 'Không tải được danh sách mô hình.'
        : !fresh || (models!.length > 0 && !chosen)
          ? 'Đang tải danh sách mô hình...'
          : models!.length === 0
            ? 'Marketing Studio chưa được Admin bật'
            : ratios.length === 0 || durations.length === 0
              ? 'Các mô hình này không có tỉ lệ hoặc thời lượng dùng được cho Marketing Studio.'
              : !chosen!.supported
                ? 'Mô hình này không có tỉ lệ hoặc thời lượng đã chọn. Chọn mô hình khác, hoặc đổi tỉ lệ hoặc thời lượng.'
                : unmade
                  ? `Mô hình này không làm được tỉ lệ ${unmade} với các lựa chọn hiện tại (thời lượng, âm thanh, khung cuối hoặc video tham chiếu). Bỏ tỉ lệ đó hoặc đổi lựa chọn.`
                  : photoReason ??
                    (pf && images.length > chosen!.maxImages
                      ? `Mô hình này nhận tối đa ${chosen!.maxImages} ảnh tham chiếu. Bỏ bớt ảnh hoặc chọn mô hình khác.`
                      : advanced
                        ? (videoReason(video, chosen!.videoRefs, refs.length) ?? (brief.trim() === '' ? 'Viết mô tả video bạn muốn.' : null))
                        : review && highlightLines(highlights).length === 0
                          ? 'Nhập ít nhất 1 điểm nổi bật.'
                          : null);
  const reason = formReason ?? promptTooLong(chosen, Math.max(...sent.map((s) => branded(s).length)));
  /** Hook variants and ratios beyond the clips left today are refused before anything is sent. */
  const short =
    n > 1 && clips !== null && clips.today + n > clips.cap
      ? `Hôm nay bạn chỉ còn ${Math.max(0, clips.cap - clips.today)} clip; bỏ bớt biến thể hook${shape ? ' hoặc tỉ lệ' : ''}.`
      : n > 1 && total !== undefined && chosen?.creditUsd != null && Number(total) > Number(chosen.creditUsd)
        ? `Ngân sách của mô hình này không đủ cho cả ${n} clip; bỏ bớt biến thể hook${shape ? ' hoặc tỉ lệ' : ''}.` // the picker locks a model only on one clip's price
        : null;
  const canRun = reason === null && short === null && !busy;
  // The wizard's four steps and whether each may be left: photos present, then the words the format needs, then the Run gate. Off, every block shows at once (atStep).
  const STEPS = ['Định dạng', 'Ảnh', 'Nội dung', 'Cài đặt'];
  const lastStep = STEPS.length - 1;
  const stepReady = [true, photoReason === null, review ? highlightLines(highlights).length > 0 : advanced ? brief.trim() !== '' : true, canRun];
  const atStep = (k: number) => !wizard || step === k;

  /** A stock model is copied on the server as the member's own picture, so the job only ever holds the member's own assets. */
  async function pickStock(name: string) {
    setError('');
    setBusy(true);
    try {
      setPerson(await copySamples([name], 'model'));
    } catch (e) {
      setError(copyError(e, UPLOAD_ERROR));
    } finally {
      setBusy(false);
    }
  }

  /** Uploads the files into a slot: a one-image slot is replaced, the reference slot is added to, up to `max`. */
  /** A detail's photo in its slot: on UGC the person or the product, on Advanced one more reference. */
  async function take(p: Photo, role: PhotoRole) {
    if (advanced && refs.length >= maxRefs) return notify(`Tối đa ${maxRefs} ảnh tham chiếu`);
    setError('');
    try {
      const img = await photoImg(p).finally(loading('Đang tải ảnh...'));
      if (advanced) setRefs((cur) => (cur.length < maxRefs ? [...cur, img] : cur));
      else if (role === 'model') setPerson([img]);
      else if (role === 'packaging' && unboxing) setPackaging([img]);
      else setProduct([img]);
      notify(advanced ? 'Đã thêm ảnh tham chiếu' : role === 'model' ? 'Đã dùng ảnh người mẫu' : role === 'packaging' && unboxing ? 'Đã chọn ảnh bao bì' : 'Đã chọn ảnh sản phẩm');
    } catch (e) {
      setError(copyError(e, UPLOAD_ERROR));
    }
  }
  /** Advanced's reference video: always the member's own input asset (uploaded, or copied on the server from History or an Example). */
  async function takeVideo(get: () => Promise<RefVideo[]>, failed: (e: unknown) => string) {
    setError('');
    setBusy(true);
    try {
      setVideo((await get().finally(loading('Đang tải video...')))[0]!);
      notify('Đã dùng video tham chiếu');
    } catch (e) {
      setError(failed(e));
    } finally {
      setBusy(false);
    }
  }
  const actions: FormActions = {
    recreate: (from, recipe) => (recall.touch(), setSource({ from, recipe }), narrow && setTab('create')),
    apply,
    photo: (p, role) => void take(p, role),
    has: (asset) => [...person, ...product, ...refs, ...packaging].some((i) => i.id === asset),
    prompt: (text) => ((sec ? setPrompt : setFreeText)(text), notify('Đã chép mô tả')),
    // An example's hook (the library one, else its own words) and its ending go in ① and ③, which only the sections have; the photos and the rest stay.
    hook: (h) => {
      if (!sec) setMode('sections');
      if (h.hook) setHooks([h.hook]);
      else if (h.hookText) (setHooks([]), setHookText(h.hookText));
      if (h.ending) setEnding(h.ending);
      notify('Đã dùng hook của ví dụ');
    },
    // The hook as the member's own: the phrase of the library hook or the example's own words, the example's poster as its photo (without one, no photo).
    saveHook: async (h) => {
      const phrase = line(h.hook ? (hookList.find((c) => c.id === h.hook)?.phrase ?? h.hookText ?? '') : (h.hookText ?? '')).slice(0, 300);
      if (!phrase) return notify('Ví dụ này không có hook để lưu');
      setError('');
      try {
        const poster = await copySamples([h.poster]).then((a) => a[0], () => undefined);
        added('hook', await api<Choice>('/api/choices', sendJson('POST', { kind: 'hook', name: h.name.slice(0, 40), phrase, ...(poster && { imageAssetId: poster.id }) })));
        notify('Đã lưu và chọn hook của bạn');
      } catch (e) {
        setError(errorText(e, 'Không lưu được hook, hãy thử lại.'));
      }
    },
    video: advanced ? (sample) => takeVideo(() => copySamples([sample]) as Promise<RefVideo[]>, (e) => copyError(e, VIDEO_ERROR)) : undefined,
  };

  function add(set: (f: (cur: Img[]) => Img[]) => void, slot: UploadSlot, max = 1) {
    return async (files: File[]) => {
      if (files.length === 0) return;
      if (files.length > max) notify(`Chỉ lấy ${max} ảnh đầu`);
      setError('');
      setBusy(true);
      try {
        const assets = await uploadImages(files.slice(0, max), 'image', storeId, slot).finally(loading('Đang tải lên…'));
        set((cur) => [...(max > 1 ? cur : []), ...assets].slice(0, max));
      } catch (e) {
        setError(uploadError(e));
      } finally {
        setBusy(false);
      }
    };
  }

  /** What only Unboxing and Review keep in their params: the photo roles in the order sent, the highlight lines one per line. */
  const roles = unboxingRoles({ model: person.length > 0, packaging: packaging.length > 0 });
  const formInputs = unboxing ? { roles } : review ? { highlights: highlightLines(highlights).join('\n') } : {};

  /** One job per clip (each hook variant in each ratio), sent one after another (the API takes one job per POST); a refused clip does not stop the rest. */
  async function run() {
    // One question: the variants one when there are several, else the price one from 1 USD.
    if (!(await (n > 1 ? confirmDialog({ title: `Tạo ${n} clip${shape || ', mỗi hook một clip'}, tổng ${usd(total ?? 0)}?`, confirmLabel: 'Tiếp tục' }) : confirmRun(total)))) return;
    setBusy(true);
    setError('');
    setNotice('');
    const sentOk: string[] = [];
    const refused: string[] = [];
    const batch = n > 1 ? crypto.randomUUID() : undefined; // one id on the Run's clips, by which the week's Run count (lib/popular.ts) counts them once
    for (const [i, { hook, ratio: r }] of matrix.entries()) {
      // A clip is named by its hook, and by its ratio when the Run makes several: "Mua ngay · 1:1".
      const label = [hook && hookName(hook), shape && r].filter(Boolean).join(' · ');
      // The form's own inputs ride along in params so History can refill the form (reuse); the worker never reads them.
      // The end frame and the end text are the worker's (the end text is burned in after the provider), so they go too.
      // The own hook only where the prompt has it: no hook chosen for this variant.
      const inputs = { ...(hook && { hook }), ...(!hook && line(parts.hookText) && { hookText: line(parts.hookText) }), ...(location && { location }), ...(brief.trim() && { brief: brief.trim() }), ...(endAssetId && { endAssetId }), ...(line(parts.ending) && { ending: line(parts.ending) }), ...(endText.trim() && { endText: endText.trim(), endTextPos }) };
      const body = {
        feature: 'marketing',
        assetIds: images.map((r) => r.id),
        modelId: chosen!.id,
        prompt: sent[i],
        ratio: r,
        durationSec,
        storeId: storeId || null,
        useBrand,
        params: { ...(pf && { format: pf }), audio: audioOn ? 'on' : 'off', ...(batch && { batch }), ...inputs, ...(script.trim() && (advanced || review) && { script: script.trim() }), ...formInputs, ...(advanced && video && { videoAssetId: video.id }) },
      };
      try {
        // The first variant stands for the batch: a batch the same as the last one asks before anything is sent.
        if (i > 0) await api('/api/jobs', sendJson('POST', body));
        else if (!(await sendRun(body))) return setBusy(false);
        sentOk.push(label);
      } catch (e) {
        refused.push(n > 1 ? `${label}: ${errorText(e, 'không gửi được')}` : errorText(e, 'Không gửi được lượt tạo, hãy thử lại.'));
      }
    }
    if (sentOk.length > 0) {
      clearFreeDraft();
      clearBodyDraft();
      setNotice(n > 1 ? `Đã gửi ${sentOk.length}/${n} ${shape ? 'clip' : 'biến thể'}: ${sentOk.join(', ')}. Theo dõi trong tab "Lịch sử".` : 'Đã gửi lượt tạo. Theo dõi trong tab "Lịch sử".');
      if (!narrow) setTab('history');
    }
    if (refused.length > 0) setError(n > 1 ? `Không gửi được ${refused.join('; ')}` : refused[0]!);
    await refresh();
    void loadChoices(); // the often-used group counts this Run
    setBusy(false);
  }

  /** The end frame (on a model that takes one) and the end text the worker burns in. */
  const endExtras = (
    <>
      {chosen?.endFrame && !endAllowed && <p className="help">Mô hình này không nhận khung hình cuối khi có video tham chiếu. Bỏ video để dùng khung hình cuối.</p>}
      {endAllowed && (
        <Slot label="Khung hình cuối" optional empty="Ảnh clip kết thúc ở đó" inputLabel="Ảnh khung hình cuối" images={endFrame ? [endFrame] : []} max={1} busy={busy} onAdd={add((f) => setEndFrame(f([])[0] ?? null), 'end-frame')} onRemove={() => setEndFrame(null)} onPick={setEndFrame} storeId={storeId} />
      )}
      <EndScene text={endText} onText={setEndText} position={endTextPos} onPosition={setEndTextPos} />
    </>
  );

  /** The library hook, up to three variants: in ① Hook when writing by sections, in the photo grid as on Fash when writing freely. */
  const hookValue = hooks.length === 0 ? undefined : hooks.length === 1 ? hookName(hooks[0]!) : `${hooks.length} biến thể: ${hooks.map(hookName).join(', ')}`;
  const hookBox = (
    <ChoiceBox label="Hook (tuỳ chọn)" icon="film" media={hooks[0] ? cardSample(have, `marketing-hook-${hooks[0]}`) : undefined} value={hookValue} onOpen={() => setPicker('hook')} onClear={() => setHooks([])} />
  );

  /** The location: in ② Body when writing by sections, in the photo grid when writing freely. */
  const locationBox = (
    <ChoiceBox label="Bối cảnh (tuỳ chọn)" icon="sliders" media={location ? cardSample(have, `marketing-location-${location}`) : undefined} value={locationList.find((c) => c.id === location)?.name} onOpen={() => setPicker('location')} onClear={() => setLocation('')} />
  );

  const tabs: Tab[] = narrow ? ['create', 'history', 'examples', 'about'] : ['history', 'examples', 'about'];
  const shown: Tab = narrow ? (tab ?? 'create') : tab === null || tab === 'create' ? opening : tab;
  const panel = shown === 'create' ? 'examples' : shown;

  return (
    <section aria-labelledby="marketing-title" className="create">
      <h1 id="marketing-title" className="sr-only">
        Marketing Studio
      </h1>
      <div className="create-grid">
        <WorkTabs prefix="marketing" tabs={tabs} labels={TAB_LABEL} shown={shown} onSelect={setTab} />

        <div className="card form-card" id="marketing-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'marketing-tab-create' : undefined} hidden={narrow && shown !== 'create'} onPointerDownCapture={recall.touch} onKeyDownCapture={recall.touch}>
          <div className="form-scroll">
            <PageHint href="/marketing-studio" />
            {wizard && (
              <ol className="wizard-steps" aria-label="Các bước làm video">
                {STEPS.map((s, i) => (
                  <li key={s} aria-current={i === step ? 'step' : undefined} data-done={i < step || undefined} data-active={i === step || undefined}>
                    <span className="wizard-step-n" aria-hidden="true">
                      {i + 1}
                    </span>
                    {/* A step already passed is a way back to it; later steps open through Tiếp tục, which checks each one. */}
                    {i < step ? (
                      <button type="button" className="link-button" onClick={() => setStep(i)}>
                        {s}
                      </button>
                    ) : (
                      s
                    )}
                  </li>
                ))}
              </ol>
            )}
            <button type="button" className="link-button wizard-toggle" onClick={() => setWizardMode(!wizard)}>
              {wizard ? 'Hiện cả form' : 'Làm từng bước'}
            </button>
            {/* A click anywhere on the banner opens the format picker, as Create's banner opens its presets; the chip stays the keyboard and screen-reader way in. */}
            {atStep(0) && (
              <div className="app-head marketing-head" data-category="video" data-photo={have.has(photo) || undefined} style={have.has(photo) ? ({ '--photo': `url(/api/samples/${photo})` } as CSSProperties) : undefined} onClick={() => setPicker('format')}>
                {have.has(loop) && (
                  <span className="head-loop">
                    <LoopVideo src={`/api/samples/${loop}`} poster={have.has(photo) ? `/api/samples/${photo}` : null} />
                  </span>
                )}
                <strong>{name}</strong>
                <button type="button" className="banner-chip" onClick={() => setPicker('format')}>
                  <Icon name="edit" size={12} />
                  Đổi định dạng
                </button>
              </div>
            )}
            {atStep(1) && (
              <div className="app-slots marketing-slots" data-two="true">
              {advanced ? (
                <div className="slot-wide">
                  <Slot label="Ảnh tham chiếu" empty={`Tối đa ${maxRefs} ảnh tham chiếu`} inputLabel="Ảnh tham chiếu" images={refs} max={maxRefs} busy={busy} onAdd={add(setRefs, 'reference', maxRefs)} onRemove={(id) => setRefs((cur) => cur.filter((r) => r.id !== id))} icon="plus" onPick={(a) => setRefs((cur) => [...cur, a].slice(0, maxRefs))} storeId={storeId} />
                </div>
              ) : (
                <>
                  <Slot label="Người mẫu" optional={unboxing} empty="Thêm 1 ảnh người mẫu" inputLabel="Ảnh người mẫu" images={person} max={1} busy={busy} onAdd={add(setPerson, 'model')} onRemove={() => setPerson([])} onBrowse={stockModels.length > 0 ? () => setPicker('model') : undefined} onPick={(a) => setPerson([a])} storeId={storeId} />
                  <Slot label="Sản phẩm" empty="Thêm 1 ảnh sản phẩm" inputLabel="Ảnh sản phẩm" images={product} max={1} busy={busy} onAdd={add(setProduct, 'product')} onRemove={() => setProduct([])} onBrowse={!unboxing && myProducts.length > 0 ? () => setPicker('product') : undefined} onPick={(a) => setProduct([a])} storeId={storeId} />
                  {unboxing && <Slot label="Bao bì" optional empty="Thêm 1 ảnh hộp hoặc bao bì" inputLabel="Ảnh bao bì" images={packaging} max={1} busy={busy} onAdd={add(setPackaging, 'packaging')} onRemove={() => setPackaging([])} onPick={(a) => setPackaging([a])} storeId={storeId} />}
                </>
              )}
              {!sec && hookBox}
              {!sec && locationBox}
              </div>
            )}
            {atStep(1) && unboxing && person.length === 0 && <p className="help">Không có ảnh người mẫu: video quay theo góc nhìn thứ nhất, chỉ thấy đôi tay mở hộp.</p>}
            {atStep(2) && review && <Highlights lines={highlights} onChange={setHighlights} use={!chosen || audioOn ? (script.trim() ? 'Có lời thoại thì người mẫu chỉ đọc lời thoại; các ý này được cho thấy bằng hình.' : undefined) : 'Đang tắt âm thanh: người mẫu chỉ cho thấy các ý này, không nói.'} />}

            {atStep(1) && advanced && <ReferenceVideoSlot video={video} busy={busy} onFile={(f) => void takeVideo(() => uploadImages([f], 'video', storeId) as Promise<RefVideo[]>, (e) => uploadError(e, 'video'))} onHistory={(id) => void takeVideo(() => api<{ assets: RefVideo[] }>('/api/assets/copy', sendJson('POST', { assetId: id })).then((r) => r.assets), (e) => copyError(e, VIDEO_ERROR))} onRemove={() => setVideo(null)} />}

            {atStep(2) && (
            <PromptSections
              feature="marketing"
              format={pf}
              mode={mode}
              // The free box keeps its own words: the sections only seed it while it is empty.
              onMode={(next) => (next === 'free' && !freeText.trim() && setFreeText(sectionPrompt({ hook: hooks.length > 0 ? '' : hookText, body: prompt, ending })), setMode(next))}
              hook={{
                // The library pick (with its variants) or the own words, one of the two.
                box: hookBox,
                pick: { noun: 'hook', chosen: hookValue, onOpen: () => setPicker('hook'), onDrop: () => setHooks([]) },
                text: hookText,
                onText: setHookText,
                ask: chosen ? () => ({ field: 'hook', ...(pf && { format: pf }), text: hookText, rest: sectionPrompt({ body: prompt, ending }), model: chosen.id, audio, seconds: durationSec }) : null,
              }}
              ending={{
                box: <PhraseChoice kind="ending" label="Cảnh kết có sẵn" title="Chọn cảnh kết" sub="Cảnh cuối clip dừng lại ở đó. Chọn một cảnh kết để điền vào phần Cảnh kết, rồi sửa nếu cần." choices={choices} stores={stores} storeId={storeId} text={ending} onText={setEnding} />,
                text: ending,
                onText: setEnding,
                ask: chosen ? () => ({ field: 'ending', ...(pf && { format: pf }), text: ending, rest: sectionPrompt({ hook: hooks[0] ? hookList.find((c) => c.id === hooks[0])?.phrase : hookText, body: prompt }), model: chosen.id, audio, seconds: durationSec }) : null,
                extra: endExtras,
              }}
              endText
              templates={PROMPT_TEMPLATES[format === 'ugc' ? 'marketing' : format]}
              // A template brings its own opening, so the chosen hooks go in both modes (two openings would fight), and they count as words to confirm.
              onTemplate={(t) => (setHooks([]), sec ? (setHookText(t.hook), setPrompt(t.body), setEnding(t.ending)) : setFreeText(sectionPrompt(t)))}
              filled={hooks.length > 0 || (sec ? hookText + prompt + ending : freeText).trim() !== ''}
              onRun={() => canRun && void run()}
            >
              {sec && locationBox}
              <PromptComposer
                id={promptId}
                label={sec ? 'Diễn biến' : 'Mô tả'}
                optional={!advanced}
                required={advanced}
                feature="marketing"
                format={pf}
                value={brief}
                onChange={sec ? setPrompt : setFreeText}
                maxLength={room}
                onRun={() => canRun && void run()}
                placeholder="Ví dụ: người mẫu mở hộp, cầm sản phẩm lên và nói cảm nhận đầu tiên…"
                ask={chosen ? () => ({ field: 'brief', ...(pf && { format: pf }), text: brief, hook: hooks[0], location: location || undefined, seconds: durationSec, audio, ...(room !== undefined && { room }), model: chosen.id }) : null}
              />
            </PromptSections>
            )}
            {atStep(2) && (advanced || review) && (
              <PromptComposer
                id={scriptId}
                label="Lời thoại"
                optional
                feature="marketing"
                value={script}
                onChange={setScript}
                maxLength={ADVANCED_MAX_SCRIPT}
                onRun={() => canRun && void run()}
                placeholder="Viết lời thoại bạn muốn nhân vật nói…"
                ask={chosen ? () => ({ field: 'script', format: pf!, text: script || (review ? highlightLines(highlights).join('; ') : brief), hook: hooks[0], location: location || undefined, seconds: durationSec, audio, model: chosen.id }) : null}
                aiLabel="Gợi ý lời thoại"
                parts={['ai', 'translate', 'clear', 'expand']}
                starters={[]}
                // About two words a second (the About tab); with the sound off the script is not used, and the line says so instead.
                meta={chosen && !audioOn ? <span>Đang tắt âm thanh nên lời thoại không được dùng</span> : words > 0 ? <span>{`${words} từ, khoảng ${Math.ceil(words / 2)} giây`}</span> : undefined}
              />
            )}

            {atStep(3) && (
            <>
            <VideoSettings>
              <div className="field-row">
                {models && ratios.length > 0 && (
                  <Select label="Tỉ lệ" icon="ratio" heading="Chọn tỉ lệ" value={ratio} options={ratios.map((r) => ({ value: r, label: RATIO_LABEL[r]!, short: r }))} onChange={takeRatio} />
                )}
                {models && durations.length > 0 && (
                  <Select label="Thời lượng" icon="clock" heading="Chọn thời lượng" value={String(durationSec)} options={durations.map((d) => ({ value: String(d), label: `${d} giây` }))} onChange={(v) => setDurationSec(Number(v))} />
                )}
              </div>
              {/* The same ad in more frame shapes, one clip per hook in each; only the ratios the chosen model makes, and a pick that would pass MAX_CLIPS is disabled with the reason. */}
              {extraRatios.length > 0 && (
                <div className="field">
                  <span id={extraId} className="field-label">
                    Thêm tỉ lệ (tuỳ chọn)
                  </span>
                  <div className="kinds kinds-wrap" role="group" aria-labelledby={extraId}>
                    {extraRatios.map((r) => {
                      const on = extras.includes(r);
                      return (
                        <button key={r} type="button" aria-pressed={on} disabled={!on && ratiosFull} aria-describedby={!on && ratiosFull ? `${extraId}-full` : undefined} onClick={() => setExtras((cur) => (on ? cur.filter((x) => x !== r) : [...cur, r]))}>
                          {RATIO_LABEL[r]}
                        </button>
                      );
                    })}
                  </div>
                  {ratiosFull && extraRatios.some((r) => !extras.includes(r)) && (
                    <p id={`${extraId}-full`} className="help">
                      {clipRoom(variants.length) <= MAX_EXTRA_RATIOS ? `Tối đa ${MAX_CLIPS} clip mỗi lượt (${variants.length} hook × ${shapes.length} tỉ lệ): bỏ bớt hook để thêm tỉ lệ.` : `Thêm được tối đa ${MAX_EXTRA_RATIOS} tỉ lệ.`}
                    </p>
                  )}
                </div>
              )}
              <AudioSwitch on={audio} available={chosen?.audioEstimateUsd != null} always={chosen?.alwaysAudio} reason={silentWithVideo ? 'Mô hình này không tạo âm thanh khi có video tham chiếu, nên lời thoại cũng không có tác dụng.' : undefined} onChange={setAudio} />
              {models && models.length > 0 && <ModelPicker models={models.map((m) => ({ id: m.id, label: m.label, isMock: m.isMock, supported: !pf || (m.maxImages >= images.length && (!advanced || videoReason(video, m.videoRefs, refs.length) === null)), estimateUsd: audio && m.audioEstimateUsd != null ? m.audioEstimateUsd : m.estimateUsd, score: m.score, recommended: m.recommended, resolution: m.resolution, durationsSec: m.durationsSec, audio: m.audioEstimateUsd != null, isNew: m.isNew, creditUsd: m.creditUsd, creditShown: m.creditShown, marks: m.total }))} value={chosen?.id ?? ''} onChange={(id) => pickModel(models.find((m) => m.id === id)!)} />}
            </VideoSettings>
            {/* Under the model, so in free writing the ratio row sits right under the prompt box as on Fash. */}
            <PromptPreview feature="marketing" prompts={variants.map((h) => branded(compose(h)))} labels={variants.length > 1 ? variants.map((h, i) => `Biến thể ${i + 1} (${hookName(h)})`) : undefined} limit={chosen?.maxPromptChars} check={chosen ? { model: chosen.id, audio, seconds: durationSec, ...(pf && { format: pf }) } : undefined} />
            {/* In the sections they sit in ③ Ending; in free writing, under the prompt preview. */}
            {!sec && endExtras}
            <BrandPicker storeId={storeId} onStore={setStoreId} on={useBrand} onToggle={setUseBrand} onKit={setKit} />
            <Templates
              feature="marketing"
              note={hooks.length > 1 ? `Thiết lập chỉ lưu hook đầu tiên (${hookName(hooks[0]!)}); các biến thể khác cần chọn lại khi dùng.` : undefined}
              data={() => ({
                // The model and the product go back by place, so an empty model keeps one. Unboxing's roles name the model and the box only when
                // they are there but always the product, so an empty product keeps its place ('') and the roles still match the photos.
                images: advanced ? images.map((i) => i.id) : unboxing ? [...person.map((i) => i.id), product[0]?.id ?? '', ...packaging.map((i) => i.id)] : placesOf([person, product]),
                ...(pf && { format: pf }),
                ...((advanced || review) && { script: script.trim() }),
                ...(advanced && video && { videoRef: video.id }),
                ...(unboxing && { roles }),
                ...(review && highlightLines(highlights).length > 0 && { highlights: highlightLines(highlights) }),
                hook: hooks[0],
                location,
                brief: brief.trim(),
                ...(sec && line(hookText) && { hookText: line(hookText) }),
                ...(sec && line(ending) && { ending: line(ending) }),
                promptMode: mode,
                endFrame: endAssetId,
                ...(endText.trim() && { endText: endText.trim(), endTextPos }),
                audio: audio ? 'on' : 'off',
                ratio,
                durationSec,
                modelId: chosen?.id,
              })}
              store={stores.find((s) => s.id === storeId) ?? null}
            />
            </>
            )}
          </div>

          <div className="form-message">
            {(reason ?? short) && (
              // An empty photo tile or prompt box already asks for itself: those reasons are read out but not drawn over the form's foot.
              <p id={reasonId} className="help" role="status" data-quiet={QUIET_REASONS.includes(reason ?? '') || undefined}>
                {reason ?? short}
              </p>
            )}
            {failed && (
              <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                Thử lại
              </button>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {n > 1 && clips && (
              <p className="help variants-usage">
                {shape ? `${n} clip${shape}` : `${n} biến thể`}, tổng {total === undefined ? '…' : usd(total)}: {clips.cap >= NO_CAP ? `dùng ${n} clip (hôm nay đã dùng ${clips.today})` : `dùng ${n} trong ${clips.cap} clip mỗi ngày của bạn (hôm nay đã dùng ${clips.today})`}.
              </p>
            )}
            <FormNotice text={notice} onHistory={narrow ? () => setTab('history') : undefined} />
          </div>
          <div className="runbar">
            <RunSummary items={[chosen?.label, shapes.join(' + '), `${durationSec} giây`, audioOn && 'có âm thanh']} />
            <FreeLeft />
            {wizard && step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)}>
                Quay lại
              </button>
            )}
            {wizard && step < lastStep ? (
              <button type="button" className="primary" disabled={!stepReady[step]} aria-describedby={(reason ?? short) ? reasonId : undefined} onClick={() => stepReady[step] && setStep((s) => s + 1)}>
                Tiếp tục
              </button>
            ) : (
              <button type="button" className="primary run" disabled={!canRun} aria-describedby={(reason ?? short) ? reasonId : undefined} onClick={() => void run()}>
                {busy ? (
                  'Đang gửi…'
                ) : (
                  <>
                    Tạo video
                    {n > 1 && ` ${n} clip`}
                    {chosen && <span className="run-cost">· {fresh && total !== undefined ? usd(total) : '…'}</span>} {/* the estimate is for the duration of the last list */}
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <div className={!narrow && historySize === 0 ? 'side history-small' : 'side'} id={`marketing-panel-${panel}`} role="tabpanel" aria-labelledby={`marketing-tab-${panel}`} hidden={narrow && shown === 'create'}>
          {/* History and Examples follow this page's format unless the member asks for all of them. */}
          {shown !== 'about' && (
            <div className="kinds kinds-wrap" role="group" aria-label="Lọc theo định dạng">
              {([false, true] as const).map((all) => (
                <button key={String(all)} type="button" aria-pressed={allFormats === all} onClick={() => setAllFormats(all)}>
                  {all ? 'Tất cả định dạng' : name}
                </button>
              ))}
            </div>
          )}
          {shown === 'examples' ? (
            <FormContext.Provider value={actions}>
              <Gallery kind={allFormats ? 'marketing' : `marketing_${format}`} feature="marketing" video samples="marketing-example-" format={allFormats ? undefined : format} label="Video Marketing Studio của công ty" emptyText={allFormats ? 'Chưa có video Marketing Studio nào trong công ty.' : `Chưa có video ${name} nào trong công ty.`} />
            </FormContext.Provider>
          ) : shown === 'about' ? (
            <About page={advanced ? 'advanced' : unboxing ? 'unboxing' : review ? 'review' : 'marketing'} />
          ) : (
            <FormContext.Provider value={actions}>
              {!narrow && <SizeSlider size={historySize} last={1} onChange={resizeHistory} />}
              <Tray feature="marketing" format={allFormats ? undefined : format} />
            </FormContext.Provider>
          )}
        </div>
      </div>

      <Modal open={picker === 'format'} onClose={() => setPicker(null)} label="Chọn định dạng" className="choice-dialog">
        <h2>Chọn định dạng</h2>
        <p className="modal-sub">Kiểu video marketing sẽ tạo.</p>
        <div className="choice-grid">
          {FORMATS.map((f) => (
            <button key={f.id} type="button" aria-pressed={f.id === format} aria-label={FORMAT_NAME[f.id]} aria-describedby={`format-${f.id}-desc`} onClick={() => (setPicker(null), f.id !== format && router.push(FORMAT_HREF[f.id]))}>
              {picker === 'format' && <CardMedia {...cardSample(have, f.sample)} />}
              <span className="choice-name">{FORMAT_NAME[f.id]}</span>
              <span id={`format-${f.id}-desc`} className="choice-desc">
                {FORMAT_LINE[f.id]}
              </span>
            </button>
          ))}
        </div>
      </Modal>
      <PhotoDialog
        open={picker === 'model'}
        title="Chọn người mẫu"
        tiles={stockModels.map((name, i) => ({ key: name, src: sampleThumb(name), label: `Người mẫu có sẵn ${i + 1}`, pick: () => void pickStock(name) }))}
        busy={busy}
        onFile={(files) => void add(setPerson, 'model')(files)}
        onClose={() => setPicker(null)}
      />
      <PhotoDialog
        open={picker === 'product'}
        title="Chọn sản phẩm"
        sub="Sản phẩm của tôi: các ảnh sản phẩm bạn đã dùng, hoặc tải lên ảnh mới."
        tiles={myProducts.map((a) => ({ key: a.id, src: thumbUrl(a.id), label: `Dùng lại ${a.filename}`, pick: () => setProduct([a]) }))}
        busy={busy}
        onFile={(files) => void add(setProduct, 'product')(files)}
        onClose={() => setPicker(null)}
      />
      <ChoiceDialog open={picker === 'hook'} title="Chọn hook" sub="Cảnh mở đầu giữ chân người xem trong vài giây đầu. Có thể bỏ qua." kind="hook"
        choices={hookList}
        often={custom?.often.hook ?? []}
        posters={custom?.posters.hook ?? {}}
        stores={stores}
        storeId={storeId}
        canShare={custom?.canShare ?? false}
        selected={hooks}
        multi={many}
        onPick={pickHook}
        onAdded={(c) => added('hook', c)}
        onEdited={() => void loadChoices()}
        onDelete={(c) => void removeChoice(c)}
        onClose={() => setPicker(null)}
        footer={
          <div className="variants">
            <label>
              <input type="checkbox" checked={many} onChange={(e) => (setMany(e.target.checked), !e.target.checked && setHooks((cur) => cur.slice(0, 1)))} />
              Tạo nhiều biến thể: tối đa {MAX_VARIANTS} hook, mỗi hook một clip
            </label>
            {many && (
              <button type="button" className="primary" onClick={() => setPicker(null)}>
                Xong ({hooks.length}/{maxHooks})
              </button>
            )}
            {many && maxHooks < MAX_VARIANTS && hooks.length >= maxHooks && <p className="help">Tối đa {MAX_CLIPS} clip mỗi lượt: với {shapes.length} tỉ lệ chỉ chọn được {maxHooks} hook.</p>}
            <span className="sr-only" aria-live="polite">
              {many ? `Đã chọn ${hooks.length}/${maxHooks} hook` : ''}
            </span>
          </div>
        }
      />
      <ChoiceDialog open={picker === 'location'} title="Chọn bối cảnh" sub="Nơi người mẫu xuất hiện trong video. Có thể bỏ qua." kind="location" choices={locationList} often={custom?.often.location ?? []} posters={custom?.posters.location ?? {}} canShare={custom?.canShare ?? false} stores={stores} storeId={storeId}
        selected={location ? [location] : []} onPick={(id) => (setLocation(id), setPicker(null))} onAdded={(c) => added('location', c)} onEdited={() => void loadChoices()} onDelete={(c) => void removeChoice(c)} onClose={() => setPicker(null)} />
    </section>
  );
}
