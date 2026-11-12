'use client';
// The AI model generator: the member picks traits, the page builds the one fixed English prompt (lib/fashion-model.ts) and sends N text-to-image jobs; a result worth keeping
// is saved as a model (POST /api/fashion-models) that the person pickers of Try On, Image Generation and Create Videos offer. Laid out like the other app pages
// (the form card beside History and About), with a fourth tab for the saved models.
import { useId, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import type { AppConfig } from '@/lib/apps';
import { DEFAULT_FASHION_TRAITS, FASHION_OPTIONS, type FashionTraits, fashionModelName, fashionModelPrompt, MAX_EXTRA, mentionsMinor, MINOR_REASON, parseFashionTraits, withNiche } from '@/lib/fashion-model';
import { MAX_NAME } from '@/lib/fashion-models';
import { promptTooLong } from '@/lib/prompt-limit';
import { confirmRun } from '@/lib/run-guard';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { AppAbout, AppHeader, TAB_LABEL, type Tab } from './AppPage';
import s from './FashionModelApp.module.css';
import { FashionModelList } from './FashionModelList';
import { nearestOption, useImageChoice, useImageModels, WorkTabs } from './image-tools';
import { FormContext, useJobs } from './jobs';
import { Modal } from './Modal';
import { ModelPicker } from './ModelPicker';
import { PromptComposer } from './PromptComposer';
import { Select } from './Select';
import { Tray } from './Shell';

type FashionTab = Tab | 'models';
const LABEL: Record<FashionTab, string> = { ...TAB_LABEL, models: 'Đã lưu' };
const MAX_IMAGES = 4;
/** A price without trailing zeros: 0.0670 is $0.067. */
const usd = (n: number) => String(Number(n.toFixed(4)));

type Key = Exclude<keyof FashionTraits, 'extra'>;
const FIELDS: { key: Key; label: string }[] = [
  { key: 'gender', label: 'Giới tính' },
  { key: 'age', label: 'Độ tuổi' },
  { key: 'skinTone', label: 'Màu da' },
  { key: 'body', label: 'Dáng người' },
  { key: 'hair', label: 'Tóc' },
  { key: 'framing', label: 'Khung hình' },
  { key: 'background', label: 'Màu nền' },
  { key: 'expression', label: 'Biểu cảm' },
];

/** One trait as a row of radio chips. */
function Choice({ label, options, value, onChange }: { label: string; options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  const name = useId();
  const labelId = useId();
  return (
    <div className="field">
      <span id={labelId} className="field-label">
        {label}
      </span>
      <div className={`segmented theme-choice ${s.wrap}`} role="radiogroup" aria-labelledby={labelId}>
        {options.map((o) => (
          <label key={o.id}>
            <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

/** The name a save starts with: from the job's own traits, else a plain default. */
function savedName(json: string | null): string {
  try {
    const traits = parseFashionTraits(JSON.parse(json ?? 'null'));
    if (traits) return fashionModelName(traits);
  } catch {
    // unreadable traits: the default below
  }
  return 'Người mẫu AI';
}

export function FashionModelApp({ app, isAdmin }: { app: AppConfig; isAdmin: boolean }) {
  const { refresh } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const [traits, setTraits] = useState<FashionTraits>(DEFAULT_FASHION_TRAITS);
  const [count, setCount] = useState(2);
  const [tab, setTab] = useState<FashionTab | null>(null); // null: the default for the width (the form below 1024 px, else About)
  const [running, setRunning] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  /** The save dialog: the result's asset, and the name and sharing it starts with. */
  const [saving, setSaving] = useState<{ assetId: string; name: string; shared: boolean } | null>(null);
  const [saveError, setSaveError] = useState('');
  const [version, setVersion] = useState(0); // bumped when the saved models change, so the list and the pickers read them again
  const extraId = useId();
  const reasonId = useId();
  const nameId = useId();
  const { models, failed } = useImageModels(app.feature);
  // A job with no input image needs a model that makes a picture from words.
  const offered = models?.filter((m) => m.textToImage) ?? (models === null ? null : []);
  const pick = useImageChoice(offered, 0);
  const { chosen } = pick;
  const prompt = fashionModelPrompt(traits);
  const portrait = chosen?.ratios.filter((r) => r !== 'auto') ?? [];
  const ratio = portrait.length > 0 ? nearestOption(portrait, '3:4') : 'auto';
  const price = Number(pick.estimate ?? 0);
  const total = price * count;
  const reason = offered === null ? 'Đang tải danh sách mô hình...' : failed ? 'Không tải được danh sách mô hình.' : !chosen ? 'Ứng dụng này chưa được Admin bật' : promptTooLong(chosen, prompt.length);
  const minor = mentionsMinor(traits.extra);
  const canRun = reason === null && !minor && !running;
  const set = (key: Key) => (id: string) => setTraits((t) => ({ ...t, [key]: id }));

  async function run() {
    if (!(await confirmRun(total))) return;
    setRunning(true);
    setError('');
    setNotice('');
    let sent = 0;
    try {
      const body = { feature: app.feature, modelId: pick.modelId, assetIds: [], ratio, prompt, params: { resolution: pick.resolution, traits: JSON.stringify(traits) } };
      for (; sent < count; sent++) await api('/api/jobs', sendJson('POST', body));
      setNotice('Đã gửi lượt tạo. Theo dõi trong tab "Lịch sử".');
      if (!narrow) setTab('history');
    } catch (e) {
      setError(`${errorText(e, 'Không gửi được lượt tạo, hãy thử lại.')}${sent > 0 ? ` Đã gửi ${sent}/${count} ảnh.` : ''}`);
    } finally {
      setRunning(false);
      await refresh();
    }
  }

  async function save() {
    if (!saving) return;
    setSaveBusy(true);
    setSaveError('');
    try {
      await api('/api/fashion-models', sendJson('POST', { assetId: saving.assetId, name: saving.name.trim(), shared: saving.shared }));
      setSaving(null);
      setVersion((v) => v + 1);
      setNotice('Đã lưu người mẫu. Xem trong tab "Đã lưu".');
    } catch (e) {
      setSaveError(errorText(e, 'Không lưu được người mẫu, hãy thử lại.'));
    } finally {
      setSaveBusy(false);
    }
  }

  const tabs: FashionTab[] = narrow ? ['create', 'history', 'models', 'about'] : ['history', 'models', 'about'];
  const shown: FashionTab = narrow ? (tab ?? 'create') : tab === 'history' || tab === 'models' ? tab : 'about';
  const panel = shown === 'create' ? 'about' : shown;

  return (
    <section aria-labelledby="app-title" className="create app-page">
      <h1 id="app-title" className="sr-only">
        {app.name}
      </h1>
      <div className="create-grid">
        <WorkTabs prefix="app" tabs={tabs} labels={LABEL} shown={shown} onSelect={setTab} />

        <div className="card form-card" id="app-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'app-tab-create' : undefined} hidden={narrow && shown !== 'create'}>
          <div className="form-scroll">
            <AppHeader app={app} />
            <Select
              label="Phong cách (tuỳ chọn)"
              icon="preset"
              heading="Chọn phong cách"
              value={traits.niche}
              options={FASHION_OPTIONS.niche.map((n) => ({ value: n.id, label: n.label }))}
              onChange={(id) => setTraits((t) => withNiche(t, id))}
            />
            {FIELDS.slice(0, 2).map((f) => (
              <Choice key={f.key} label={f.label} options={FASHION_OPTIONS[f.key]} value={traits[f.key]} onChange={set(f.key)} />
            ))}
            <Select label="Nguồn gốc" icon="image" heading="Chọn nguồn gốc" value={traits.ethnicity} options={FASHION_OPTIONS.ethnicity.map((o) => ({ value: o.id, label: o.label }))} onChange={set('ethnicity')} />
            {FIELDS.slice(2).map((f) => (
              <Choice key={f.key} label={f.label} options={FASHION_OPTIONS[f.key]} value={traits[f.key]} onChange={set(f.key)} />
            ))}
            <PromptComposer
              id={extraId}
              label="Chi tiết thêm"
              optional
              feature={app.feature}
              value={traits.extra}
              onChange={(extra) => setTraits((t) => ({ ...t, extra }))}
              maxLength={MAX_EXTRA}
              onRun={() => canRun && void run()}
              placeholder="Ví dụ: có tàn nhang nhẹ, đeo khuyên tai nhỏ"
              parts={['clear']}
              starters={[]}
              ask={null}
            />
            <details className={s.prompt}>
              <summary>Xem mô tả gửi đi (tiếng Anh)</summary>
              <p>{prompt}</p>
            </details>

            {offered && offered.length > 1 && <ModelPicker models={pick.options} value={pick.modelId} onChange={pick.setModelId} />}

            <div className="field">
              <span id="fashion-count" className="field-label">
                Số ảnh
              </span>
              <div className={s.count} role="group" aria-labelledby="fashion-count">
                <button type="button" aria-label="Giảm số ảnh" disabled={count <= 1} onClick={() => setCount(count - 1)}>
                  −
                </button>
                <output aria-live="polite">{count}</output>
                <button type="button" aria-label="Tăng số ảnh" disabled={count >= MAX_IMAGES} onClick={() => setCount(count + 1)}>
                  +
                </button>
              </div>
              {chosen && (
                <p className={s.cost} role="status">
                  {count} ảnh × ${usd(price)} = ${usd(total)}
                </p>
              )}
            </div>
          </div>

          <div className="form-message">
            {(minor || reason) && (
              <p id={reasonId} className={minor ? 'error' : 'help'} role="status">
                {minor ? MINOR_REASON : reason}
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {pick.note && <p className="help" role="status">{pick.note}</p>}
            {notice && <p role="status">{notice}</p>}
          </div>
          <div className="runbar">
            <button type="button" className="primary run" disabled={!canRun} aria-describedby={minor || reason ? reasonId : undefined} onClick={() => void run()}>
              Chạy
              {chosen && <span className="run-cost">· ${usd(total)}</span>}
            </button>
          </div>
        </div>

        <div className="side" id={`app-panel-${panel}`} role="tabpanel" aria-labelledby={`app-tab-${panel}`} hidden={narrow && shown === 'create'}>
          {shown === 'history' && (
            <FormContext.Provider value={{ recreate: () => undefined, saveModel: (assetId, jobTraits) => (setSaveError(''), setSaving({ assetId, name: savedName(jobTraits), shared: false })) }}>
              <Tray feature={app.feature} />
            </FormContext.Provider>
          )}
          {shown === 'models' && <FashionModelList version={version} isAdmin={isAdmin} change={() => setVersion((v) => v + 1)} />}
          {(shown === 'about' || shown === 'create') && <AppAbout app={app} />}
        </div>
      </div>

      <Modal open={saving !== null} onClose={() => setSaving(null)} label="Lưu làm người mẫu" className="choice-dialog">
        <h2>Lưu làm người mẫu</h2>
        <label className="field-label" htmlFor={nameId}>
          Tên người mẫu
        </label>
        <input id={nameId} value={saving?.name ?? ''} maxLength={MAX_NAME} onChange={(e) => setSaving((cur) => cur && { ...cur, name: e.target.value })} />
        <label className="template-share">
          <input type="checkbox" checked={saving?.shared ?? false} onChange={(e) => setSaving((cur) => cur && { ...cur, shared: e.target.checked })} /> Dùng chung cho cả công ty
        </label>
        {saveError && (
          <p className="error" role="alert">
            {saveError}
          </p>
        )}
        <button type="button" className="primary" disabled={saveBusy || !saving?.name.trim()} onClick={() => void save()}>
          Lưu
        </button>
      </Modal>
    </section>
  );
}
