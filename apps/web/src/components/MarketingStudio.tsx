'use client';
// Marketing Studio, in two formats. UGC Try On: a creator-style try-on video from two photos (the model, then the product), laid out like Try On.
// Advanced (/marketing-studio/advanced): 1 to 7 reference images, the member's brief, an optional script and the audio switch. Each composes one English
// prompt (lib/marketing.ts) and posts a `marketing` video job on a video model that lists the feature; Advanced adds params format and audio.
import { useRouter } from 'next/navigation';
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { ABOUT } from '@/lib/about-content';
import { api, errorText, sendJson } from '@/lib/api';
import { ADVANCED_MAX_BRIEF, ADVANCED_MAX_IMAGES, ADVANCED_MAX_SCRIPT, advancedPrompt, HOOKS, LOCATIONS, type MarketingChoice, marketingPrompt } from '@/lib/marketing';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { useSamples } from '@/lib/use-samples';
import { cardSample } from '@/lib/examples';
import { About } from './About';
import { AudioSwitch } from './AudioSwitch';
import { CardMedia, LoopVideo } from './CardMedia';
import { Icon, type IconName } from './Icon';
import { Gallery, type Img, Slot, uploadImages, UPLOAD_ERROR, WorkTabs } from './image-tools';
import { useJobs } from './jobs';
import { Modal } from './Modal';
import { ModelPicker } from './ModelPicker';
import { Select } from './Select';
import { Tray } from './Shell';

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
  supported: boolean;
  score: number;
  recommended: boolean;
}

type Tab = 'create' | 'history' | 'examples' | 'about';
const TAB_LABEL: Record<Tab, string> = { create: 'Tạo', history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };
/** The ratios of the page, in the order of the menu; a model offers some of them. */
const RATIO_LABEL: Record<string, string> = { '9:16': '9:16 (dọc)', '16:9': '16:9 (ngang)', '1:1': '1:1 (vuông)' };
/** The fixed part of the composed prompt is about 290 characters (about 460 with the longest hook and location) and the API takes 2000; 1400 leaves room. */
const MAX_PROMPT = 1400;

/** A box on the form that opens the list of choices; shows the chosen one. */
function ChoiceBox({ label, icon, choice, onOpen }: { label: string; icon: IconName; choice: MarketingChoice | undefined; onOpen: () => void }) {
  const labelId = useId();
  const valueId = useId();
  return (
    <div className="field">
      <button type="button" className="choice-box" aria-haspopup="dialog" aria-labelledby={`${labelId} ${valueId}`} onClick={onOpen}>
        <span className="slot-icon" aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
        <span id={labelId} className="choice-label">
          {label.replace(' (', '\n(') /* "(tuỳ chọn)" on its own line, as on Fash */}
        </span>
        <span id={valueId} className={choice ? 'choice-value' : 'choice-value sr-only'}>
          {choice ? choice.name : 'Chưa chọn'}
        </span>
      </button>
    </div>
  );
}

/** The dialog of one list: cards with the choice's sample loop (`marketing-<kind>-<id>`) and name in a grid, the "no choice" card first. Arrows move the focus between the cards, Enter or Space picks, Escape closes. */
function ChoiceDialog({ open, title, sub, kind, choices, value, onPick, onClose }: { open: boolean; title: string; sub: string; kind: 'hook' | 'location'; choices: MarketingChoice[]; value: string; onPick: (id: string) => void; onClose: () => void }) {
  const grid = useRef<HTMLDivElement>(null);
  const have = useSamples();
  // showModal (in Modal's effect, which runs first) focuses the close button, so the chosen card takes the focus afterwards.
  useEffect(() => {
    if (open) grid.current?.querySelector<HTMLElement>('[aria-selected=true]')?.focus();
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
  const all: { id: string; name: string }[] = [{ id: '', name: 'Không chọn' }, ...choices];
  return (
    <Modal open={open} onClose={onClose} label={title} className="choice-dialog">
      <h2>{title}</h2>
      <p className="modal-sub">{sub}</p>
      <div ref={grid} className="choice-grid" role="listbox" aria-label={title} onKeyDown={onKey}>
        {all.map((c) => (
          <button key={c.id || 'none'} type="button" role="option" aria-selected={value === c.id} tabIndex={value === c.id ? 0 : -1} onClick={() => onPick(c.id)}>
            {c.id && open && <CardMedia {...cardSample(have, `marketing-${kind}-${c.id}`)} />}
            <span className="choice-name">{c.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export type MarketingFormat = 'ugc' | 'advanced';
/** The formats of the live format picker, each with its page and sample loop; the ones not built yet say why they cannot be picked. */
const FORMATS = [
  { id: 'ugc', name: 'UGC Thử đồ', href: '/marketing-studio', soon: null },
  { id: 'advanced', name: 'Nâng cao', href: '/marketing-studio/advanced', soon: null },
  { id: 'unboxing', name: 'Mở hộp', href: null, soon: 'Sắp có' },
  { id: 'product-review', name: 'Đánh giá sản phẩm', href: null, soon: 'Sắp có' },
];

export function MarketingStudio({ format = 'ugc' }: { format?: MarketingFormat }) {
  const advanced = format === 'advanced';
  const router = useRouter();
  const have = useSamples();
  const { refresh } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const [person, setPerson] = useState<Img[]>([]);
  const [product, setProduct] = useState<Img[]>([]);
  const [refs, setRefs] = useState<Img[]>([]);
  const [script, setScript] = useState('');
  const [audio, setAudio] = useState(true);
  const [hook, setHook] = useState('');
  const [location, setLocation] = useState('');
  const [picker, setPicker] = useState<'hook' | 'location' | 'format' | null>(null);
  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState('');
  const [ratio, setRatio] = useState('9:16');
  const [durationSec, setDurationSec] = useState(10);
  const [list, setList] = useState<{ key: string; models: VideoModel[]; defaultId: string | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (the form below 1024 px, else the examples)
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
  const name = FORMATS.find((f) => f.id === format)!.name;
  /** The sample photo and loop behind the format header, when an Admin uploaded them. */
  const photo = `marketing-format-${format}.jpg`;
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

  // The first list picks the server's default model (the best of those that offer the starting ratio and duration), else the first; a model switched off since is replaced the same way.
  useEffect(() => {
    if (!list || list.models.some((m) => m.id === modelId)) return;
    const first = list.models.find((m) => m.id === list.defaultId) ?? list.models[0];
    if (first) pickModel(first);
  }, [list]);

  // The first thing that stops Run, in the order the form is filled; null when it can go.
  const reason =
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
  const canRun = reason === null && !busy;

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

  async function run() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = advanced
        ? {
            feature: 'marketing',
            assetIds: refs.map((r) => r.id),
            modelId: chosen!.id,
            prompt: advancedPrompt({ brief: prompt, images: refs.length, hook, location, script, audio: audioOn }),
            ratio,
            durationSec,
            params: { format: 'advanced', audio: audioOn ? 'on' : 'off' },
          }
        : { feature: 'marketing', assetIds: [person[0]!.id, product[0]!.id], modelId: chosen!.id, prompt: marketingPrompt({ hook, location, prompt, audio: audioOn }), ratio, durationSec, params: { audio: audioOn ? 'on' : 'off' } };
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
  const shown: Tab = narrow ? (tab ?? 'create') : tab === 'history' || tab === 'about' ? tab : 'examples';
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
                  <LoopVideo src={`/api/samples/${loop}`} poster={have.has(photo) ? `/api/samples/${photo}` : null} />
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
                  <Slot label="Người mẫu" empty="Thêm 1 ảnh người mẫu" inputLabel="Ảnh người mẫu" images={person} max={1} busy={busy} onAdd={add(setPerson)} onRemove={() => setPerson([])} />
                  <Slot label="Sản phẩm" empty="Thêm 1 ảnh sản phẩm" inputLabel="Ảnh sản phẩm" images={product} max={1} busy={busy} onAdd={add(setProduct)} onRemove={() => setProduct([])} />
                </>
              )}
              <ChoiceBox label="Hook (tuỳ chọn)" icon="film" choice={HOOKS.find((c) => c.id === hook)} onOpen={() => setPicker('hook')} />
              <ChoiceBox label="Bối cảnh (tuỳ chọn)" icon="sliders" choice={LOCATIONS.find((c) => c.id === location)} onOpen={() => setPicker('location')} />
            </div>

            <div className="field">
              <label htmlFor={promptId} className="field-label">
                {advanced ? 'Prompt' : 'Prompt (tuỳ chọn)'}
              </label>
              <div className="prompt-box">
                <textarea id={promptId} value={prompt} maxLength={advanced ? ADVANCED_MAX_BRIEF : MAX_PROMPT} aria-required={advanced || undefined} placeholder="Mô tả video marketing bạn muốn…" onChange={(e) => setPrompt(e.target.value)} />
                <div className="prompt-foot">
                  <span>
                    {prompt.length}/{advanced ? ADVANCED_MAX_BRIEF : MAX_PROMPT}
                  </span>
                </div>
              </div>
            </div>
            {advanced && (
              <div className="field">
                <label htmlFor={scriptId} className="field-label">
                  Lời thoại (tuỳ chọn)
                </label>
                <div className="prompt-box">
                  <textarea id={scriptId} value={script} maxLength={ADVANCED_MAX_SCRIPT} placeholder="Viết lời thoại bạn muốn nhân vật nói (tuỳ chọn)…" onChange={(e) => setScript(e.target.value)} />
                  <div className="prompt-foot script-foot">
                    {/* About two spoken words per second (the About tab), so the lines can be matched to the duration. */}
                    <span>{words > 0 && `${words} từ, khoảng ${Math.ceil(words / 2)} giây`}</span>
                    <span>
                      {script.length}/{ADVANCED_MAX_SCRIPT}
                    </span>
                  </div>
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
          </div>

          <div className="form-message">
            {reason && (
              <p id={reasonId} className="help" role="status">
                {reason}
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
            {notice && <p role="status">{notice}</p>}
          </div>
          <div className="runbar">
            <button type="button" className="primary run" disabled={!canRun} aria-describedby={reason ? reasonId : undefined} onClick={() => void run()}>
              Tạo video
              {chosen && <span className="run-cost">· {fresh ? `$${cost}` : '…'}</span>} {/* the estimate is for the duration of the last list */}
            </button>
          </div>
        </div>

        <div className="side" id={`marketing-panel-${panel}`} role="tabpanel" aria-labelledby={`marketing-tab-${panel}`} hidden={narrow && shown === 'create'}>
          {shown === 'examples' ? (
            <Gallery kind="marketing" video samples="marketing-example-" label="Video Marketing Studio của công ty" emptyText="Chưa có video Marketing Studio nào trong công ty." />
          ) : shown === 'about' ? (
            <About page={advanced ? ABOUT.advanced : ABOUT.marketing} />
          ) : (
            <Tray feature="marketing" />
          )}
        </div>
      </div>

      <Modal open={picker === 'format'} onClose={() => setPicker(null)} label="Chọn định dạng" className="choice-dialog">
        <h2>Chọn định dạng</h2>
        <p className="modal-sub">Kiểu video marketing sẽ tạo. Hiện có UGC Thử đồ và Nâng cao; các định dạng khác sẽ có sau.</p>
        <div className="choice-grid">
          {FORMATS.map((f) => (
            <button key={f.id} type="button" aria-pressed={f.id === format} disabled={f.href === null} onClick={() => (setPicker(null), f.href && f.id !== format && router.push(f.href))}>
              {picker === 'format' && <CardMedia {...cardSample(have, `marketing-format-${f.id}`)} />}
              <span className="choice-name">
                {f.name}
                {f.soon && <span className="badge-soon">{f.soon}</span>}
              </span>
            </button>
          ))}
        </div>
      </Modal>
      <ChoiceDialog open={picker === 'hook'} title="Chọn hook" sub="Cảnh mở đầu giữ chân người xem trong vài giây đầu. Có thể bỏ qua." kind="hook" choices={HOOKS} value={hook} onPick={(id) => (setHook(id), setPicker(null))} onClose={() => setPicker(null)} />
      <ChoiceDialog open={picker === 'location'} title="Chọn bối cảnh" sub="Nơi người mẫu xuất hiện trong video. Có thể bỏ qua." kind="location" choices={LOCATIONS} value={location} onPick={(id) => (setLocation(id), setPicker(null))} onClose={() => setPicker(null)} />
    </section>
  );
}
