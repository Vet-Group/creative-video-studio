'use client';
// One app of the Apps index, driven by its entry in lib/apps.ts: a card with the app's header, upload slots, fields and Run, beside the History and About tabs
// (laid out like Try On). An app that is not built yet shows why instead of the form.
import Link from 'next/link';
import { type CSSProperties, useEffect, useId, useRef, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { APPS, type AppConfig, appInputs, appReason, type AppCategory } from '@/lib/apps';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { useSamples } from '@/lib/use-samples';
import { Icon, type IconName } from './Icon';
import { type Img, RATIO_LABEL, Slot, uploadImages, UPLOAD_ERROR, useImageChoice, useImageModels, WorkTabs } from './image-tools';
import { useJobs } from './jobs';
import { ModelPicker } from './ModelPicker';
import { Select } from './Select';
import { Tray } from './Shell';

type Tab = 'create' | 'history' | 'about';
const TAB_LABEL: Record<Tab, string> = { create: 'Tạo', history: 'Lịch sử', about: 'Giới thiệu' };
const MAX_PROMPT = 1500;
const CATEGORY_ICON: Record<AppCategory, IconName> = { fashion: 'tryon', photo: 'image', video: 'create', utility: 'library' };

/** The picture of an app on a card and in the page header: a tinted tile with the icon of its category. */
export function AppArt({ app }: { app: AppConfig }) {
  const sample = `app-${app.slug}.jpg`;
  const have = useSamples();
  return (
    <span className="app-art" data-category={app.category} aria-hidden="true">
      {have.has(sample) ? <img src={`/api/samples/${sample}`} alt="" /> : <Icon name={CATEGORY_ICON[app.category]} size={36} />}
    </span>
  );
}

/** The change-app button of the header card and the list of apps it opens. */
function ChangeMenu({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
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
      <button ref={trigger} type="button" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen(!open)}>
        Đổi ứng dụng
        <Icon name={open ? 'up' : 'down'} size={12} />
      </button>
      {open && (
        <ul id={listId} className="app-change-list" aria-label="Ứng dụng">
          {APPS.map((a) => (
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

function AppHeader({ app }: { app: AppConfig }) {
  const photo = `app-${app.slug}.jpg`;
  const have = useSamples();
  return (
    <div className="app-head" data-category={app.category} data-photo={have.has(photo) || undefined} style={have.has(photo) ? ({ '--photo': `url(/api/samples/${photo})` } as CSSProperties) : undefined}>
      <strong>{app.name}</strong>
      <ChangeMenu current={app.slug} />
    </div>
  );
}

function AppForm({ app }: { app: AppConfig }) {
  const { refresh } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const [images, setImages] = useState<Img[][]>(() => app.slots.map(() => []));
  const [prompt, setPrompt] = useState('');
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (the form below 1024 px, else About)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const promptId = useId();
  const reasonId = useId();
  const { models, failed } = useImageModels(app.feature);
  const count = images.reduce((n, list) => n + list.length, 0);
  const pick = useImageChoice(models, Math.max(1, count));
  const { chosen } = pick;
  const reason = appReason(app, { images, prompt, models: chosen ? [chosen] : models === null ? null : [], failed });
  const canRun = reason === null && !busy;

  function add(slot: number) {
    return async (files: File[]) => {
      if (files.length === 0) return;
      setError('');
      setBusy(true);
      try {
        const assets = await uploadImages(files);
        setImages((cur) => cur.map((list, i) => (i === slot ? [...list, ...assets] : list)));
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
        feature: app.feature,
        modelId: pick.modelId,
        ...appInputs(app, { images, prompt }),
        ratio: pick.ratio,
        params: { resolution: pick.resolution },
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

  const tabs: Tab[] = narrow ? ['create', 'history', 'about'] : ['history', 'about'];
  const shown: Tab = narrow ? (tab ?? 'create') : tab === 'history' ? 'history' : 'about';
  const panel = shown === 'create' ? 'about' : shown;
  const two = app.slots.length === 2;

  return (
    <section aria-labelledby="app-title" className="create">
      <h1 id="app-title" className="sr-only">
        {app.name}
      </h1>
      <div className="create-grid">
        <WorkTabs prefix="app" tabs={tabs} labels={TAB_LABEL} shown={shown} onSelect={setTab} />

        <div className="card form-card" id="app-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'app-tab-create' : undefined} hidden={narrow && shown !== 'create'}>
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
                  max={1}
                  busy={busy}
                  onAdd={add(i)}
                  onRemove={(id) => setImages((cur) => cur.map((list, j) => (j === i ? list.filter((x) => x.id !== id) : list)))}
                />
              ))}
            </div>
            <p className="help">JPEG, PNG hoặc WebP. Chỉ tải lên ảnh mà công ty có quyền sử dụng.</p>

            {models && models.length > 1 && <ModelPicker models={pick.options} value={pick.modelId} onChange={pick.setModelId} />}

            {app.prompt && (
              <div className="field">
                <label htmlFor={promptId} className="field-label">
                  {app.prompt === 'background' ? 'Mô tả nền (tuỳ chọn)' : 'Prompt (tuỳ chọn)'}
                </label>
                <div className="prompt-box">
                  <textarea id={promptId} value={prompt} maxLength={MAX_PROMPT} placeholder={app.prompt === 'background' ? 'Ví dụ: quán cà phê ngoài trời đầy nắng, bàn đá cẩm thạch' : 'Mô tả điều bạn muốn thêm...'} onChange={(e) => setPrompt(e.target.value)} />
                  <div className="prompt-foot">
                    <span>Tối đa {MAX_PROMPT} ký tự</span>
                    <span>
                      {prompt.length}/{MAX_PROMPT}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {chosen && app.ratio && <Select label="Tỉ lệ" icon="ratio" heading="Chọn tỉ lệ" value={pick.ratio} options={chosen.ratios.map((r) => ({ value: r, label: RATIO_LABEL[r] ?? r }))} onChange={pick.setRatio} />}
            {chosen && app.resolution && <Select label="Độ phân giải" icon="preset" heading="Chọn độ phân giải" value={pick.resolution} options={chosen.resolutions.map((r) => ({ value: r, label: r }))} onChange={pick.setResolution} />}
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
              Chạy
              {pick.estimate !== undefined && <span className="run-cost">· ${pick.estimate}</span>}
            </button>
          </div>
        </div>

        <div className="side" id={`app-panel-${panel}`} role="tabpanel" aria-labelledby={`app-tab-${panel}`} hidden={narrow && shown === 'create'}>
          {shown === 'history' ? <Tray feature={app.feature} /> : <AppAbout app={app} />}
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

export function AppPage({ app }: { app: AppConfig }) {
  return app.soon ? <Soon app={app} text={app.soon} /> : <AppForm app={app} />;
}

function AppAbout({ app }: { app: AppConfig }) {
  const { title, intro, steps, notes } = app.about;
  return (
    <article className="about">
      <h2>{title}</h2>
      <p>{intro}</p>
      <p className="about-kicker">Từng bước</p>
      <ol className="about-steps">
        {steps.map(([lead, text]) => (
          <li key={lead}>
            <strong>{lead}</strong> {text}
          </li>
        ))}
      </ol>
      <p className="about-kicker">Lưu ý</p>
      <ul>
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </article>
  );
}
