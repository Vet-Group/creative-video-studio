'use client';
// Marketing Studio, in two formats. UGC Try On: a creator-style try-on video from two photos (the model, then the product), laid out like Try On.
// Advanced (/marketing-studio/advanced): 1 to 7 reference images, the member's brief, an optional script and the audio switch. Each composes one English
// prompt (lib/marketing.ts) and posts a `marketing` video job on a video model that lists the feature; Advanced adds params format and audio.
import { useRouter } from 'next/navigation';
import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ABOUT } from '@/lib/about-content';
import { api, errorText, sendJson } from '@/lib/api';
import { ADVANCED_MAX_IMAGES, ADVANCED_MAX_SCRIPT, advancedPrompt, briefRoom, HOOKS, LOCATIONS, MAX_CHOICE_DESC, MAX_CHOICE_NAME, MAX_CHOICE_PHRASE, type MarketingChoice, marketingPrompt } from '@/lib/marketing';
import { promptTooLong } from '@/lib/prompt-limit';
import { confirmRun, runKey } from '@/lib/run-guard';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { useRecall } from '@/lib/use-recall';
import { useSamples } from '@/lib/use-samples';
import { cardSample } from '@/lib/examples';
import { queryOf } from '@/lib/reuse';
import { About } from './About';
import { AudioSwitch } from './AudioSwitch';
import { CardMedia, LoopVideo } from './CardMedia';
import { Icon, type IconName } from './Icon';
import { Gallery, type Img, PhotoDialog, photoImg, sampleFile, Slot, uploadImages, UPLOAD_ERROR, WorkTabs } from './image-tools';
import { FormContext, type FormActions, type Photo, type PhotoRole, useApplier, useHasHistory, useJobs, useRecreated } from './jobs';
import { Modal } from './Modal';
import { ModelPicker } from './ModelPicker';
import { PromptTools } from './PromptTools';
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
  /** The output resolution, e.g. '1080p'. */
  resolution: string | null;
  /** Added in the last 14 days. */
  isNew: boolean;
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

/** GET /api/choices: the member's own hooks and locations and the company's, and the often-used ids (those the member used twice or more in 90 days). */
interface Choice extends MarketingChoice {
  isCompany: boolean;
  mine: boolean;
}
interface ChoiceLists {
  hooks: Choice[];
  locations: Choice[];
  often: { hook: string[]; location: string[] };
  /** Per often-used id, the poster of the member's latest clip with it. */
  posters: { hook: Record<string, string>; location: Record<string, string> };
  canShare: boolean;
}
const KIND_NAME = { hook: 'hook', location: 'bối cảnh' } as const;

/** What each kind is, and three filled examples a member can start from: the name and card line in Vietnamese, the scene for the model in English. */
const CHOICE_HELP = {
  hook: {
    intro: 'Hook là 1-2 giây mở đầu clip để giữ người xem lại. Đặt tên, tả ngắn bằng tiếng Việt, rồi viết điều xảy ra ở đầu clip bằng tiếng Anh.',
    name: 'Ví dụ: Mở hộp quà',
    desc: 'Ví dụ: Hộp quà bật mở, sản phẩm hiện ra',
    phrase: 'Ví dụ: The clip opens on a gift box that bursts open to reveal the product.',
    phraseHelp: 'Một câu tả điều xảy ra ở đầu clip. AI tạo video hiểu tiếng Anh tốt nhất.',
    examples: [
      { name: 'Mở hộp quà', desc: 'Hộp quà bật mở, sản phẩm hiện ra', phrase: 'The clip opens on a gift box that bursts open to reveal the product, and the creator reacts with delight.' },
      { name: 'Trước và sau', desc: 'Từ bộ đồ cũ sang bộ đồ mới trong một cú chuyển cảnh', phrase: 'The clip opens with the creator in a plain old outfit, then a quick snap transition reveals them in the new outfit.' },
      { name: 'Xoay một vòng', desc: 'Xoay một vòng khoe trọn bộ đồ', phrase: 'The clip opens with the creator spinning once to show the whole outfit, then stopping to face the camera.' },
    ],
  },
  location: {
    intro: 'Bối cảnh là nơi diễn ra clip. Đặt tên, tả ngắn bằng tiếng Việt, rồi viết nơi đó bằng tiếng Anh.',
    name: 'Ví dụ: Quán cà phê',
    desc: 'Ví dụ: Góc quán cà phê ấm cúng',
    phrase: 'Ví dụ: a cozy corner cafe with warm light',
    phraseHelp: 'Một cụm tả nơi chốn, không cần cả câu: prompt sẽ thành "Set in <cụm này>." AI tạo video hiểu tiếng Anh tốt nhất.',
    examples: [
      { name: 'Quán cà phê', desc: 'Góc quán cà phê ấm cúng', phrase: 'a cozy corner cafe with warm light' },
      { name: 'Bãi biển', desc: 'Bãi biển nắng vàng buổi chiều', phrase: 'a sunny beach in golden afternoon light' },
      { name: 'Cửa hàng thời trang', desc: 'Cửa hàng quần áo sáng sủa', phrase: 'a bright clothing boutique with racks of clothes behind' },
    ],
  },
} as const;

/** Add a hook or a location: a name, an optional card line and the English scene the prompt takes, saved to the member's account; an Admin may share it. An example fills all three. */
function AddChoice({ kind, canShare, onAdded }: { kind: 'hook' | 'location'; canShare: boolean; onAdded: (c: Choice) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phrase, setPhrase] = useState('');
  const [desc, setDesc] = useState('');
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ids = { name: useId(), phrase: useId(), desc: useId(), help: useId() };
  const help = CHOICE_HELP[kind];
  // The box wraps a long sentence; the prompt takes it on one line.
  const scene = phrase.replace(/\s+/g, ' ').trim();
  async function save() {
    setBusy(true);
    setError('');
    try {
      const c = await api<Omit<Choice, 'mine'>>('/api/choices', sendJson('POST', { kind, name: name.trim(), phrase: scene, ...(desc.trim() && { desc: desc.trim() }), ...(share && { isCompany: true }) }));
      setOpen(false);
      setName('');
      setPhrase('');
      setDesc('');
      setShare(false);
      onAdded({ ...c, mine: true });
    } catch (e) {
      setError(errorText(e, `Không lưu được ${KIND_NAME[kind]}, hãy thử lại.`));
    } finally {
      setBusy(false);
    }
  }
  if (!open) {
    return (
      <button type="button" className="link-button choice-add" onClick={() => setOpen(true)}>
        <Icon name="plus" size={12} /> Thêm {KIND_NAME[kind]}
      </button>
    );
  }
  return (
    <div className="choice-form" role="group" aria-label={`Thêm ${KIND_NAME[kind]}`}>
      <h3>Thêm {KIND_NAME[kind]} của bạn</h3>
      <p className="help">{help.intro}</p>
      <div className="choice-examples" role="group" aria-label="Điền thử một ví dụ">
        <span aria-hidden="true">Điền thử:</span>
        {help.examples.map((e) => (
          <button key={e.name} type="button" onClick={() => (setName(e.name), setDesc(e.desc), setPhrase(e.phrase))}>
            {e.name}
          </button>
        ))}
      </div>
      <label className="field-label" htmlFor={ids.name}>
        Tên
      </label>
      <input id={ids.name} value={name} maxLength={MAX_CHOICE_NAME} placeholder={help.name} autoFocus onChange={(e) => setName(e.target.value)} />
      <label className="field-label" htmlFor={ids.desc}>
        Mô tả ngắn (tuỳ chọn)
      </label>
      <input id={ids.desc} value={desc} maxLength={MAX_CHOICE_DESC} placeholder={help.desc} onChange={(e) => setDesc(e.target.value)} />
      <label className="field-label" htmlFor={ids.phrase}>
        Cảnh cho AI (tiếng Anh)
      </label>
      <textarea id={ids.phrase} lang="en" rows={3} value={phrase} maxLength={MAX_CHOICE_PHRASE} placeholder={help.phrase} aria-describedby={ids.help} onChange={(e) => setPhrase(e.target.value)} />
      <p id={ids.help} className="help">
        {/[À-ỹ]/.test(phrase) ? 'Có vẻ đây là tiếng Việt. Nên viết bằng tiếng Anh để AI hiểu đúng cảnh.' : help.phraseHelp}
      </p>
      {canShare && (
        <label className="template-share">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Chia sẻ cho cả công ty
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="choice-form-actions">
        <button type="button" onClick={() => setOpen(false)}>
          Huỷ
        </button>
        <button type="button" className="primary" disabled={busy || !name.trim() || !scene} onClick={() => void save()}>
          Lưu
        </button>
      </div>
    </div>
  );
}

/**
 * The dialog of one list: cards with the choice's sample loop (`marketing-<kind>-<id>`; without one, an often-used card shows the poster of the member's
 * latest clip with it) and name in a grid, the member's often-used group first when it has any. Arrows move the focus between the cards, Enter or Space picks, Escape closes. Below: the footer (the variants row), the add form, and the
 * member's own (for an Admin also the company's) with Xoá.
 */
function ChoiceDialog({ open, title, sub, kind, choices, often, posters, custom, canShare, selected, onPick, onAdded, onDelete, onClose, footer }: { open: boolean; title: string; sub: string; kind: 'hook' | 'location'; choices: MarketingChoice[]; often: string[]; posters: Record<string, string>; custom: Choice[]; canShare: boolean; selected: string[]; onPick: (id: string) => void; onAdded: (c: Choice) => void; onDelete: (c: Choice) => void; onClose: () => void; footer?: ReactNode }) {
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
  // Each card shows once: the often-used ones in their group, the rest after them.
  const top = often.flatMap((id) => choices.filter((c) => c.id === id));
  const rest = choices.filter((c) => !top.includes(c));
  const card = (c: MarketingChoice) => (
    <button key={c.id} type="button" role="option" aria-selected={selected.includes(c.id)} tabIndex={(selected.length > 0 ? selected[0] === c.id : c === (top[0] ?? rest[0])) ? 0 : -1} aria-label={c.name} aria-describedby={`${kind}-${c.id}-desc`} onClick={() => onPick(c.id)}>
      {open && <CardMedia {...cardSample(have, `marketing-${kind}-${c.id}`, posters[c.id] && !have.has(`marketing-${kind}-${c.id}.mp4`) ? `/api/assets/${posters[c.id]}/content` : null)} always />}
      <span className="choice-name">{c.name}</span>
      <span id={`${kind}-${c.id}-desc`} className="choice-desc">
        {c.desc}
      </span>
    </button>
  );
  const owned = custom.filter((c) => c.mine || (c.isCompany && canShare));
  const ownLabel = kind === 'hook' ? 'Hook của bạn' : 'Bối cảnh của bạn';
  return (
    <Modal open={open} onClose={onClose} label={title} className="choice-dialog">
      <h2>{title}</h2>
      <p className="modal-sub">{sub}</p>
      <div ref={grid} className="choice-grid" role="listbox" aria-label={title} onKeyDown={onKey}>
        {/* As on Fash, no "none" card: the X on the chosen box clears it. */}
        {top.length > 0 ? (
          <>
            <div role="group" aria-label="Hay dùng" className="choice-group">
              <p className="choice-group-title" aria-hidden="true">
                Hay dùng
              </p>
              {top.map(card)}
            </div>
            <div role="group" aria-label={`Tất cả ${KIND_NAME[kind]}`} className="choice-group">
              <p className="choice-group-title" aria-hidden="true">
                Tất cả {KIND_NAME[kind]}
              </p>
              {rest.map(card)}
            </div>
          </>
        ) : (
          rest.map(card)
        )}
      </div>
      {footer}
      <AddChoice kind={kind} canShare={canShare} onAdded={onAdded} />
      {owned.length > 0 && (
        <section className="choice-own" aria-label={ownLabel}>
          <h3>{ownLabel}</h3>
          <ul className="template-list">
            {owned.map((c) => (
              <li key={c.id}>
                <span>{c.name}</span>
                {c.isCompany && <span className="tag">Công ty</span>}
                <button type="button" className="link-button" aria-label={`Xoá ${KIND_NAME[kind]} ${c.name}`} onClick={() => onDelete(c)}>
                  Xoá
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
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
  const { refresh, clips, notify, loading } = useJobs();
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
  /** The member's own and the company's hooks and locations, and the often-used ids; null until loaded (the built-in ones show meanwhile). */
  const [custom, setCustom] = useState<ChoiceLists | null>(null);
  const [picker, setPicker] = useState<'hook' | 'location' | 'format' | 'model' | 'product' | null>(null);
  /** The member's past UGC product photos (Fash's My Products), offered by the product slot. */
  const [myProducts, setMyProducts] = useState<Img[]>([]);
  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState('');
  const [ratio, setRatio] = useState('9:16');
  const [durationSec, setDurationSec] = useState(10);
  // The member's last model and settings on this format, unless a refill opens the page; the list then follows the ratio and duration.
  const recall = useRecall(
    'marketing',
    (s) => {
      setModelId(s.modelId);
      if (s.ratio) setRatio(s.ratio);
      if (s.durationSec) setDurationSec(s.durationSec);
      if (s.audio !== null) setAudio(s.audio);
    },
    { format: advanced ? 'advanced' : undefined, skip: reuse !== undefined },
  );
  const apply = useApplier((s) => {
    recall.touch();
    if (s.ratio) setRatio(s.ratio);
    if (s.durationSec) setDurationSec(s.durationSec);
  });
  const [source, setSource] = useState(reuse ? { from: reuse } : null); // what the form refills from; Recreate sets a new one in place
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
  const hookList = [...HOOKS, ...(custom?.hooks ?? [])];
  const locationList = [...LOCATIONS, ...(custom?.locations ?? [])];
  const own = { hooks: custom?.hooks, locations: custom?.locations };
  const composeFor = (hook: string, brief: string) =>
    advanced ? advancedPrompt({ brief, images: refs.length, hook, location, script, audio: audioOn }, own) : marketingPrompt({ hook, location, prompt: brief, audio: audioOn, ratio }, own);
  const compose = (hook: string) => composeFor(hook, prompt);
  /** What the brief may take: the chosen model's limit less what the page adds around it, for the longest variant. */
  const room = chosen && Math.min(...variants.map((h) => briefRoom((b) => composeFor(h, b), chosen.maxPromptChars)));
  /** What a Run sends for each variant, in order. */
  const sent = variants.map(compose);
  const n = variants.length;
  /** The estimate of the whole Run, at the estimate's own precision. */
  const total = cost === undefined ? undefined : (Number(cost) * n).toFixed(cost.split('.')[1]?.length ?? 2);
  const hookName = (id: string) => hookList.find((c) => c.id === id)?.name ?? id;
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
    if (!source) return;
    const reuse = source.from;
    let stale = false; // a refill superseded (another link, or a re-run effect) must not fill or upload
    api<MarketingJob>(reuse)
      .then(async (j) => {
        if (stale) return;
        if (j.feature !== 'marketing') return setError('Không tìm thấy clip để dùng lại.');
        if ((j.format === 'advanced') !== advanced) return router.replace(`/marketing-studio${j.format === 'advanced' ? '/advanced' : ''}?${queryOf(reuse)}`);
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
      .catch(() => setError('Không tìm thấy clip để dùng lại.'))
      .finally(loading('Đang tải ảnh...'));
    return () => {
      stale = true;
    };
  }, [source]);

  const loadChoices = () => api<ChoiceLists>(`/api/choices${advanced ? '?format=advanced' : ''}`).then(setCustom, () => {}); // a failure leaves the built-in ones
  useEffect(() => void loadChoices(), [advanced]);
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
  async function removeChoice(c: Choice) {
    if (!window.confirm(`Xoá "${c.name}"?`)) return;
    try {
      await api(`/api/choices/${encodeURIComponent(c.id)}`, { method: 'DELETE' });
      await loadChoices();
    } catch (e) {
      notify(errorText(e, 'Không xoá được.'));
    }
  }
  const pickHook = (id: string) => (many && id ? setHooks((cur) => (cur.includes(id) ? cur.filter((h) => h !== id) : cur.length < MAX_VARIANTS ? [...cur, id] : cur)) : (setHooks(id ? [id] : []), setPicker(null)));

  // My products: loaded once; a failure just leaves the plain upload slot.
  useEffect(() => {
    if (advanced) return;
    api<{ assets: Img[] }>('/api/assets?recent=marketing-product').then(
      (r) => setMyProducts(r.assets),
      () => {},
    );
  }, [advanced]);

  // The first list picks the server's default model (the best of those that offer the starting ratio and duration), else the first; a model switched off since is replaced the same way.
  // It waits for the remembered model: a list that lands just before it would otherwise pick the default after it.
  useEffect(() => {
    if (!list || !recall.answered || list.models.some((m) => m.id === modelId)) return;
    const first = list.models.find((m) => m.id === list.defaultId) ?? list.models[0];
    if (first) pickModel(first);
  }, [list, recall.answered]);

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
  /** A detail's photo in its slot: on UGC the person or the product, on Advanced one more reference. */
  async function take(p: Photo, role: PhotoRole) {
    if (advanced && refs.length >= maxRefs) return notify(`Tối đa ${maxRefs} ảnh tham chiếu`);
    setError('');
    try {
      const img = await photoImg(p).finally(loading('Đang tải ảnh...'));
      if (advanced) setRefs((cur) => (cur.length < maxRefs ? [...cur, img] : cur));
      else if (role === 'model') setPerson([img]);
      else setProduct([img]);
      notify(advanced ? 'Đã thêm ảnh tham chiếu' : role === 'model' ? 'Đã dùng ảnh người mẫu' : 'Đã chọn ảnh sản phẩm');
    } catch {
      setError(UPLOAD_ERROR);
    }
  }
  const actions: FormActions = {
    recreate: (from) => (recall.touch(), setSource({ from }), narrow && setTab('create')),
    apply,
    photo: (p, role) => void take(p, role),
    prompt: (text) => (setPrompt(text), notify('Đã chép prompt')),
  };

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
    // One question: the variants one when there are several, else the price one from 1 USD.
    if (!(n > 1 ? window.confirm(`Tạo ${n} clip, mỗi hook một clip, tổng $${total}?`) : confirmRun(total))) return;
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
    void loadChoices(); // the often-used group counts this Run
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

        <div className="card form-card" id="marketing-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'marketing-tab-create' : undefined} hidden={narrow && shown !== 'create'} onPointerDownCapture={recall.touch} onKeyDownCapture={recall.touch}>
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
              <ChoiceBox label="Bối cảnh (tuỳ chọn)" icon="sliders" media={location ? cardSample(have, `marketing-location-${location}`) : undefined} value={locationList.find((c) => c.id === location)?.name} onOpen={() => setPicker('location')} onClear={() => setLocation('')} />
            </div>

            <div className="field">
              <div className="field-head">
                <label htmlFor={promptId} className="field-label">
                  {advanced ? 'Prompt' : 'Prompt (tuỳ chọn)'}
                </label>
                <PromptTools feature="marketing" format={advanced ? 'advanced' : undefined} value={prompt} onChange={setPrompt} maxLength={room} onRun={() => canRun && void run()} />
              </div>
              <div className="prompt-box">
                <textarea id={promptId} value={prompt} maxLength={room} aria-required={advanced || undefined} placeholder="Mô tả video marketing bạn muốn…" onChange={(e) => setPrompt(e.target.value)} onKeyDown={runKey(() => canRun && void run())} />
                {/* Gợi ý in the box's foot, as Create's Enhance pill: beside the label it pushed the head onto two lines. */}
                <div className="prompt-foot">
                  <SuggestButton label="Gợi ý mô tả" ask={() => ({ field: 'brief', ...(advanced && { format: 'advanced' }), text: prompt, hook: hooks[0], location: location || undefined, ...(room !== undefined && { room }) })} onPick={setPrompt} />
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
            {models && models.length > 0 && <ModelPicker models={models.map((m) => ({ id: m.id, label: m.label, isMock: m.isMock, supported: !advanced || m.maxImages >= refs.length, estimateUsd: audio && m.audioEstimateUsd != null ? m.audioEstimateUsd : m.estimateUsd, score: m.score, recommended: m.recommended, resolution: m.resolution, durationsSec: m.durationsSec, audio: m.audioEstimateUsd != null, isNew: m.isNew }))} value={chosen?.id ?? ''} onChange={(id) => pickModel(models.find((m) => m.id === id)!)} />}
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
            <FormContext.Provider value={actions}>
              <Gallery kind="marketing" video samples="marketing-example-" label="Video Marketing Studio của công ty" emptyText="Chưa có video Marketing Studio nào trong công ty." />
            </FormContext.Provider>
          ) : shown === 'about' ? (
            <About page={advanced ? ABOUT.advanced : ABOUT.marketing} />
          ) : (
            <FormContext.Provider value={actions}>
              <Tray feature="marketing" />
            </FormContext.Provider>
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
        choices={hookList}
        often={custom?.often.hook ?? []}
        posters={custom?.posters.hook ?? {}}
        custom={custom?.hooks ?? []}
        canShare={custom?.canShare ?? false}
        selected={hooks}
        onPick={pickHook}
        onAdded={(c) => added('hook', c)}
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
                Xong ({hooks.length}/{MAX_VARIANTS})
              </button>
            )}
          </div>
        }
      />
      <ChoiceDialog open={picker === 'location'} title="Chọn bối cảnh" sub="Nơi người mẫu xuất hiện trong video. Có thể bỏ qua." kind="location" choices={locationList} often={custom?.often.location ?? []} posters={custom?.posters.location ?? {}} custom={custom?.locations ?? []} canShare={custom?.canShare ?? false}
        selected={location ? [location] : []} onPick={(id) => (setLocation(id), setPicker(null))} onAdded={(c) => added('location', c)} onDelete={(c) => void removeChoice(c)} onClose={() => setPicker(null)} />
    </section>
  );
}
