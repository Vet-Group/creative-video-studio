'use client';
// Marketing Studio: a creator-style try-on video from two photos (the model, then the product), laid out like Try On. The page composes one English prompt
// from the hook, the location and the member's own text, and posts a `marketing` video job on a video model that lists the feature.
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { HOOKS, LOCATIONS, type MarketingChoice, marketingPrompt } from '@/lib/marketing';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { useSamples } from '@/lib/use-samples';
import { cardSample } from '@/lib/examples';
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

/** The sample photo behind the format header, when an Admin uploaded one. */
const UGC_PHOTO = 'marketing-format-ugc.jpg';
const UGC_LOOP = 'marketing-format-ugc.mp4';
/** The formats of the live format picker, each with its sample loop; only UGC try-on is built, the others say why they cannot be picked. */
const FORMATS = [
  { id: 'ugc', name: 'UGC Thử đồ', soon: null },
  { id: 'advanced', name: 'Nâng cao', soon: 'Sắp có' },
  { id: 'unboxing', name: 'Mở hộp', soon: 'Sắp có' },
  { id: 'product-review', name: 'Đánh giá sản phẩm', soon: 'Sắp có' },
];

export function MarketingStudio() {
  const have = useSamples();
  const { refresh } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const [person, setPerson] = useState<Img[]>([]);
  const [product, setProduct] = useState<Img[]>([]);
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
  const reasonId = useId();

  // The ratio and duration menus offer what any marketing model offers, so a model whose options differ from the chosen one's can still be picked;
  // switching to a model moves the ratio and the duration to that model's own when it lacks them.
  const models = list?.models ?? null;
  const chosen = models?.find((m) => m.id === modelId);
  const ratios = Object.keys(RATIO_LABEL).filter((r) => models?.some((m) => m.ratios.includes(r)));
  const durations = [...new Set(models?.flatMap((m) => m.durationsSec))].sort((a, b) => a - b);
  const key = `${ratio}/${durationSec}`;
  const fresh = list !== null && list.key === key;

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
              : person.length === 0
                ? 'Tải lên ảnh người mẫu.'
                : product.length === 0
                  ? 'Tải lên ảnh sản phẩm.'
                  : null;
  const canRun = reason === null && !busy;

  function add(set: (f: (cur: Img[]) => Img[]) => void) {
    return async (files: File[]) => {
      if (files.length === 0) return;
      setError('');
      setBusy(true);
      try {
        const assets = await uploadImages(files);
        set(() => assets.slice(0, 1));
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
      const body = {
        feature: 'marketing',
        assetIds: [person[0]!.id, product[0]!.id],
        modelId: chosen!.id,
        prompt: marketingPrompt({ hook, location, prompt }),
        ratio,
        durationSec,
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
            <div className="app-head marketing-head" data-category="video" data-photo={have.has(UGC_PHOTO) || undefined} style={have.has(UGC_PHOTO) ? ({ '--photo': `url(/api/samples/${UGC_PHOTO})` } as CSSProperties) : undefined}>
              {have.has(UGC_LOOP) && (
                <span className="head-loop">
                  <LoopVideo src={`/api/samples/${UGC_LOOP}`} poster={have.has(UGC_PHOTO) ? `/api/samples/${UGC_PHOTO}` : null} />
                </span>
              )}
              <strong>UGC Thử đồ</strong>
              <button type="button" className="banner-chip" onClick={() => setPicker('format')}>
                <Icon name="edit" size={12} />
                Đổi định dạng
              </button>
            </div>
            <div className="app-slots marketing-slots" data-two="true">
              <Slot label="Người mẫu" empty="Thêm 1 ảnh người mẫu" inputLabel="Ảnh người mẫu" images={person} max={1} busy={busy} onAdd={add(setPerson)} onRemove={() => setPerson([])} />
              <Slot label="Sản phẩm" empty="Thêm 1 ảnh sản phẩm" inputLabel="Ảnh sản phẩm" images={product} max={1} busy={busy} onAdd={add(setProduct)} onRemove={() => setProduct([])} />
              <ChoiceBox label="Hook (tuỳ chọn)" icon="film" choice={HOOKS.find((c) => c.id === hook)} onOpen={() => setPicker('hook')} />
              <ChoiceBox label="Bối cảnh (tuỳ chọn)" icon="sliders" choice={LOCATIONS.find((c) => c.id === location)} onOpen={() => setPicker('location')} />
            </div>

            <div className="field">
              <label htmlFor={promptId} className="field-label">
                Prompt (tuỳ chọn)
              </label>
              <div className="prompt-box">
                <textarea id={promptId} value={prompt} maxLength={MAX_PROMPT} placeholder="Mô tả video marketing bạn muốn…" onChange={(e) => setPrompt(e.target.value)} />
                <div className="prompt-foot">
                  <span>
                    {prompt.length}/{MAX_PROMPT}
                  </span>
                </div>
              </div>
            </div>

            <div className="field-row">
              {models && ratios.length > 0 && (
                <Select label="Tỉ lệ" icon="ratio" heading="Chọn tỉ lệ" value={ratio} options={ratios.map((r) => ({ value: r, label: RATIO_LABEL[r]!, short: r }))} onChange={setRatio} />
              )}
              {models && durations.length > 0 && (
                <Select label="Thời lượng" icon="clock" heading="Chọn thời lượng" value={String(durationSec)} options={durations.map((d) => ({ value: String(d), label: `${d} giây` }))} onChange={(v) => setDurationSec(Number(v))} />
              )}
            </div>
            {models && models.length > 0 && <ModelPicker models={models.map((m) => ({ id: m.id, label: m.label, isMock: m.isMock, supported: true, estimateUsd: m.estimateUsd, score: m.score, recommended: m.recommended }))} value={chosen?.id ?? ''} onChange={(id) => pickModel(models.find((m) => m.id === id)!)} />}
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
              {chosen && <span className="run-cost">· {fresh ? `$${chosen.estimateUsd}` : '…'}</span>} {/* the estimate is for the duration of the last list */}
            </button>
          </div>
        </div>

        <div className="side" id={`marketing-panel-${panel}`} role="tabpanel" aria-labelledby={`marketing-tab-${panel}`} hidden={narrow && shown === 'create'}>
          {shown === 'examples' ? (
            <Gallery kind="marketing" video samples="marketing-example-" label="Video Marketing Studio của công ty" emptyText="Chưa có video Marketing Studio nào trong công ty." />
          ) : shown === 'about' ? (
            <MarketingAbout />
          ) : (
            <Tray feature="marketing" />
          )}
        </div>
      </div>

      <Modal open={picker === 'format'} onClose={() => setPicker(null)} label="Chọn định dạng" className="choice-dialog">
        <h2>Chọn định dạng</h2>
        <p className="modal-sub">Kiểu video marketing sẽ tạo. Hiện có UGC Thử đồ; các định dạng khác sẽ có sau.</p>
        <div className="choice-grid">
          {FORMATS.map((f) => (
            <button key={f.id} type="button" aria-pressed={f.id === 'ugc'} disabled={f.soon !== null} onClick={() => setPicker(null)}>
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

function MarketingAbout() {
  return (
    <article className="about">
      <h2>UGC Thử đồ: video kiểu người sáng tạo nội dung</h2>
      <p>Tải ảnh một người mẫu và ảnh sản phẩm, và nhận lại một video dọc quay bằng điện thoại, người đó mặc hoặc dùng sản phẩm. Video nằm trong Thư viện của công ty, mục Marketing Studio.</p>

      <p className="about-kicker">Từng bước</p>
      <h3>Một lần chạy gồm những gì</h3>
      <ol className="about-steps">
        <li>
          <strong>Người mẫu và sản phẩm.</strong> Mỗi bên một ảnh, người mẫu trước, sản phẩm sau. Ảnh rõ mặt và rõ sản phẩm cho kết quả tốt hơn.
        </li>
        <li>
          <strong>Hook (tuỳ chọn).</strong> Cách video mở đầu, ví dụ mở hộp hoặc soi gương. Chọn Không chọn nếu muốn để mô hình tự quyết.
        </li>
        <li>
          <strong>Bối cảnh (tuỳ chọn).</strong> Nơi video diễn ra, ví dụ phòng ngủ hoặc quán cà phê.
        </li>
        <li>
          <strong>Prompt (tuỳ chọn).</strong> Thêm một hai câu về điều bạn muốn thấy; nó được ghép vào cuối chỉ dẫn cố định của ứng dụng.
        </li>
        <li>
          <strong>Mô hình, tỉ lệ, thời lượng.</strong> Chỉ hiện các mô hình đã được bật cho Marketing Studio. Nút chạy ghi chi phí ước tính, tính như trang Tạo video.
        </li>
      </ol>

      <p className="about-kicker">Giới hạn</p>
      <h3>Điều chưa có</h3>
      <ul>
        <li>Hiện chỉ có định dạng UGC Thử đồ. Các định dạng khác của Marketing Studio, như viết kịch bản, chọn giọng đọc hay dựng nhiều cảnh, chưa được xây dựng.</li>
        <li>Video dùng chung ngân sách với Tạo video: hạn mức theo ngày, theo tháng của bạn và của công ty. Chạy làm vượt hạn mức sẽ bị từ chối.</li>
        <li>Chỉ dùng ảnh công ty có quyền sử dụng, và chỉ với người đã đồng ý.</li>
      </ul>
    </article>
  );
}
