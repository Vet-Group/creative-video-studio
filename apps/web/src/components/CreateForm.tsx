'use client';
import { type DragEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { resolutionVariants } from '@/lib/resolution-variants';
import { api, errorText, sendJson, thumbUrl } from '@/lib/api';
import { cardSample, type Example, exampleForPreset, exampleModel, examplesFor, exampleTitle, sampleSrc, splitColumns } from '@/lib/examples';
import { adjustNote } from '@/lib/video-adjust';
import { briefRoom, sectionBody, sectionPrompt } from '@/lib/marketing';
import { PROMPT_TEMPLATES } from '@/lib/prompt-starters';
import { promptTooLong } from '@/lib/prompt-limit';
import { confirmRun } from '@/lib/run-guard';
import { NARROW, useMediaQuery, WIDE } from '@/lib/use-media-query';
import { useHydrated } from '@/lib/use-hydrated';
import { useRecall } from '@/lib/use-recall';
import { useDraftState } from '@/lib/use-draft';
import { useSamples, versionedSample } from '@/lib/use-samples';
import { dropRefillQuery, exampleFrom } from '@/lib/reuse';
import { About } from './About';
import { AudioSwitch } from './AudioSwitch';
import { CardMedia } from './CardMedia';
import { PhraseChoice, useChoiceLists } from './Choices';
import { ENHANCE_NOTE, EnhanceToggle } from './EnhanceToggle';
import { Icon } from './Icon';
import { copyError, copySamples, FormNotice, GALLERY_SIZE_KEY, HISTORY_SIZE_KEY, photoImg, RunSummary, SizeSlider, Slot, UploadedPhotos, uploadError, uploadImages, useSize } from './image-tools';
import { FormContext, type Photo, Tap, useApplier, useJobs, useRecreated } from './jobs';
import { Modal } from './Modal';
import { ModelPicker } from './ModelPicker';
import { loadPending, PendingProposals, type PresetDraft, PresetForm, type PresetRow, type Proposal } from './PresetEditing';
import { PromptComposer } from './PromptComposer';
import { PromptPreview, PromptSections, usePromptMode } from './PromptSections';
import { Preview } from './Preview';
import { Select } from './Select';
import { StorePicker, type StoreOption } from './StorePicker';
import { Tray } from './Shell';
import { fillBlanks } from './TemplateBlanks';
import { Templates } from './Templates';
import { PageHint } from './ToolGuide';
import { VideoSettings } from './VideoSettings';

interface Model {
  id: string;
  label: string;
  isMock: boolean;
  ratios: string[];
  durationsSec: number[];
  /** The rows of its duplicate pair (one entry, migration 0078). */
  pairIds: string[];
  maxImages: number;
  /** The model's prompt limit (the API caps it at PROMPT_CEILING). */
  maxPromptChars: number;
  /** The one output resolution the stored price is for, e.g. '1080p'. */
  resolution: string | null;
  estimateUsd: string;
  /** The estimate with native audio on; null when the model cannot make audio. */
  audioEstimateUsd: string | null;
  /** The model always makes sound, so the audio switch stays on. */
  alwaysAudio: boolean;
  /** The model takes an end frame. */
  endFrame: boolean;
  /** The longest clip in seconds that may carry an end frame; null when there is no limit. */
  endMaxSec: number | null;
  /** The model runs from the prompt alone, with no image. */
  textOnly: boolean;
  /** The reference audio the model takes: how many clips and how many seconds in all; null when none. */
  audioClips: { max: number; seconds: number } | null;
  passRate: number | null;
  score: number;
  recommended: boolean;
  /** Added in the last 14 days. */
  isNew: boolean;
  creditUsd: string | null;
  creditShown: boolean;
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
/** An uploaded reference audio clip and its length. */
type Clip = Image & { durationMs: number };
/** The shortest clip the jobs API takes, as on Fash. */
const MIN_CLIP_MS = 2000;
interface JobDetail {
  presetId: string | null;
  enhance?: boolean;
  audio?: string | null;
  prompt: string | null;
  ratio: string | null;
  durationSec: number | null;
  modelId: string | null;
  storeId: string | null;
  /** A sample's details file names its photos as samples (`?example=`); a job or a template has uploaded images. */
  images: (Image | { sample: string })[];
  /** The end frame and reference audio a job or a template still has; a sample has none. */
  endFrame?: Image | null;
  clips?: Clip[];
  /** The prompt's sections a job or a template kept, and how a template's prompt was written. */
  hookText?: string | null;
  ending?: string | null;
  promptMode?: 'sections' | 'free' | null;
}

/** A sample clip's details file (`example-<n>.json` beside the clip): what the reference site's Example dialog shows, read as a refill too. */
interface SampleDetails {
  presetId: string | null;
  modelId: string | null;
  resolution?: string | null;
  prompt: string | null;
  images: { sample: string }[];
  aspect: string | null;
  /** The form's ratio (one it offers); `aspect` is the sample's own shape. */
  ratio: string;
  durationSec: number | null;
  date: string;
}

const fmtDate = (day: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(day));

type Tab = 'create' | 'history' | 'examples' | 'about';
const TAB_LABEL: Record<Tab, string> = { create: 'Tạo', history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };
const RATIO_LABEL: Record<string, string> = { '9:16': '9:16 (dọc)', '1:1': '1:1 (vuông)', '16:9': '16:9 (ngang)', '4:3': '4:3 (ngang)', '3:4': '3:4 (dọc)', '21:9': '21:9 (siêu ngang)', auto: 'Tự động (theo ảnh)' };
const MAX_IMAGES = 9;
const ratePct = (m: Model) => (m.passRate === null ? undefined : `${Math.round(m.passRate * 100)}% (${m.passes}/${m.total})`);

/** `preset` and `model` pre-select the choices Explore links to; an unknown or switched-off one falls back to the default. */
export function CreateForm({ reuse, preset, model, image, seedPrompt }: { reuse?: string; preset?: string; model?: string; image?: string; seedPrompt?: string }) {
  const { refresh, notify, loading } = useJobs();
  const recreated = useRecreated();
  const hydrated = useHydrated();
  const [images, setImages] = useState<Image[]>([]);
  const [endFrame, setEndFrame] = useState<Image | null>(null); // the image the clip ends on, as Fash's End frame; sent only on a model that takes one
  const [presets, setPresets] = useState<PresetRow[] | null>(null); // the enabled presets, which a Run may use
  // A template editor's view of the picker: every preset, switched-off ones too, with what the edit form shows; null for a member.
  const [editable, setEditable] = useState<PresetRow[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [draft, setDraft] = useState<PresetDraft | null>(null);
  const [pending, setPending] = useState<{ list: Proposal[]; count: number } | null>(null); // the proposals waiting for an editor
  const [reviewing, setReviewing] = useState(false);
  const [presetId, setPresetId] = useState(''); // '' means a free prompt
  const [enhance, setEnhance] = useState(true); // on by default, as on Fash; it rewrites a free prompt only
  const [audio, setAudio] = useState(true); // native audio, on by default as on Fash, on a model that can make it
  // The words survive a reload, unless a link or template fills the form (the hook and the ending are not kept).
  const refilled = reuse !== undefined || seedPrompt !== undefined || image !== undefined;
  const [prompt, setPrompt, clearBodyDraft] = useDraftState('video.body', refilled); // ② Body of a sectioned prompt
  // The other sections and the free writing box, which keeps its own words: switching back to the sections finds them as they were.
  const [hookText, setHookText] = useState('');
  const [ending, setEnding] = useState('');
  const [freeText, setFreeText, clearFreeDraft] = useDraftState('video.free', refilled, seedPrompt ?? '');
  const [mode, setMode] = usePromptMode('video', seedPrompt ? 'free' : undefined);
  const sec = mode === 'sections';
  const choices = useChoiceLists();
  const [ratio, setRatio] = useState('9:16');
  const [durationSec, setDurationSec] = useState(8);
  const [modelId, setModelId] = useState(model ?? '');
  const modelRef = useRef(modelId); // the latest choice, for the models fetch that outlives the render it started in
  modelRef.current = modelId;
  /** Said when the form changed a setting itself; it shows only while the form still has the values it set. */
  const [adjusted, setAdjusted] = useState<{ text: string; ratio: string; durationSec: number; modelId?: string } | null>(null);
  const wanted = useRef(model); // the Explore choice, honoured once: the form takes its ratio and duration rather than dropping it
  const [storeId, setStoreId] = useState('');
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [ready, setReady] = useState(!reuse);
  const [source, setSource] = useState(reuse ? { from: reuse } : null); // what the form refills from; Recreate sets a new one in place
  const [refetch, setRefetch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const narrow = useMediaQuery(NARROW);
  const wide = useMediaQuery(WIDE);
  const [gallerySize, resizeGallery] = useSize(GALLERY_SIZE_KEY); // examples: 0 small tiles, 1 default, 2 large tiles
  const [historySize, resizeHistory] = useSize(HISTORY_SIZE_KEY, 1, 1); // history: 0 two columns, 1 one
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const promptId = useId();
  const tooLongId = useId();
  const clipsId = useId();
  const clipInput = useRef<HTMLInputElement>(null);
  const [clips, setClips] = useState<Clip[]>([]); // reference audio, sent only on a model that takes it
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (Create below 1024 px, else Examples)
  const opening: Tab = 'examples'; // owner, 2026-11-09: beside the form a page opens on Examples, History is one click away
  const [picking, setPicking] = useState(false);
  const [detail, setDetail] = useState<Example | null>(null);
  const [details, setDetails] = useState<SampleDetails | null>(null);
  const [tileDetails, setTileDetails] = useState<Record<string, SampleDetails>>({});
  const askedDetails = useRef(new Set<string>());
  // The member's last model and settings, unless a refill or an Explore link opens the page. The model is honoured once, as Explore's is.
  const recall = useRecall(
    'video',
    (s) => {
      wanted.current = s.modelId;
      setModelId(s.modelId);
      if (s.ratio) setRatio(s.ratio);
      if (s.durationSec) setDurationSec(s.durationSec);
      if (s.audio !== null) setAudio(s.audio);
      if (s.enhance !== null) setEnhance(s.enhance);
      if (s.storeId) setStoreId(s.storeId);
    },
    { skip: reuse !== undefined || preset !== undefined || model !== undefined },
  );

  useEffect(() => {
    api<{ stores: StoreOption[] }>('/api/stores').then((r) => setStores(r.stores), () => setError('Không tải được danh sách cửa hàng.'));
  }, []);

  async function togglePin(id: string) {
    try {
      const r = await api<{ pinned: boolean }>(`/api/stores/${id}/pin`, { method: 'PUT' });
      setStores((xs) => xs.map((s) => (s.id === id ? { ...s, pinned: r.pinned, mine: r.pinned || !!s.assigned } : s)));
    } catch {
      /* a failed pin leaves the list as it was */
    }
  }

  /** Takes a GET /api/presets answer: the enabled presets to pick from and, for a template editor, all of them. */
  const takePresets = (r: { presets: PresetRow[]; canEdit: boolean }) => {
    const enabled = r.presets.filter((p) => p.enabled !== false);
    setPresets(enabled);
    setEditable(r.canEdit ? r.presets : null);
    setCanEdit(r.canEdit);
    return enabled;
  };
  // The enabled presets the Admin set up; as on the live form, it starts on a free prompt unless Explore links to a preset.
  useEffect(() => {
    let stale = false; // a superseded answer would put the preset back over the member's pick
    api<{ presets: PresetRow[]; canEdit: boolean }>('/api/presets').then(
      (r) => {
        if (stale) return;
        const enabled = takePresets(r);
        if (!reuse) setPresetId(enabled.find((p) => p.id === preset)?.id ?? '');
      },
      () => {
        if (stale) return;
        setPresets([]);
        setError('Không tải được danh sách mẫu chuyển động.');
      },
    );
    return () => {
      stale = true;
    };
  }, [reuse, preset]);

  /** After an edit or a decision in the picker: the presets again; a pick that was switched off falls back to the free prompt. */
  const refreshPresets = () =>
    api<{ presets: PresetRow[]; canEdit: boolean }>('/api/presets').then(
      (r) => {
        const enabled = takePresets(r);
        setPresetId((cur) => (cur === '' || enabled.some((p) => p.id === cur) ? cur : ''));
      },
      () => setError('Không tải được danh sách mẫu chuyển động.'),
    );
  // An editor sees how many proposals wait each time the picker opens.
  useEffect(() => {
    if (!picking || !canEdit) return;
    let stale = false;
    loadPending().then(
      (p) => !stale && setPending(p),
      () => !stale && setPending({ list: [], count: 0 }),
    );
    return () => {
      stale = true;
    };
  }, [picking, canEdit]);

  // A picture from History (Fash's Generate Video): it becomes the first image, the rest of the form stays at its defaults.
  useEffect(() => {
    if (!image) return;
    let stale = false;
    photoImg({ asset: image })
      .then((img) => !stale && setImages([img]))
      .catch(() => setError('Không tìm thấy ảnh để tạo video.'));
    return () => {
      stale = true;
    };
  }, [image]);

  // Reuse: fill the form from the source clip; everything stays editable. A preset switched off since falls back to its prompt as a free prompt.
  useEffect(() => {
    if (!source || !presets) return;
    const reuse = source.from;
    let stale = false; // a refill superseded (another link, or a re-run effect) must not fill or upload
    api<JobDetail>(reuse)
      .then(async (loaded) => {
        if (stale) return;
        const j = await fillBlanks(reuse, loaded);
        if (stale) return; // superseded while the member filled the blanks
        if (!j) return dropRefillQuery(); // cancelled: the form stays as it is
        const preset = presets.some((p) => p.id === j.presetId) ? j.presetId : null;
        // A sample's photos become this member's inputs first, copied on the server.
        const samples = j.images.flatMap((i) => ('sample' in i ? [i.sample] : []));
        const images = samples.length > 0 ? await copySamples(samples) : (j.images as Image[]);
        if (stale) return; // superseded while the photos were copied
        setImages(images);
        // Sent only on a model that takes them, as when picked by hand.
        setEndFrame(j.endFrame ?? null);
        setClips(j.clips ?? []);
        setPresetId(preset ?? '');
        if (!preset) {
          // A prompt made of sections refills them; a template keeps the way it was written; else the words go where the member writes now.
          const body = j.hookText || j.ending ? sectionBody(j.prompt ?? '', j.hookText, j.ending) : null;
          const next = j.promptMode ?? (body !== null ? 'sections' : mode);
          if (next !== mode) setMode(next);
          if (next === 'free') setFreeText(j.prompt ?? '');
          else (setPrompt(body ?? j.prompt ?? ''), setHookText(body !== null ? (j.hookText ?? '') : ''), setEnding(body !== null ? (j.ending ?? '') : ''));
        }
        setEnhance(j.presetId === null ? (j.enhance ?? true) : true); // a preset job never had Enhance, so the default stays
        setAudio(j.audio === 'on'); // a clip from before the switch was silent
        // A saved template may leave these out; the form's defaults stay.
        if (j.ratio) setRatio(j.ratio);
        if (j.durationSec) setDurationSec(j.durationSec);
        if (j.modelId) setModelId(j.modelId);
        setStoreId(j.storeId ?? '');
        recreated(reuse);
        dropRefillQuery();
      })
      .catch((e) => setError(copyError(e, 'Không tìm thấy clip để dùng lại.')))
      .finally(() => setReady(true))
      .finally(loading('Đang tải ảnh...'));
    return () => {
      stale = true;
    };
  }, [source, presets === null]); // once the presets are known: a reload after an edit in the picker must not refill the form again

  // What the job sends besides the images (endAssetId and audioAssetIds below send them only with an image).
  const withEnd = endFrame !== null && images.length > 0;
  const clipCount = images.length > 0 ? clips.length : 0;
  // Auto follows the input image, so it is offered only with one (the models API and the jobs API refuse it otherwise).
  useEffect(() => {
    if (ratio === 'auto' && images.length === 0) setRatio('9:16');
  }, [ratio, images.length]);
  // The picker follows the ratio and duration; the chosen model stays while it supports them, else the server's default takes over.
  useEffect(() => {
    if (!ready || !recall.answered) return;
    let stale = false;
    // The images, an end frame or audio clips may move a duplicate pair onto its fal row (servingRow), so the list is priced with them.
    const adds = `${images.length > 0 ? `&images=${images.length}` : ''}${withEnd ? '&endFrame=1' : ''}${clipCount > 0 ? `&audioClips=${clipCount}` : ''}`;
    api<ModelsResponse>(`/api/models?feature=video&ratio=${encodeURIComponent(ratio)}&durationSec=${durationSec}${adds}`).then(
      (r) => {
        if (stale) return;
        setModels(r);
        // A job made on a pair's twin reuses the pair's entry.
        const want = r.models.find((m) => m.id === wanted.current || (wanted.current !== undefined && m.pairIds.includes(wanted.current)));
        wanted.current = undefined;
        if (want && !want.supported && want.ratios.length > 0 && want.durationsSec.length > 0) {
          const to = { ratio: want.ratios.includes(ratio) ? ratio : want.ratios[0]!, durationSec: want.durationsSec.includes(durationSec) ? durationSec : want.durationsSec[0]! };
          if (to.ratio !== ratio) setRatio(to.ratio);
          if (to.durationSec !== durationSec) setDurationSec(to.durationSec);
          const text = adjustNote({ ...(to.ratio !== ratio && { ratio: { from: ratio, to: to.ratio } }), ...(to.durationSec !== durationSec && { durationSec: { from: durationSec, to: to.durationSec } }) });
          if (text) setAdjusted({ ...to, text });
          return; // the next fetch, for the new ratio and duration, keeps the model
        }
        const cur = modelRef.current;
        const kept = r.models.find((m) => (m.id === cur || m.pairIds.includes(cur)) && m.supported);
        const next = kept?.id ?? r.defaultModelId ?? '';
        setModelId(next);
        const options = r.models.flatMap((m) => m.durationsSec);
        const toDuration = options.length > 0 && !options.includes(durationSec) ? Math.min(...options) : durationSec;
        if (toDuration !== durationSec) setDurationSec(toDuration);
        const nextLabel = r.models.find((m) => m.id === next)?.label;
        const note = adjustNote({ ...(toDuration !== durationSec && { durationSec: { from: durationSec, to: toDuration } }), ...(cur !== '' && !kept && nextLabel && { model: { label: nextLabel, ratio, durationSec } }) });
        if (note) setAdjusted({ ratio, durationSec: toDuration, modelId: next, text: note });
      },
      () => !stale && setError('Không tải được danh sách mô hình.'),
    );
    return () => {
      stale = true;
    };
  }, [ready, recall.answered, ratio, durationSec, refetch, withEnd, clipCount, images.length]);

  const chosen = models?.models.find((m) => m.id === modelId);
  const audioOn = (audio || chosen?.alwaysAudio === true) && chosen?.audioEstimateUsd != null;
  const endAssetId = chosen?.endFrame && images.length > 0 ? endFrame?.id : undefined;
  // As on Fash, a model with a text twin runs from the prompt alone; a preset moves the product in an image, so it needs one.
  const wordsOnly = images.length === 0 && chosen?.textOnly === true;
  const takes = chosen?.audioClips;
  const audioAssetIds = takes && images.length > 0 && clips.length > 0 ? clips.map((c) => c.id).join(',') : undefined;
  const clipsOver = takes != null && (clips.length > takes.max || clips.reduce((s, c) => s + c.durationMs, 0) > takes.seconds * 1000);
  // The options follow the chosen model; before one is chosen, every model's options show.
  const durations = [...new Set(chosen ? chosen.durationsSec : (models?.models.flatMap((m) => m.durationsSec) ?? [durationSec]))].sort((a, b) => a - b);
  const ratios = chosen ? chosen.ratios : (models?.models.flatMap((m) => m.ratios) ?? [ratio]);
  const tooMany = chosen !== undefined && images.length > chosen.maxImages;
  // The resolutions of one model are rows of their own (id, id-480p, id-1080p, as the models API lists them; lib/resolution-variants.ts), so the Resolution box switches between those that serve this ratio and length.
  const resolutions = chosen ? resolutionVariants(models?.models ?? [], chosen) : [];
  const endOver = endAssetId !== undefined && chosen?.endMaxSec != null && durationSec > chosen.endMaxSec;
  // The upload limit follows the chosen model (REA-video V02); the server caps every model at MAX_IMAGES.
  const maxImages = Math.min(MAX_IMAGES, chosen?.maxImages ?? MAX_IMAGES);
  /** What Run sends as the free prompt: the sections composed (the body as typed while the hook and the ending are empty), or the free writing box. */
  const composed = sec ? sectionPrompt({ hook: hookText, body: prompt, ending }) : freeText;
  /** What the body may take: the model's limit less the hook and the ending around it. */
  const room = chosen && (sec ? briefRoom((b) => sectionPrompt({ hook: hookText, body: b, ending }), chosen.maxPromptChars) : chosen.maxPromptChars);
  const line = (text: string) => text.replace(/\s+/g, ' ').trim();
  const sections = { ...(sec && line(hookText) && { hookText: line(hookText) }), ...(sec && line(ending) && { ending: line(ending) }) };
  const tooLong = presetId === '' ? promptTooLong(chosen, composed.trim().length) : null;
  const promptOk = presetId !== '' || (composed.trim() !== '' && tooLong === null);
  const canRun = ready && recall.answered && !busy && (images.length > 0 || (wordsOnly && presetId === '')) && chosen?.supported === true && !tooMany && !clipsOver && !endOver && promptOk;

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setError('');
    if (images.length + files.length > maxImages) return setError(`Tối đa ${maxImages} ảnh.`);
    setBusy(true);
    try {
      const assets = (await uploadImages(files, 'image', storeId, 'video').finally(loading('Đang tải lên…'))) as Image[];
      setImages((cur) => [...cur, ...assets]);
    } catch (e) {
      setError(uploadError(e));
    } finally {
      setBusy(false);
    }
  }

  /** Reference audio: MP3 or WAV clips, each at least 2 s, up to the model's count; the total length is checked against the model before Run. */
  async function addClips(files: File[]) {
    if (!takes || files.length === 0) return;
    setError('');
    if (clips.length + files.length > takes.max) return setError(`Tối đa ${takes.max} tệp âm thanh.`);
    setBusy(true);
    try {
      const added = (await uploadImages(files, 'audio').finally(loading('Đang tải lên…'))) as Clip[]; // the assets API answers every upload with its length
      if (added.some((c) => c.durationMs < MIN_CLIP_MS)) setError('Mỗi tệp âm thanh phải dài ít nhất 2 giây.');
      setClips((cur) => [...cur, ...added.filter((c) => c.durationMs >= MIN_CLIP_MS)]);
    } catch (e) {
      setError(uploadError(e, 'audio'));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!(await confirmRun(chosen && (audioOn ? chosen.audioEstimateUsd : chosen.estimateUsd)))) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/api/jobs', sendJson('POST', { assetIds: images.map((i) => i.id), modelId, ...(presetId ? { presetId } : { prompt: composed, enhance }), ratio, durationSec, storeId: storeId || null, params: { audio: audioOn ? 'on' : 'off', ...(endAssetId && { endAssetId }), ...(audioAssetIds && { audioAssetIds }), ...(!presetId && sections) } }));
      clearBodyDraft();
      clearFreeDraft();
      setNotice('Đã gửi lượt tạo. Theo dõi trong tab "Lịch sử".');
      setRefetch((n) => n + 1);
      if (!narrow) setTab('history'); // beside the form, the new job shows in History
      await refresh();
    } catch (e) {
      setError(errorText(e, 'Không gửi được lượt tạo, hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  // Below 1024 px the form is one tab among Create / History / Examples / About; beside it, the tabs are History / Examples / About.
  const tabs: Tab[] = narrow ? ['create', 'history', 'examples', 'about'] : ['history', 'examples', 'about'];
  const shown: Tab = narrow ? (tab ?? 'create') : tab === null || tab === 'create' ? opening : tab;
  const current = presets?.find((p) => p.id === presetId);
  const have = useSamples();
  const media = (path: string) => sampleSrc(have, path);
  /** A preset's loop: its own `preset-<id>` sample (`preset-general` for the free prompt), else the sample clip that stands for it. */
  const presetMedia = (id: string) => {
    const ex = exampleForPreset(id, have);
    const own = cardSample(have, `preset-${id || 'general'}`, ex ? media(ex.poster) : null);
    // An editor replaces these in the picker: the versioned URL shows the new file at once.
    const fresh = (src: string | null) => (src?.startsWith('/api/samples/preset-') ? versionedSample(src) : src);
    return { video: fresh(own.video) ?? (ex ? media(ex.src) : null), poster: fresh(own.poster), ex };
  };
  const banner = presetMedia(presetId);
  const free = presetMedia('');
  const examples = examplesFor(have);
  // Each tile is named from its clip's details file, read once when the Examples tab opens.
  useEffect(() => {
    if (shown !== 'examples') return;
    for (const { id } of examplesFor(have)) {
      if (!have.has(`${id}.json`) || askedDetails.current.has(id)) continue;
      askedDetails.current.add(id);
      api<SampleDetails>(`/api/samples/${id}.json`).then(
        (d) => setTileDetails((t) => ({ ...t, [id]: d })),
        () => undefined, // the tile keeps its own name
      );
    }
  }, [shown, have]);
  const titleOf = (ex: Example) => exampleTitle(ex, tileDetails[ex.id], presets);
  const detailAt = detail ? examples.findIndex((e) => e.id === detail.id) : -1;
  // As on Fash, a sample with a details file shows its own prompt, input photos, settings and date, and Dùng lại refills the form from it.
  const detailed = detail !== null && have.has(`${detail.id}.json`) ? detail.id : null;
  useEffect(() => {
    setDetails(null);
    if (!detailed) return;
    let stale = false;
    api<SampleDetails>(`/api/samples/${detailed}.json`).then(
      (d) => !stale && setDetails(d),
      () => undefined, // the dialog keeps the clip's own facts
    );
    return () => {
      stale = true;
    };
  }, [detailed]);
  const detailPreset = details?.presetId ? presets?.find((p) => p.id === details.presetId) : undefined;
  const detailModel = details?.modelId ? models?.models.find((m) => m.id === details.modelId)?.label : undefined;
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
  const apply = useApplier((s) => {
    recall.touch();
    if (s.ratio) setRatio(s.ratio);
    if (s.durationSec) setDurationSec(s.durationSec);
  });
  /** A detail's model (its name, or its resolution, which the model fixes) on the form, as Fash's Recreate picks it. Both show only for a model the picker lists. */
  function pickModel(id: string, said: string) {
    recall.touch();
    wanted.current = id;
    setModelId(id);
    setRefetch((n) => n + 1);
    notify(said);
  }
  /** A detail's photo as one more reference image, as Fash's "Reference image added". */
  async function take(p: Photo) {
    if (images.length >= maxImages) return notify(`Tối đa ${maxImages} ảnh`);
    setError('');
    try {
      const img = await photoImg(p).finally(loading('Đang tải ảnh...'));
      setImages((cur) => (cur.length < maxImages ? [...cur, img] : cur));
      notify('Đã thêm ảnh tham chiếu');
    } catch (e) {
      setError(copyError(e, 'Không tải lên được ảnh.'));
    }
  }
  /** A detail's words as the free prompt (a preset has none of its own text); in sections, the body, with the hook and the ending emptied so Run sends them as they are. */
  function copyPrompt(text: string) {
    setPresetId('');
    if (sec) (setPrompt(text), setHookText(''), setEnding(''));
    else setFreeText(text);
    notify('Đã chép mô tả');
  }
  /** Free writing starts from what the sections would send. */
  function switchMode(next: typeof mode) {
    if (next === 'free') setFreeText(composed);
    setMode(next);
  }
  /** Fash's Recreate: the form refills in place; on a narrow screen the form is its own tab, so it opens. */
  function recreate(from: string) {
    recall.touch();
    setSource({ from });
    if (narrow) setTab('create');
  }

  function fillFromExample(ex: Example) {
    recall.touch();
    if (presets?.some((p) => p.id === ex.presetId)) setPresetId(ex.presetId);
    if (ex.ratio) setRatio(ex.ratio);
    setDurationSec(ex.durationSec);
    setDetail(null);
    setPicking(false);
    if (narrow) setTab('create');
  }

  // ② Body of the sections, the one box of free writing, and the read-only box of a preset.
  const body = (
    <PromptComposer
      id={promptId}
      label="Mô tả chuyển động"
      feature="video"
      value={sec ? prompt : freeText}
      onChange={sec ? setPrompt : setFreeText}
      maxLength={room}
      onRun={() => canRun && void run()}
      disabled={presetId !== ''}
      placeholder={presetId === '' ? 'Ví dụ: The camera orbits slowly around the product in soft light (nên viết bằng tiếng Anh)' : 'Đang dùng mẫu. Chọn "Tự viết mô tả" trong danh sách mẫu để tự nhập'}
      ask={chosen ? () => ({ field: 'prompt', feature: 'video', text: sec ? prompt : freeText, seconds: durationSec, audio, room: room!, model: chosen.id }) : null}
      enhance={<EnhanceToggle on={enhance} onChange={setEnhance} />}
    />
  );
  // In the sections, the end frame sits in ③ Ending beside the last shot; with free writing or a preset, under the photos.
  const endSlot = chosen?.endFrame && (
    <Slot
      label="Khung hình cuối"
      optional
      empty="Ảnh clip kết thúc ở đó"
      inputLabel="Ảnh khung hình cuối"
      images={endFrame ? [endFrame] : []}
      max={1}
      busy={busy}
      onAdd={(files) => {
        setError('');
        setBusy(true);
        uploadImages(files, 'image', storeId, 'end-frame')
          .finally(loading('Đang tải lên…'))
          .then(([img]) => img && setEndFrame(img), (e) => setError(uploadError(e)))
          .finally(() => setBusy(false));
      }}
      onRemove={() => setEndFrame(null)}
      onPick={setEndFrame}
      storeId={storeId}
    />
  );

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

        <div className="card form-card" id="create-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'create-tab-create' : undefined} hidden={narrow && shown !== 'create'} onPointerDownCapture={recall.touch} onKeyDownCapture={recall.touch}>
          <div className="form-scroll">
            <PageHint href="/create" />
            {/* A click anywhere on the banner opens the picker too; the chip stays the keyboard and screen-reader way in. */}
            <div className="banner" aria-busy={presets === null} onClick={() => setPicking(true)}>
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
                    ? `Tối đa ${maxImages} ảnh sản phẩm${chosen?.textOnly ? ', hoặc chỉ viết mô tả' : ''}`
                    : images.length >= maxImages
                      ? `Đã đủ ${maxImages} ảnh`
                      : `${images.length}/${maxImages} ảnh, bấm hoặc kéo thêm`}
                </span>
              </button>
              {images.length > 0 && (
                <ul className="thumbs" aria-label="Ảnh đã chọn">
                  {images.map((i) => (
                    <li key={i.id}>
                      <img src={thumbUrl(i.id)} alt={i.filename} />
                      <button type="button" aria-label={`Bỏ ảnh ${i.filename}`} onClick={() => setImages((cur) => cur.filter((x) => x.id !== i.id))}>
                        <Icon name="x" size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="dropzone-foot">
              <UploadedPhotos taken={images} disabled={!hydrated || busy || images.length >= maxImages} storeId={storeId} onPick={(img) => (setError(''), setImages((cur) => (cur.length < maxImages ? [...cur, img] : cur)))} />
            </div>
            {(!sec || presetId !== '') && endSlot}
            {takes && (
              <div className="field">
                <span id={clipsId} className="field-label">
                  Âm thanh tham chiếu
                </span>
                <div className="slot" role="group" aria-labelledby={clipsId}>
                  <input
                    ref={clipInput}
                    type="file"
                    accept="audio/mpeg,audio/wav,.mp3,.wav"
                    multiple
                    hidden
                    aria-label="Tệp âm thanh tham chiếu"
                    disabled={!hydrated}
                    onChange={(e) => {
                      const files = [...(e.target.files ?? [])];
                      e.target.value = '';
                      void addClips(files);
                    }}
                  />
                  {clips.length > 0 && (
                    <ul className="clips" aria-label="Âm thanh đã chọn">
                      {clips.map((c) => (
                        <li key={c.id}>
                          {c.filename} · {(c.durationMs / 1000).toFixed(1)} giây
                          <button type="button" aria-label={`Bỏ âm thanh ${c.filename}`} onClick={() => setClips((cur) => cur.filter((x) => x.id !== c.id))}>
                            <Icon name="x" size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {clips.length < takes.max && (
                    <button type="button" className="slot-add" aria-label="Tải lên Âm thanh tham chiếu" disabled={!hydrated || busy} onClick={() => clipInput.current?.click()}>
                      <Icon name="plus" size={16} />
                      <span>Tải lên</span>
                    </button>
                  )}
                  <span className="slot-hint">{`Tối đa ${takes.max} tệp MP3 hoặc WAV, mỗi tệp từ 2 giây, tổng tối đa ${takes.seconds} giây`}</span>
                </div>
              </div>
            )}
            {clipsOver && <p className="error">Mô hình này nhận tối đa {takes!.max} tệp âm thanh, tổng {takes!.seconds} giây.</p>}

            {wordsOnly && presetId !== '' && <p className="help">Mẫu chuyển động cần ảnh sản phẩm. Không có ảnh thì chọn &quot;Tự viết mô tả&quot;.</p>}
            {tooLong && (
              <p className="error" id={tooLongId}>
                {tooLong}
              </p>
            )}

            {/* A preset's prompt replaces everything, so its box stands alone, read-only, without the sections. */}
            {presetId !== '' ? (
              body
            ) : (
              <PromptSections
                feature="video"
                mode={mode}
                onMode={switchMode}
                hook={{
                  box: <PhraseChoice kind="hook" label="Hook có sẵn" title="Chọn hook" sub="Cảnh mở đầu giữ chân người xem trong 2 giây đầu. Chọn một hook để điền vào phần Hook, rồi sửa nếu cần." choices={choices} stores={stores} storeId={storeId} text={hookText} onText={setHookText} />,
                  text: hookText,
                  onText: setHookText,
                  ask: chosen ? () => ({ field: 'hook', text: hookText, rest: sectionPrompt({ body: prompt, ending }), model: chosen.id, audio, seconds: durationSec }) : null,
                }}
                ending={{
                  box: <PhraseChoice kind="ending" label="Cảnh kết có sẵn" title="Chọn cảnh kết" sub="Cảnh cuối clip dừng lại ở đó. Chọn một cảnh kết để điền vào phần Kết, rồi sửa nếu cần." choices={choices} stores={stores} storeId={storeId} text={ending} onText={setEnding} />,
                  text: ending,
                  onText: setEnding,
                  ask: chosen ? () => ({ field: 'ending', text: ending, rest: sectionPrompt({ hook: hookText, body: prompt }), model: chosen.id, audio, seconds: durationSec }) : null,
                  extra: endSlot,
                }}
                templates={PROMPT_TEMPLATES.video}
                onTemplate={(t) => (sec ? (setHookText(t.hook), setPrompt(t.body), setEnding(t.ending)) : setFreeText(sectionPrompt(t)))}
                filled={(sec ? hookText + prompt + ending : freeText).trim() !== ''}
                onRun={() => canRun && void run()}
              >
                {body}
              </PromptSections>
            )}
            {/* A preset's own prompt goes as it is (Enhance is off with a preset); only a template editor can read it, so a member's preview stays hidden. */}
            {presetId === '' ? (sec || composed.trim()) && <PromptPreview feature="video" prompts={[composed]} limit={chosen?.maxPromptChars} note={enhance ? ENHANCE_NOTE : undefined} check={chosen ? { model: chosen.id, audio, seconds: durationSec } : undefined} /> : current?.prompt && <PromptPreview feature="video" prompts={[current.prompt]} limit={chosen?.maxPromptChars} />}

            <VideoSettings>
              {models && models.models.length > 0 && (
                <ModelPicker
                  models={models.models.map((m) => ({ id: m.id, label: m.label, isMock: m.isMock, supported: m.supported, rate: ratePct(m), estimateUsd: audio && m.audioEstimateUsd != null ? m.audioEstimateUsd : m.estimateUsd, score: m.score, recommended: m.recommended, resolution: m.resolution, durationsSec: m.durationsSec, audio: m.audioEstimateUsd != null, isNew: m.isNew, creditUsd: m.creditUsd, creditShown: m.creditShown, marks: m.total }))}
                  value={modelId}
                  onChange={setModelId}
                />
              )}
              {models && models.models.length === 0 && <p className="help">Chưa bật mô hình video nào. Admin bật trong Quản trị → Cài đặt → Mô hình.</p>}
              {tooMany && chosen && <p className="error">Mô hình này nhận tối đa {chosen.maxImages} ảnh.</p>}
              {endOver && <p className="error">Mô hình này chỉ nhận khung hình cuối cho clip tối đa {chosen!.endMaxSec} giây.</p>}
              <Select label="Độ phân giải" icon="preset" heading="Độ phân giải" value={resolutions.length > 1 ? chosen!.id : (chosen?.resolution ?? '')} options={resolutions.length > 1 ? resolutions.map((m) => ({ value: m.id, label: m.resolution! })) : [{ value: chosen?.resolution ?? '', label: chosen?.resolution ?? 'Theo mô hình' }]} onChange={resolutions.length > 1 ? setModelId : () => undefined} />
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
                options={[...new Set(ratios)].filter((r) => r !== 'auto' || images.length > 0).map((r) => ({ value: r, label: RATIO_LABEL[r] ?? r }))}
                onChange={setRatio}
              />
              <AudioSwitch on={audio} available={chosen?.audioEstimateUsd != null} always={chosen?.alwaysAudio} onChange={setAudio} />
            </VideoSettings>
            {adjusted && adjusted.ratio === ratio && adjusted.durationSec === durationSec && (adjusted.modelId === undefined || adjusted.modelId === modelId) && (
              <p className="help" role="status">
                {adjusted.text}
              </p>
            )}
            <StorePicker label="Cửa hàng/Thương hiệu" heading="Chọn cửa hàng hoặc thương hiệu" value={storeId} stores={stores} noneLabel="Không chọn" onChange={setStoreId} onPin={togglePin} />

            {models && (
              <p className="help">
                Tháng này bạn đã dùng: ${models.monthToDate.usd}
                {models.monthToDate.provisional && <span className="tag">Tạm tính</span>}
                {models.remainingBudgetUsd !== undefined && <span> · Ngân sách tháng còn lại của công ty: ${models.remainingBudgetUsd}</span>}
              </p>
            )}
            <Templates
              feature="video"
              data={() => ({ images: images.map((i) => i.id), endFrame: endAssetId, clips: audioAssetIds ? clips.map((c) => c.id) : undefined, ...(presetId ? { presetId } : { prompt: composed.trim(), enhance, ...sections, promptMode: mode }), audio: audio ? 'on' : 'off', ratio, durationSec, modelId, storeId })}
              store={stores.find((s) => s.id === storeId) ?? null}
            />
          </div>

          {(error || notice) && (
            <div className="form-message">
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <FormNotice text={notice} onHistory={narrow ? () => setTab('history') : undefined} />
            </div>
          )}
          <div className="runbar">
            <RunSummary items={[chosen?.label, ratio, `${durationSec} giây`, audioOn && 'có âm thanh']} />
            <button type="button" className="primary run" disabled={!canRun} aria-describedby={tooLong ? tooLongId : undefined} onClick={() => void run()}>
              {busy ? (
                'Đang gửi…'
              ) : (
                <>
                  Tạo video
                  {chosen && <span className="run-cost">· ${audioOn ? chosen.audioEstimateUsd : chosen.estimateUsd}</span>}
                </>
              )}
            </button>
          </div>
        </div>

        <div className={!narrow && historySize === 0 ? 'side history-small' : 'side'} id={`create-panel-${shown === 'create' ? 'history' : shown}`} role="tabpanel" aria-labelledby={`create-tab-${shown === 'create' ? 'history' : shown}`} hidden={narrow && shown === 'create'}>
          {!narrow && shown === 'examples' && <SizeSlider size={gallerySize} onChange={resizeGallery} />}
          {!narrow && shown === 'history' && <SizeSlider size={historySize} last={1} onChange={resizeHistory} />}
          {shown === 'examples' ? (
            <div className="masonry" role="group" aria-label="Video ví dụ">
              {splitColumns(examples, narrow ? 2 : Math.max(1, (wide ? 4 : 3) + 1 - gallerySize)).map((column, c) => (
                <ul key={c} className="masonry-col">
                  {column.map((ex) => (
                    <li key={ex.id} className="example">
                      <Preview src={media(ex.src)} poster={media(ex.poster)} width={ex.width} height={ex.height} title={titleOf(ex)} paused={picking || detail !== null} onHover />
                      <button type="button" className="example-open" onClick={() => setDetail(ex)}>
                        <span className="example-caption">
                          {titleOf(ex)}
                          <span className="example-model" aria-hidden="true">
                            {exampleModel(tileDetails[ex.id], models?.models)}
                          </span>
                        </span>
                      </button>
                      <button type="button" className="example-use" aria-label={`Dùng ví dụ này: ${[titleOf(ex), exampleModel(tileDetails[ex.id], models?.models)].filter(Boolean).join(', ')}`} onClick={() => (have.has(`${ex.id}.json`) ? recreate(exampleFrom({ example: ex.id })!) : fillFromExample(ex))}>
                        Dùng ví dụ này
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          ) : shown === 'about' ? (
            <About page="create" models={models?.models} />
          ) : (
            <FormContext.Provider value={{ recreate, apply, photo: (p) => void take(p), prompt: copyPrompt }}>
              <Tray feature="video" />
            </FormContext.Provider>
          )}
        </div>
      </div>

      <Modal open={picking} onClose={() => setPicking(false)} label="Bộ sưu tập mẫu">
        <h2>Chọn mẫu</h2>
        <p className="modal-sub">Mỗi mẫu là một kiểu chuyển động có sẵn, kèm video ví dụ; chọn mẫu sẽ thay cả prompt. Hoặc tự viết mô tả.</p>
        <ul className="preset-grid" aria-label="Danh sách mẫu">
          {/* The free prompt leads, as "General" does on the live picker: it is the default choice. */}
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
          {(editable ?? presets)?.map((p) => {
            const m = presetMedia(p.id);
            const off = p.enabled === false; // shown to an editor only, who can switch it back on
            return (
              <li key={p.id} className={off ? 'preset-card off' : 'preset-card'}>
                {m.video ? <Preview src={m.video} poster={m.poster ?? ''} width={3} height={4} title={p.label} /> : <div className="banner-empty" />}
                {off ? (
                  <span className="preset-name">
                    {p.label}
                    <span className="tag">Đang tắt</span>
                  </span>
                ) : (
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
                )}
                {/* After the name, so the picker's buttons still read name first; it sits above the name's card-wide click area. */}
                <button type="button" className="preset-edit" aria-label={canEdit ? `Sửa mẫu ${p.label}` : `Đề xuất sửa mẫu ${p.label}`} onClick={() => setDraft({ preset: p, propose: !canEdit })}>
                  {canEdit ? 'Sửa' : 'Đề xuất sửa'}
                </button>
              </li>
            );
          })}
        </ul>
        {/* Below the grid, so the first row keeps its place under the header. */}
        <div className="preset-actions">
          <button type="button" className="link-button" onClick={() => setDraft({ preset: null, propose: !canEdit })}>
            {canEdit ? 'Thêm mẫu' : 'Đề xuất mẫu mới'}
          </button>
          {canEdit && (
            <button type="button" className="link-button" onClick={() => setReviewing(true)}>
              Chờ duyệt ({pending?.count ?? 0})
            </button>
          )}
        </div>
      </Modal>
      <PresetForm
        draft={draft}
        onClose={() => setDraft(null)}
        onSaved={(text) => {
          setDraft(null);
          notify(text);
          void refreshPresets();
        }}
        onWritten={() => void refreshPresets()}
      />
      <PendingProposals
        open={reviewing}
        proposals={pending?.list ?? null}
        onClose={() => setReviewing(false)}
        onDecided={(text) => {
          if (text) notify(text);
          void refreshPresets();
          void loadPending().then(setPending, () => setPending({ list: [], count: 0 }));
        }}
      />

      {/* The live Example dialog (REA-video V01, measured 2026-10-23): the clip on black with Close at its top-left, the details column,
          and Previous/Next as round buttons at the viewport edges that stop at the first and last sample. Nothing here submits a job. */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} label="Chi tiết ví dụ" className="example-detail">
        {detail && (
          <>
            <div className="detail-media">
              <Preview key={detail.id} src={media(detail.src)} poster={media(detail.poster)} width={detail.width} height={detail.height} title={titleOf(detail)} />
            </div>
            {/* Before the details, so Tab meets Previous and Next first. Stepping onto an end hides the pressed button, so the focus moves to the other one. */}
            <button
              ref={prevStep}
              type="button"
              className="detail-step prev"
              aria-label="Ví dụ trước"
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
              aria-label="Ví dụ sau"
              hidden={detailAt >= examples.length - 1}
              onClick={() => {
                setDetail(examples[detailAt + 1]!);
                if (detailAt + 1 === examples.length - 1) prevStep.current?.focus();
              }}
            >
              <Icon name="right" size={18} />
            </button>
            <div className="detail-info">
              {/* As on Fash (checked 2026-10-29): the preset chip only for a sample made from a preset, then the model, and no title over the prompt. */}
              {details ? (
                detailPreset && (
                  <span className="detail-chip">
                    <img src={presetMedia(detailPreset.id).poster ?? media(detail.poster)} alt="" width={36} height={36} />
                    {detailPreset.label}
                  </span>
                )
              ) : (
                <span className="detail-chip">
                  <img src={media(exampleForPreset(detail.presetId, have)?.poster ?? detail.poster)} alt="" width={36} height={36} />
                  {presets?.find((p) => p.id === detail.presetId)?.label}
                </span>
              )}
              <h2 className={details ? 'sr-only' : undefined}>{titleOf(detail)}</h2>
              {detailModel && (
                <Tap on={() => pickModel(details!.modelId!, `Đã chọn mô hình ${detailModel}`)} label={`Dùng mô hình ${detailModel}`} className="detail-model">
                  {detailModel}
                </Tap>
              )}
              {details?.prompt && (
                <Tap on={() => copyPrompt(details.prompt!)} label="Chép vào ô mô tả" className="detail-prompt">
                  {details.prompt}
                </Tap>
              )}
              {details ? (
                <ul className="detail-inputs" aria-label="Ảnh đầu vào">
                  {details.images.map((i) => (
                    <li key={i.sample}>
                      <Tap on={() => void take(i)}>
                        <img className="detail-input" src={`/api/samples/${i.sample}`} alt={i.sample} width={48} height={48} />
                      </Tap>
                    </li>
                  ))}
                </ul>
              ) : (
                <img className="detail-input" src={media(detail.poster)} alt="Khung hình ví dụ" width={48} height={48} />
              )}
              <ul className="detail-pills" aria-label="Thông số">
                {details?.resolution && (
                  <li aria-label={`Độ phân giải ${details.resolution}`}>
                    <Tap on={detailModel ? () => pickModel(details.modelId!, `Đã chọn độ phân giải ${details.resolution}`) : undefined}>{details.resolution}</Tap>
                  </li>
                )}
                <li aria-label={`Thời lượng ${details?.durationSec ?? detail.durationSec} giây`}>
                  <Tap on={details?.durationSec ? () => apply({ durationSec: details.durationSec! }) : undefined}>{details?.durationSec ?? detail.durationSec}s</Tap>
                </li>
                <li aria-label={`Tỉ lệ ${details?.aspect ?? detail.aspect}`}>
                  <Tap on={details ? () => apply({ ratio: details.ratio }) : undefined}>{details?.aspect ?? detail.aspect}</Tap>
                </li>
              </ul>
              <div className="detail-foot">
                <p className="detail-date">{details ? fmtDate(details.date) : 'Ví dụ minh họa'}</p>
                <div className="detail-tools">
                  <a href={media(detail.src)} download aria-label="Tải video ví dụ" title="Tải video ví dụ">
                    <Icon name="download" />
                  </a>
                  <a href={media(detail.src)} target="_blank" rel="noreferrer" aria-label="Mở trong tab mới" title="Mở trong tab mới">
                    <Icon name="external" />
                  </a>
                </div>
                {details ? (
                  <button type="button" className="detail-use" onClick={() => (recreate(exampleFrom({ example: detail.id })!), narrow && setDetail(null))}>
                    <Icon name="copy" />
                    Dùng lại
                  </button>
                ) : (
                  <button type="button" className="detail-use" onClick={() => fillFromExample(detail)}>
                    <Icon name="copy" />
                    Dùng ví dụ này
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}
