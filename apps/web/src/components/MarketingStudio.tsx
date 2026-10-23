'use client';
// Marketing Studio: a creator-style try-on video from two photos (the model, then the product), laid out like Try On. The page composes one English prompt
// from the hook, the location and the member's own text, and posts a `marketing` video job on a video model that lists the feature.
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { HOOKS, LOCATIONS, type MarketingChoice, marketingPrompt } from '@/lib/marketing';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
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
}

type Tab = 'create' | 'history' | 'examples' | 'about';
const TAB_LABEL: Record<Tab, string> = { create: 'Tạo', history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };
/** The ratios of the page, in the order of the menu; a model offers some of them. */
const RATIO_LABEL: Record<string, string> = { '9:16': '9:16 (dọc)', '16:9': '16:9 (ngang)', '1:1': '1:1 (vuông)' };
/** The fixed part of the composed prompt is about 550 characters and the API takes 2000. */
const MAX_PROMPT = 1400;

/** A box on the form that opens the list of choices; shows the chosen one. */
function ChoiceBox({ label, icon, choice, onOpen }: { label: string; icon: IconName; choice: MarketingChoice | undefined; onOpen: () => void }) {
  const labelId = useId();
  const valueId = useId();
  return (
    <div className="field">
      <span id={labelId} className="field-label">
        {label}
      </span>
      <button type="button" className="choice-box" aria-haspopup="dialog" aria-labelledby={`${labelId} ${valueId}`} onClick={onOpen}>
        <Icon name={icon} size={20} />
        <span id={valueId} className="choice-value">
          {choice ? choice.name : 'Chưa chọn'}
        </span>
      </button>
    </div>
  );
}

/** The dialog of one list: text cards in a grid, the "no choice" card first. Arrows move between the cards, Enter or Space picks, Escape closes. */
function ChoiceDialog({ open, title, choices, value, onPick, onClose }: { open: boolean; title: string; choices: MarketingChoice[]; value: string; onPick: (id: string) => void; onClose: () => void }) {
  const grid = useRef<HTMLDivElement>(null);
  // showModal (in Modal's effect, which runs first) focuses the close button, so the chosen card takes the focus afterwards.
  useEffect(() => {
    if (open) grid.current?.querySelector<HTMLElement>('[aria-checked=true]')?.focus();
  }, [open]);
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in moves) && e.key !== 'Home' && e.key !== 'End') return;
    const cards = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=radio]')];
    const at = cards.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? cards.length - 1 : (at + moves[e.key]! + cards.length) % cards.length;
    e.preventDefault();
    cards[next]?.focus();
  }
  const all: { id: string; name: string }[] = [{ id: '', name: 'Không chọn' }, ...choices];
  return (
    <Modal open={open} onClose={onClose} label={title} className="choice-dialog">
      <h2>{title}</h2>
      <div ref={grid} className="choice-grid" role="radiogroup" aria-label={title} onKeyDown={onKey}>
        {all.map((c) => (
          <button key={c.id || 'none'} type="button" role="radio" aria-checked={value === c.id} tabIndex={value === c.id ? 0 : -1} onClick={() => onPick(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function MarketingStudio() {
  const { refresh } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const [person, setPerson] = useState<Img[]>([]);
  const [product, setProduct] = useState<Img[]>([]);
  const [hook, setHook] = useState('');
  const [location, setLocation] = useState('');
  const [picker, setPicker] = useState<'hook' | 'location' | null>(null);
  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState('');
  const [wantRatio, setWantRatio] = useState('9:16');
  const [wantDuration, setWantDuration] = useState(10);
  const [list, setList] = useState<{ key: string; models: VideoModel[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (the form below 1024 px, else the examples)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const promptId = useId();
  const reasonId = useId();

  // The model stays while it is listed; the ratio and the duration fall back to the model's own first option, so the options always match the model.
  const models = list?.models ?? null;
  const chosen = models?.find((m) => m.id === modelId) ?? models?.[0];
  const ratios = chosen ? Object.keys(RATIO_LABEL).filter((r) => chosen.ratios.includes(r)) : [];
  const durations = chosen ? [...chosen.durationsSec].sort((a, b) => a - b) : [];
  const ratio = ratios.length > 0 && !ratios.includes(wantRatio) ? ratios[0]! : wantRatio;
  const durationSec = durations.length > 0 && !durations.includes(wantDuration) ? durations[0]! : wantDuration;
  const key = `${ratio}/${durationSec}`;

  // The list (with the estimate for this duration) is fetched again when the ratio or the duration changes.
  useEffect(() => {
    let stale = false;
    api<{ models: VideoModel[] }>(`/api/models?feature=marketing&ratio=${encodeURIComponent(ratio)}&durationSec=${durationSec}`).then(
      (r) => !stale && (setList({ key, models: r.models }), setFailed(false)),
      () => !stale && setFailed(true),
    );
    return () => {
      stale = true;
    };
  }, [key]);

  // The first thing that stops Run, in the order the form is filled; null when it can go.
  const reason =
    failed
      ? 'Không tải được danh sách mô hình.'
      : list === null || list.key !== key
        ? 'Đang tải danh sách mô hình...'
        : !chosen
          ? 'Marketing Studio chưa được Admin bật'
          : ratios.length === 0 || durations.length === 0
            ? 'Mô hình này không có tỉ lệ hoặc thời lượng dùng được cho Marketing Studio.'
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
            <div className="app-head" data-category="video">
              <strong>UGC Thử đồ</strong>
            </div>
            <div className="app-slots" data-two="true">
              <Slot label="Người mẫu" empty="Thêm 1 ảnh người mẫu" inputLabel="Ảnh người mẫu" images={person} max={1} busy={busy} onAdd={add(setPerson)} onRemove={() => setPerson([])} />
              <Slot label="Sản phẩm" empty="Thêm 1 ảnh sản phẩm" inputLabel="Ảnh sản phẩm" images={product} max={1} busy={busy} onAdd={add(setProduct)} onRemove={() => setProduct([])} />
              <ChoiceBox label="Hook (tuỳ chọn)" icon="preset" choice={HOOKS.find((c) => c.id === hook)} onOpen={() => setPicker('hook')} />
              <ChoiceBox label="Bối cảnh (tuỳ chọn)" icon="store" choice={LOCATIONS.find((c) => c.id === location)} onOpen={() => setPicker('location')} />
            </div>
            <p className="help">JPEG, PNG hoặc WebP. Chỉ tải lên ảnh mà công ty có quyền sử dụng.</p>

            <div className="field">
              <label htmlFor={promptId} className="field-label">
                Prompt (tuỳ chọn)
              </label>
              <div className="prompt-box">
                <textarea id={promptId} value={prompt} maxLength={MAX_PROMPT} placeholder="Mô tả video marketing bạn muốn…" onChange={(e) => setPrompt(e.target.value)} />
                <div className="prompt-foot">
                  <span>Tối đa {MAX_PROMPT} ký tự</span>
                  <span>
                    {prompt.length}/{MAX_PROMPT}
                  </span>
                </div>
              </div>
            </div>

            {models && models.length > 0 && <ModelPicker models={models.map((m) => ({ id: m.id, label: m.label, isMock: m.isMock, supported: m.supported, estimateUsd: m.estimateUsd }))} value={chosen?.id ?? ''} onChange={setModelId} />}
            {chosen && ratios.length > 0 && (
              <Select label="Tỉ lệ" icon="ratio" heading="Chọn tỉ lệ" value={ratio} options={ratios.map((r) => ({ value: r, label: RATIO_LABEL[r]! }))} onChange={setWantRatio} />
            )}
            {chosen && durations.length > 0 && (
              <Select label="Thời lượng" icon="clock" heading="Chọn thời lượng" value={String(durationSec)} options={durations.map((d) => ({ value: String(d), label: `${d} giây` }))} onChange={(v) => setWantDuration(Number(v))} />
            )}
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
            {notice && <p role="status">{notice}</p>}
          </div>
          <div className="runbar">
            <button type="button" className="primary run" disabled={!canRun} aria-describedby={reason ? reasonId : undefined} onClick={() => void run()}>
              Tạo video
              {chosen && <span className="run-cost">· ${chosen.estimateUsd}</span>}
            </button>
          </div>
        </div>

        <div className="side" id={`marketing-panel-${panel}`} role="tabpanel" aria-labelledby={`marketing-tab-${panel}`} hidden={narrow && shown === 'create'}>
          {shown === 'examples' ? (
            <Gallery kind="marketing" video label="Video Marketing Studio của công ty" emptyText="Chưa có video Marketing Studio nào trong công ty." />
          ) : shown === 'about' ? (
            <MarketingAbout />
          ) : (
            <Tray feature="marketing" />
          )}
        </div>
      </div>

      <ChoiceDialog open={picker === 'hook'} title="Chọn hook" choices={HOOKS} value={hook} onPick={(id) => (setHook(id), setPicker(null))} onClose={() => setPicker(null)} />
      <ChoiceDialog open={picker === 'location'} title="Chọn bối cảnh" choices={LOCATIONS} value={location} onPick={(id) => (setLocation(id), setPicker(null))} onClose={() => setPicker(null)} />
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
