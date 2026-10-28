'use client';
// Marketing Studio, in two formats. UGC Try On: a creator-style try-on video from two photos (the model, then the product), laid out like Try On.
// Advanced (/marketing-studio/advanced): 1 to 7 reference images, the member's brief, an optional script and the audio switch. Each composes one English
// prompt (lib/marketing.ts) and posts a `marketing` video job on a video model that lists the feature; Advanced adds params format and audio.
import { useRouter } from 'next/navigation';
import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ABOUT } from '@/lib/about-content';
import { api, errorText, sendJson } from '@/lib/api';
import { ADVANCED_MAX_IMAGES, ADVANCED_MAX_SCRIPT, advancedPrompt, briefRoom, HOOKS, LOCATIONS, type MarketingChoice, marketingPrompt } from '@/lib/marketing';
import { promptTooLong } from '@/lib/prompt-limit';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { useSamples } from '@/lib/use-samples';
import { cardSample } from '@/lib/examples';
import { About } from './About';
import { AudioSwitch } from './AudioSwitch';
import { CardMedia, LoopVideo } from './CardMedia';
import { Icon, type IconName } from './Icon';
import { Gallery, type Img, sampleFile, Slot, uploadImages, UPLOAD_ERROR, WorkTabs } from './image-tools';
import { useApplier, useHasHistory, useJobs, useRecreated } from './jobs';
import { Modal } from './Modal';
import { ModelPicker } from './ModelPicker';
import { Select } from './Select';
import { Tray } from './Shell';
import { Templates } from './Templates';
import { SuggestButton } from './Suggestions';

interface VideoModel {
  id: string;
  label: string;
  isMock: boolean;
  ratios: string[];
  durationsSec: number[];
  estimateUsd: string;
  /** The estimate with native audio on; null when the model cannot make audio. */
  audioEstimateUsd: string | null;
  maxImages: number;
  /** The model's prompt limit (the API caps it at PROMPT_CEILING). */
  maxPromptChars: number;
  supported: boolean;
  score: number;
  recommended: boolean;
}

/** The most hook variants one Run makes, one clip each. */
const MAX_VARIANTS = 3;

type Tab = 'create' | 'history' | 'examples' | 'about';
const TAB_LABEL: Record<Tab, string> = { create: 'Tạo', history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };
/** The ratios of the page, in the order of the menu; a model offers some of them. */
const RATIO_LABEL: Record<string, string> = { '9:16': '9:16 (dọc)', '16:9': '16:9 (ngang)', '1:1': '1:1 (vuông)' };

/** A box on the form that opens the list of choices; shows the chosen one. */
/** With `media` (the chosen choice's sample), a chosen box shows it full size under a name chip, as on Fash: its still, the loop only when there is no still. */
function ChoiceBox({ label, icon, value, media, onOpen, onClear }: { label: string; icon: IconName; value: string | undefined; media?: { video: string | null; poster: string | null }; onOpen: () => void; onClear: () => void }) {
  const filled = value !== undefined && media !== undefined && (media.video ?? media.poster) !== null;
  const labelId = useId();
  const valueId = useId();
  return (
    <div className="field">
      <button type="button" className="choice-box" data-filled={filled || undefined} aria-haspopup="dialog" aria-labelledby={`${labelId} ${valueId}`} onClick={onOpen}>
        {filled && <CardMedia video={media.poster ? null : media.video} poster={media.poster} />}
        <span className="slot-icon" aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
        <span id={labelId} className="choice-label">
          {label.replace(' (', '\n(') /* "(tuỳ chọn)" on its own line, as on Fash */}
        </span>
        <span id={valueId} className={value ? 'choice-value' : 'choice-value sr-only'}>
          {value ?? 'Chưa chọn'}
        </span>
      </button>
      {value !== undefined && (
        <button type="button" className="choice-clear" aria-label={`Bỏ ${label.replace(' (tuỳ chọn)', '')}`} onClick={onClear}>
          <Icon name="x" size={12} />
        </button>
      )}
    </div>
  );
}

/** The dialog of one list: cards with the choice's sample loop (`marketing-<kind>-<id>`) and name in a grid, the "no choice" card first. Arrows move the focus between the cards, Enter or Space picks, Escape closes. */
function ChoiceDialog({ open, title, sub, kind, choices, selected, onPick, onClose, footer }: { open: boolean; title: string; sub: string; kind: 'hook' | 'location'; choices: MarketingChoice[]; selected: string[]; onPick: (id: string) => void; onClose: () => void; footer?: ReactNode }) {
  const grid = useRef<HTMLDivElement>(null);
  const have = useSamples();
  // showModal (in Modal's effect, which runs first) focuses the close button, so the chosen card (else the first) takes the focus afterwards.
  useEffect(() => {
    if (open) (grid.current?.querySelector<HTMLElement>('[aria-selected=true]') ?? grid.current?.querySelector<HTMLElement>('[role=option]'))?.focus();
  }, [open]);
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in moves) && e.key !== 'Home' && e.key !== 'End') return;
    const cards = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=option]')];
    const at = cards.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? cards.length - 1 : (at + moves[e.key]! + cards.length) % cards.length;
    e.preventDefault();
    cards[next]?.focus();
  }
  return (
    <Modal open={open} onClose={onClose} label={title} className="choice-dialog">
      <h2>{title}</h2>
      <p className="modal-sub">{sub}</p>
      <div ref={grid} className="choice-grid" role="listbox" aria-label={title} onKeyDown={onKey}>
        {/* As on Fash, no "none" card: the X on the chosen box clears it. */}
        {choices.map((c, i) => (
          <button key={c.id} type="button" role="option" aria-selected={selected.includes(c.id)} tabIndex={(selected.length > 0 ? selected[0] === c.id : i === 0) ? 0 : -1} aria-label={c.name} aria-describedby={`${kind}-${c.id}-desc`} onClick={() => onPick(c.id)}>
            {open && <CardMedia {...cardSample(have, `marketing-${kind}-${c.id}`)} always />}
            <span className="choice-name">{c.name}</span>
            <span id={`${kind}-${c.id}-desc`} className="choice-desc">
              {c.desc}
            </span>
          </button>
        ))}
      </div>
      {footer}
    </Modal>
  );
}

/** A photo dialog of the model or product slot, as on Fash: the photos to pick, 4 per row of 3:4 portraits. The product dialog has a subtitle and an upload tile first; the model dialog is stock photos only, so its own-photo upload is a link in the header. */
function PhotoDialog({ open, title, sub, tiles, busy, onFile, onClose }: { open: boolean; title: string; sub?: string; tiles: { key: string; src: string; label: string; pick: () => void }[]; busy: boolean; onFile: (files: File[]) => void; onClose: () => void }) {
  const upload = (
    <>
      Tải lên ảnh của bạn
      <input type="file" accept="image/*" className="sr-only" onChange={(e) => (onClose(), onFile([...(e.target.files ?? [])].slice(0, 1)))} />
    </>
  );
  return (
    <Modal open={open} onClose={onClose} label={title} className="choice-dialog">
      <h2>{title}</h2>
      {sub && <p className="modal-sub">{sub}</p>}
      {!sub && <label className="photo-upload-link">{upload}</label>}
      <div className="choice-grid model-grid">
        {sub && (
          <label className="model-upload">
            <Icon name="plus" size={16} />
            {upload}
          </label>
        )}
        {tiles.map((t) => (
          <button key={t.key} type="button" aria-label={t.label} disabled={busy} onClick={() => (onClose(), t.pick())}>
            {open && <img src={t.src} alt="" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

const QUIET_REASONS = ['Tải lên ảnh người mẫu.', 'Tải lên ảnh sản phẩm.', 'Viết prompt mô tả video bạn muốn.'];

export type MarketingFormat = 'ugc' | 'advanced';
/** The formats of the live format picker, each with its page and sample loop; the ones not built yet say why they cannot be picked. */
const FORMATS = [
  { id: 'ugc', name: 'UGC Thử đồ', href: '/marketing-studio', soon: null },
  { id: 'advanced', name: 'Nâng cao', href: '/marketing-studio/advanced', soon: null },
  { id: 'unboxing', name: 'Mở hộp', href: null, soon: 'Sắp có' },
  { id: 'product-review', name: 'Đánh giá sản phẩm', href: null, soon: 'Sắp có' },
];

/** What the reuse link reads back from a Marketing Studio job (GET /api/jobs/:id), a saved template (GET /api/templates/:id) or a sample in Ví dụ (its details file, photos named as samples). */
interface MarketingJob {
  feature: string;
  format: string | null;
  images: (Img | { sample: string })[];
  hook: string | null;
  location: string | null;
  brief: string | null;
  script: string | null;
  audio: string | null;
  ratio: string | null;
  durationSec: number | null;
  modelId: string | null;
}

export function MarketingStudio({ format = 'ugc', reuse }: { format?: MarketingFormat; reuse?: string }) {
  const advanced = format === 'advanced';
  const router = useRouter();
  const have = useSamples();
  const { refresh, clips } = useJobs();
  const recreated = useRecreated();
  const narrow = useMediaQuery(NARROW);
  const [person, setPerson] = useState<Img[]>([]);
  const [product, setProduct] = useState<Img[]>([]);
  const [refs, setRefs] = useState<Img[]>([]);
  const [script, setScript] = useState('');
  const [audio, setAudio] = useState(true);
  /** The chosen hooks: one, or with variants on up to MAX_VARIANTS, one clip each. */
  const [hooks, setHooks] = useState<string[]>([]);
  const [many, setMany] = useState(false);
  const [location, setLocation] = useState('');
  const [picker, setPicker] = useState<'hook' | 'location' | 'format' | 'model' | 'product' | null>(null);
  /** The member's past UGC product photos (Fash's My Products), offered by the product slot. */
  const [myProducts, setMyProducts] = useState<Img[]>([]);
  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState('');
  const [ratio, setRatio] = useState('9:16');
  const [durationSec, setDurationSec] = useState(10);
  const apply = useApplier((s) => {
    if (s.ratio) setRatio(s.ratio);
    if (s.durationSec) setDurationSec(s.durationSec);
  });
  const [list, setList] = useState<{ key: string; models: VideoModel[]; defaultId: string | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (the form below 1024 px, else History or Examples)
  const opening: Tab = useHasHistory('marketing') ? 'history' : 'examples';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const promptId = useId();
  const scriptId = useId();
  const reasonId = useId();

  // The ratio and duration menus offer what any marketing model offers, so a model whose options differ from the chosen one's can still be picked;
  // switching to a model moves the ratio and the duration to that model's own when it lacks them.
  const models = list?.models ?? null;
  const chosen = models?.find((m) => m.id === modelId);
  const ratios = Object.keys(RATIO_LABEL).filter((r) => models?.some((m) => m.ratios.includes(r)));
  const durations = [...new Set(models?.flatMap((m) => m.durationsSec))].sort((a, b) => a - b);
  const key = `${ratio}/${durationSec}`;
  const fresh = list !== null && list.key === key;
  // Advanced: the slot takes up to the chosen model's reference cap (7 at most); a model that takes fewer images than are chosen cannot be picked.
  const maxRefs = Math.min(ADVANCED_MAX_IMAGES, chosen?.maxImages ?? ADVANCED_MAX_IMAGES);
  // Native audio is on by default in both formats, as on the reference site, on a model that can make it.
  const audioOn = audio && chosen?.audioEstimateUsd != null;
  const cost = audioOn ? chosen!.audioEstimateUsd! : chosen?.estimateUsd;
  const words = script.trim() ? script.trim().split(/\s+/).length : 0;
  /** The English prompt Run sends, shown as is under the form. */
  const variants = hooks.length > 0 ? hooks : [''];
  const composeFor = (hook: string, brief: string) =>
    advanced ? advancedPrompt({ brief, images: refs.length, hook, location, script, audio: audioOn }) : marketingPrompt({ hook, location, prompt: brief, audio: audioOn, ratio });
  const compose = (hook: string) => composeFor(hook, prompt);
  /** What the brief may take: the chosen model's limit less what the page adds around it, for the longest variant. */
  const room = chosen && Math.min(...variants.map((h) => briefRoom((b) => composeFor(h, b), chosen.maxPromptChars)));
  /** What a Run sends for each variant, in order. */
  const sent = variants.map(compose);
  const n = variants.length;
  /** The estimate of the whole Run, at the estimate's own precision. */
  const total = cost === undefined ? undefined : (Number(cost) * n).toFixed(cost.split('.')[1]?.length ?? 2);
  const hookName = (id: string) => HOOKS.find((c) => c.id === id)?.name ?? id;
  const name = FORMATS.find((f) => f.id === format)!.name;
  /** The sample photo and loop behind the format header, when an Admin uploaded them. */
  const photo = `marketing-format-${format}.jpg`;
  /** The stock model photos an Admin uploaded (`marketing-model-1.jpg`...), offered by the model slot as on Fash's Choose model dialog. */
  const stockModels = [...have].filter((n) => /^marketing-model-\d+\.(jpg|png|webp)$/.test(n)).sort((a, b) => parseInt(a.slice(16)) - parseInt(b.slice(16)));
  const loop = `marketing-format-${format}.mp4`;

  // Every model can be picked (the picker is told all are supported): switching moves the ratio and the duration to the model's own.
  function pickModel(m: VideoModel) {
    setModelId(m.id);
    const own = Object.keys(RATIO_LABEL).filter((r) => m.ratios.includes(r));
    if (own.length > 0 && !own.includes(ratio)) setRatio(own[0]!);
    const ownDurations = [...m.durationsSec].sort((a, b) => a - b);
    if (ownDurations.length > 0 && !ownDurations.includes(durationSec)) setDurationSec(ownDurations[0]!);
  }

  // The list (with the estimate for this duration) is fetched again when the ratio or the duration changes, or when the member retries after a failure.
  useEffect(() => {
    let stale = false;
    api<{ models: VideoModel[]; defaultModelId: string | null }>(`/api/models?feature=marketing&ratio=${encodeURIComponent(ratio)}&durationSec=${durationSec}`).then(
      (r) => !stale && (setList({ key, models: r.models, defaultId: r.defaultModelId }), setFailed(false)),
      () => !stale && setFailed(true),
    );
    return () => {
      stale = true;
    };
  }, [key, attempt]);

  // Reuse: refill the form from the source job, everything stays editable. A job of the other format opens on its own page; without the
  // member's own text (a job from before it was kept, or someone else's) the rest is refilled and the brief is asked for again.
  useEffect(() => {
    if (!reuse) return;
    let stale = false; // a refill superseded (another link, or a re-run effect) must not fill or upload
    api<MarketingJob>(reuse)
      .then(async (j) => {
        if (stale) return;
        if (j.feature !== 'marketing') return setError('Không tìm thấy clip để dùng lại.');
        if ((j.format === 'advanced') !== advanced) return router.replace(`/marketing-studio${j.format === 'advanced' ? '/advanced' : ''}${window.location.search}`);
        // A sample's photos are uploaded as this member's inputs first, as a picked sample is.
        const samples = j.images.map((i) => ('sample' in i ? i.sample : null)).filter((s) => s !== null);
        const inputs = samples.length > 0 ? await uploadImages(await Promise.all(samples.map(sampleFile))) : (j.images as Img[]);
        if (advanced) setRefs(inputs);
        else (setPerson(inputs.slice(0, 1)), setProduct(inputs.slice(1, 2)));
        setHooks(j.hook ? [j.hook] : []);
        setLocation(j.location ?? '');
        setPrompt(j.brief ?? '');
        setScript(j.script ?? '');
        setAudio(j.audio !== 'off');
        // A saved template may leave these out; the form's defaults stay.
        if (j.ratio) setRatio(j.ratio);
        if (j.durationSec) setDurationSec(j.durationSec);
        if (j.modelId) setModelId(j.modelId);
        if (j.brief === null && advanced) setNotice('Clip này không có mô tả gốc: đã điền lại ảnh và cài đặt, hãy nhập lại mô tả.');
        recreated(reuse);
      })
      .catch(() => setError('Không tìm thấy clip để dùng lại.'));
    return () => {
      stale = true;
    };
  }, [reuse]);

  // My products: loaded once; a failure just leaves the plain upload slot.
  useEffect(() => {
    if (advanced) return;
    api<{ assets: Img[] }>('/api/assets?recent=marketing-product').then(
      (r) => setMyProducts(r.assets),
      () => {},
    );
  }, [advanced]);

  // The first list picks the server's default model (the best of those that offer the starting ratio and duration), else the first; a model switched off since is replaced the same way.
  useEffect(() => {
    if (!list || list.models.some((m) => m.id === modelId)) return;
    const first = list.models.find((m) => m.id === list.defaultId) ?? list.models[0];
    if (first) pickModel(first);
  }, [list]);

  // The first thing that stops Run, in the order the form is filled; null when it can go. The prompt's length comes last.
  const formReason =
    failed
      ? 'Không tải được danh sách mô hình.'
      : !fresh || (models!.length > 0 && !chosen)
        ? 'Đang tải danh sách mô hình...'
        : models!.length === 0
          ? 'Marketing Studio chưa được Admin bật'
          : ratios.length === 0 || durations.length === 0
            ? 'Các mô hình này không có tỉ lệ hoặc thời lượng dùng được cho Marketing Studio.'
            : !chosen!.supported
              ? 'Mô hình này không có tỉ lệ hoặc thời lượng đã chọn. Chọn mô hình khác, hoặc đổi tỉ lệ hoặc thời lượng.'
              : advanced
                ? refs.length === 0
                  ? 'Tải lên ít nhất 1 ảnh tham chiếu.'
                  : refs.length > chosen!.maxImages
                    ? `Mô hình này nhận tối đa ${chosen!.maxImages} ảnh tham chiếu. Bỏ bớt ảnh hoặc chọn mô hình khác.`
                    : prompt.trim() === ''
                      ? 'Viết prompt mô tả video bạn muốn.'
                      : null
                : person.length === 0
                  ? 'Tải lên ảnh người mẫu.'
                  : product.length === 0
                    ? 'Tải lên ảnh sản phẩm.'
                    : null;
  const reason = formReason ?? promptTooLong(chosen, Math.max(...sent.map((s) => s.length)));
  /** Hook variants beyond the clips left today are refused before anything is sent. */
  const short = n > 1 && clips !== null && clips.today + n > clips.cap ? `Hôm nay bạn chỉ còn ${Math.max(0, clips.cap - clips.today)} clip; bỏ bớt biến thể hook.` : null;
  const canRun = reason === null && short === null && !busy;

  /** A stock model goes through the normal upload, like a file the member picked, so the job only ever holds the member's own assets. */
  async function pickStock(name: string) {
    const res = await fetch(`/api/samples/${name}`);
    if (res.ok) await add(setPerson)([new File([await res.blob()], name, { type: res.headers.get('content-type') ?? 'image/jpeg' })]);
    else setError(UPLOAD_ERROR);
  }

  /** Uploads the files into a slot: a one-image slot is replaced, the reference slot is added to, up to `max`. */
  function add(set: (f: (cur: Img[]) => Img[]) => void, max = 1) {
    return async (files: File[]) => {
      if (files.length === 0) return;
      setError('');
      setBusy(true);
      try {
        const assets = await uploadImages(files);
        set((cur) => [...(max > 1 ? cur : []), ...assets].slice(0, max));
      } catch {
        setError(UPLOAD_ERROR);
      } finally {
        setBusy(false);
      }
    };
  }

  /** One job per hook variant, sent one after another (the API takes one job per POST); a refused variant does not stop the rest. */
  async function run() {
    if (n > 1 && !window.confirm(`Tạo ${n} clip, mỗi hook một clip, tổng $${total}?`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    const sentOk: string[] = [];
    const refused: string[] = [];
    for (const [i, hook] of variants.entries()) {
      // The form's own inputs ride along in params so History can refill the form (reuse); the worker never reads them.
      const inputs = { ...(hook && { hook }), ...(location && { location }), ...(prompt.trim() && { brief: prompt.trim() }) };
      const body = advanced
        ? {
            feature: 'marketing',
            assetIds: refs.map((r) => r.id),
            modelId: chosen!.id,
            prompt: sent[i],
            ratio,
            durationSec,
            params: { format: 'advanced', audio: audioOn ? 'on' : 'off', ...inputs, ...(script.trim() && { script: script.trim() }) },
          }
        : { feature: 'marketing', assetIds: [person[0]!.id, product[0]!.id], modelId: chosen!.id, prompt: sent[i], ratio, durationSec, params: { audio: audioOn ? 'on' : 'off', ...inputs } };
      try {
        await api('/api/jobs', sendJson('POST', body));
        sentOk.push(hookName(hook));
      } catch (e) {
        refused.push(n > 1 ? `${hookName(hook)}: ${errorText(e, 'không gửi được')}` : errorText(e, 'Không gửi được job, hãy thử lại.'));
      }
    }
    if (sentOk.length > 0) {
      setNotice(n > 1 ? `Đã gửi ${sentOk.length}/${n} biến thể: ${sentOk.join(', ')}. Theo dõi trong tab "Lịch sử".` : 'Đã gửi job. Theo dõi trong tab "Lịch sử".');
      if (!narrow) setTab('history');
    }
    if (refused.length > 0) setError(n > 1 ? `Không gửi được ${refused.join('; ')}` : refused[0]!);
    await refresh();
    setBusy(false);
  }

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

        <div className="card form-card" id="marketing-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'marketing-tab-create' : undefined} hidden={narrow && shown !== 'create'}>
          <div className="form-scroll">
            <div className="app-head marketing-head" data-category="video" data-photo={have.has(photo) || undefined} style={have.has(photo) ? ({ '--photo': `url(/api/samples/${photo})` } as CSSProperties) : undefined}>
              {have.has(loop) && (
                <span className="head-loop">
                  <LoopVideo src={`/api/samples/${loop}`} poster={have.has(photo) ? `/api/samples/${photo}` : null} always />
                </span>
              )}
              <strong>{name}</strong>
              <button type="button" className="banner-chip" onClick={() => setPicker('format')}>
                <Icon name="edit" size={12} />
                Đổi định dạng
              </button>
            </div>
            <div className="app-slots marketing-slots" data-two="true">
              {advanced ? (
                <div className="slot-wide">
                  <Slot label="Ảnh tham chiếu" empty={`Tối đa ${maxRefs} ảnh tham chiếu`} inputLabel="Ảnh tham chiếu" images={refs} max={maxRefs} busy={busy} onAdd={add(setRefs, maxRefs)} onRemove={(id) => setRefs((cur) => cur.filter((r) => r.id !== id))} icon="plus" />
                </div>
              ) : (
                <>
                  <Slot label="Người mẫu" empty="Thêm 1 ảnh người mẫu" inputLabel="Ảnh người mẫu" images={person} max={1} busy={busy} onAdd={add(setPerson)} onRemove={() => setPerson([])} onBrowse={stockModels.length > 0 ? () => setPicker('model') : undefined} />
                  <Slot label="Sản phẩm" empty="Thêm 1 ảnh sản phẩm" inputLabel="Ảnh sản phẩm" images={product} max={1} busy={busy} onAdd={add(setProduct)} onRemove={() => setProduct([])} onBrowse={myProducts.length > 0 ? () => setPicker('product') : undefined} />
                </>
              )}
              <ChoiceBox label="Hook (tuỳ chọn)" icon="film" media={hooks[0] ? cardSample(have, `marketing-hook-${hooks[0]}`) : undefined} value={hooks.length === 0 ? undefined : hooks.length === 1 ? hookName(hooks[0]!) : `${hooks.length} biến thể: ${hooks.map(hookName).join(', ')}`} onOpen={() => setPicker('hook')} onClear={() => setHooks([])} />
              <ChoiceBox label="Bối cảnh (tuỳ chọn)" icon="sliders" media={location ? cardSample(have, `marketing-location-${location}`) : undefined} value={LOCATIONS.find((c) => c.id === location)?.name} onOpen={() => setPicker('location')} onClear={() => setLocation('')} />
            </div>

            <div className="field">
              <div className="field-head">
                <label htmlFor={promptId} className="field-label">
                  {advanced ? 'Prompt' : 'Prompt (tuỳ chọn)'}
                </label>
                <SuggestButton label="Gợi ý mô tả" ask={() => ({ field: 'brief', ...(advanced && { format: 'advanced' }), text: prompt, hook: hooks[0], location: location || undefined, ...(room !== undefined && { room }) })} onPick={setPrompt} />
              </div>
              <div className="prompt-box">
                <textarea id={promptId} value={prompt} maxLength={room} aria-required={advanced || undefined} placeholder="Mô tả video marketing bạn muốn…" onChange={(e) => setPrompt(e.target.value)} />
                <div className="prompt-foot">
                  <span>
                    {prompt.length}
                    {room !== undefined && `/${room}`}
                  </span>
                </div>
              </div>
            </div>
            {advanced && (
              <div className="field">
                <div className="field-head">
                  <label htmlFor={scriptId} className="field-label">
                    Lời thoại (tuỳ chọn)
                  </label>
                  <SuggestButton label="Gợi ý lời thoại" ask={() => ({ field: 'script', format: 'advanced', text: script || prompt, hook: hooks[0], location: location || undefined })} onPick={setScript} />
                </div>
                <div className="prompt-box">
                  <textarea id={scriptId} value={script} maxLength={ADVANCED_MAX_SCRIPT} placeholder="Viết lời thoại bạn muốn nhân vật nói (tuỳ chọn)…" onChange={(e) => setScript(e.target.value)} />
                  {/* Empty, the box is as short as the live page's; once lines are typed, their length in words, seconds (about two words a second, the About tab) and characters shows. */}
                  {script && (
                    <div className="prompt-foot script-foot">
                      <span>{words > 0 && `${words} từ, khoảng ${Math.ceil(words / 2)} giây`}</span>
                      <span>
                        {script.length}/{ADVANCED_MAX_SCRIPT}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="field-row">
              {models && ratios.length > 0 && (
                <Select label="Tỉ lệ" icon="ratio" heading="Chọn tỉ lệ" value={ratio} options={ratios.map((r) => ({ value: r, label: RATIO_LABEL[r]!, short: r }))} onChange={setRatio} />
              )}
              {models && durations.length > 0 && (
                <Select label="Thời lượng" icon="clock" heading="Chọn thời lượng" value={String(durationSec)} options={durations.map((d) => ({ value: String(d), label: `${d} giây` }))} onChange={(v) => setDurationSec(Number(v))} />
              )}
            </div>
            <AudioSwitch on={audio} available={chosen?.audioEstimateUsd != null} onChange={setAudio} />
            {models && models.length > 0 && <ModelPicker models={models.map((m) => ({ id: m.id, label: m.label, isMock: m.isMock, supported: !advanced || m.maxImages >= refs.length, estimateUsd: audio && m.audioEstimateUsd != null ? m.audioEstimateUsd : m.estimateUsd, score: m.score, recommended: m.recommended }))} value={chosen?.id ?? ''} onChange={(id) => pickModel(models.find((m) => m.id === id)!)} />}
            {/* Under the model, so the ratio row sits right under the prompt box as on Fash. */}
            <details className="prompt-preview">
              <summary>Xem prompt gửi đi</summary>
              {sent.map((p, i) => (
                <p key={variants[i] || 'none'} lang="en">
                  {n > 1 && <strong lang="vi">Biến thể {i + 1} ({hookName(variants[i]!)}): </strong>}
                  {p}
                </p>
              ))}
            </details>
            <Templates
              feature="marketing"
              data={() => ({
                images: (advanced ? refs : [...person, ...product]).map((i) => i.id),
                ...(advanced && { format: 'advanced', script: script.trim() }),
                hook: hooks[0],
                location,
                brief: prompt.trim(),
                audio: audio ? 'on' : 'off',
                ratio,
                durationSec,
                modelId: chosen?.id,
              })}
            />
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
                {n} biến thể, tổng ${total}: dùng {n} trong {clips.cap} clip mỗi ngày của bạn (hôm nay đã dùng {clips.today}).
              </p>
            )}
            {notice && <p role="status">{notice}</p>}
          </div>
          <div className="runbar">
            <button type="button" className="primary run" disabled={!canRun} aria-describedby={(reason ?? short) ? reasonId : undefined} onClick={() => void run()}>
              Tạo video
              {n > 1 && ` ${n} clip`}
              {chosen && <span className="run-cost">· {fresh ? `$${total}` : '…'}</span>} {/* the estimate is for the duration of the last list */}
            </button>
          </div>
        </div>

        <div className="side" id={`marketing-panel-${panel}`} role="tabpanel" aria-labelledby={`marketing-tab-${panel}`} hidden={narrow && shown === 'create'}>
          {shown === 'examples' ? (
            <Gallery kind="marketing" video samples="marketing-example-" label="Video Marketing Studio của công ty" emptyText="Chưa có video Marketing Studio nào trong công ty." />
          ) : shown === 'about' ? (
            <About page={advanced ? ABOUT.advanced : ABOUT.marketing} />
          ) : (
            <Tray feature="marketing" apply={apply} />
          )}
        </div>
      </div>

      <Modal open={picker === 'format'} onClose={() => setPicker(null)} label="Chọn định dạng" className="choice-dialog">
        <h2>Chọn định dạng</h2>
        <p className="modal-sub">Kiểu video marketing sẽ tạo. Hiện có UGC Thử đồ và Nâng cao; các định dạng khác sẽ có sau.</p>
        <div className="choice-grid">
          {FORMATS.map((f) => (
            <button key={f.id} type="button" aria-pressed={f.id === format} disabled={f.href === null} onClick={() => (setPicker(null), f.href && f.id !== format && router.push(f.href))}>
              {picker === 'format' && <CardMedia {...cardSample(have, `marketing-format-${f.id}`)} always />}
              <span className="choice-name">
                {f.name}
                {f.soon && <span className="badge-soon">{f.soon}</span>}
              </span>
            </button>
          ))}
        </div>
      </Modal>
      <PhotoDialog
        open={picker === 'model'}
        title="Chọn người mẫu"
        tiles={stockModels.map((name, i) => ({ key: name, src: `/api/samples/${name}`, label: `Người mẫu có sẵn ${i + 1}`, pick: () => void pickStock(name) }))}
        busy={busy}
        onFile={(files) => void add(setPerson)(files)}
        onClose={() => setPicker(null)}
      />
      <PhotoDialog
        open={picker === 'product'}
        title="Chọn sản phẩm"
        sub="Sản phẩm của tôi: các ảnh sản phẩm bạn đã dùng, hoặc tải lên ảnh mới."
        tiles={myProducts.map((a) => ({ key: a.id, src: `/api/assets/${a.id}/content`, label: `Dùng lại ${a.filename}`, pick: () => setProduct([a]) }))}
        busy={busy}
        onFile={(files) => void add(setProduct)(files)}
        onClose={() => setPicker(null)}
      />
      <ChoiceDialog open={picker === 'hook'} title="Chọn hook" sub="Cảnh mở đầu giữ chân người xem trong vài giây đầu. Có thể bỏ qua." kind="hook"
        choices={HOOKS}
        selected={hooks}
        onPick={(id) => (many && id ? setHooks((cur) => (cur.includes(id) ? cur.filter((h) => h !== id) : cur.length < MAX_VARIANTS ? [...cur, id] : cur)) : (setHooks(id ? [id] : []), setPicker(null)))}
        onClose={() => setPicker(null)}
        footer={
          <div className="variants">
            <label>
              <input type="checkbox" checked={many} onChange={(e) => (setMany(e.target.checked), !e.target.checked && setHooks((cur) => cur.slice(0, 1)))} />
              Tạo nhiều biến thể: tối đa {MAX_VARIANTS} hook, mỗi hook một clip
            </label>
            {many && (
              <button type="button" className="primary" onClick={() => setPicker(null)}>
                Xong ({hooks.length}/{MAX_VARIANTS})
              </button>
            )}
          </div>
        }
      />
      <ChoiceDialog open={picker === 'location'} title="Chọn bối cảnh" sub="Nơi người mẫu xuất hiện trong video. Có thể bỏ qua." kind="location" choices={LOCATIONS} selected={location ? [location] : []} onPick={(id) => (setLocation(id), setPicker(null))} onClose={() => setPicker(null)} />
    </section>
  );
}
