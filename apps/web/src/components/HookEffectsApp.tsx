'use client';
// The hook effects app: one product photo and one of the effects (lib/apps.ts HOOK_EFFECTS; the Christmas ones only from 15 November to 31 December). The page sends the effect's fixed English prompt for a 5 s vertical clip
// whose end frame is the photo itself, on the one model the effect was probed on; the worker pads the photo to 9:16 and never crops it. Laid out like the other app
// pages (the form card beside History and About).
import { useEffect, useId, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { type AppConfig, HOOK_EFFECTS, HOOK_RATIO, HOOK_SECONDS, type HookEffect, hookEffectPrompt, hookReason } from '@/lib/apps';
import { cardSample } from '@/lib/examples';
import { inSeason } from '@/lib/prompt-starters';
import { confirmRun, sendRun, usd } from '@/lib/run-guard';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { useSamples } from '@/lib/use-samples';
import { FreeLeft } from './AllowanceBar';
import { AppAbout, AppHeader, AppHistoryArt, TAB_LABEL, type Tab } from './AppPage';
import { CardMedia } from './CardMedia';
import s from './HookEffectsApp.module.css';
import { copyError, FormNotice, type Img, Slot, uploadError, uploadImages, useReuse, WorkTabs } from './image-tools';
import { FormContext, useJobs } from './jobs';
import { Tray } from './Shell';

type HookTab = Exclude<Tab, 'examples'>;
const LABEL: Record<HookTab, string> = { create: TAB_LABEL.create, history: TAB_LABEL.history, about: TAB_LABEL.about };

interface HookModel {
  id: string;
  estimateUsd: string;
}

/** The effect picker: a radio tile per effect, the chosen one playing its loop and the others showing their still (a tile with no sample shows its label alone). */
export function EffectPicker({ effects, value, onChange }: { effects: HookEffect[]; value: string; onChange: (id: string) => void }) {
  const name = useId();
  const labelId = useId();
  const have = useSamples();
  return (
    <div className="field">
      <span id={labelId} className="field-label">
        Hiệu ứng
      </span>
      <div className={s.tiles} role="radiogroup" aria-labelledby={labelId}>
        {effects.map((e) => {
          const media = cardSample(have, `hook-effect-${e.id}`);
          const shown = e.id === value ? media : { video: null, poster: media.poster };
          return (
            <label key={e.id} className={s.tile}>
              <input type="radio" name={name} value={e.id} checked={e.id === value} onChange={() => onChange(e.id)} />
              {(shown.video || shown.poster) && (
                <span className={s.media} aria-hidden="true">
                  <CardMedia {...shown} />
                </span>
              )}
              <span className={s.name}>{e.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function HookEffectsApp({ app, reuse }: { app: AppConfig; reuse?: string }) {
  const { refresh } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const [photo, setPhoto] = useState<Img[]>([]);
  const [effects] = useState(() => inSeason(HOOK_EFFECTS)); // read once, so the picker does not change under the member at midnight
  const [effect, setEffect] = useState(effects[0]!.id);
  const [tab, setTab] = useState<HookTab | null>(null); // null: the default for the width (the form below 1024 px, else About)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [list, setList] = useState<{ models: HookModel[]; best: string | null; failed: boolean } | null>(null);
  const reasonId = useId();

  // The price and the model come from the effect's own endpoint, so the list is asked again when the effect changes.
  useEffect(() => {
    let live = true;
    setList(null);
    api<{ models: HookModel[]; defaultModelId: string | null }>(`/api/models?feature=${app.feature}&effect=${effect}&ratio=${HOOK_RATIO}&durationSec=${HOOK_SECONDS}&images=1&endFrame=1`).then(
      (r) => live && setList({ models: r.models, best: r.defaultModelId, failed: false }),
      () => live && setList({ models: [], best: null, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [effect]);

  // Dùng lại: the job's photo and effect. useReuse spreads the job into fill; if fill ever picks fields, `effect` is lost: e2e hook-effects.e2e.test.ts 'Dùng lại' guards it.
  const recreate = useReuse(
    reuse,
    app.feature,
    (j) => {
      if (j.images?.[0]) setPhoto([j.images[0]]);
      const wanted = 'effect' in j && typeof j.effect === 'string' ? j.effect : null;
      if (effects.some((e) => e.id === wanted)) setEffect(wanted!); // a Christmas effect out of season is not on the page
    },
    (e) => setError(copyError(e, 'Không tìm thấy lượt tạo để dùng lại.')),
  );

  const chosen = list?.models.find((m) => m.id === list.best);
  const reason = hookReason({ models: list && { count: list.models.length, best: list.best, failed: list.failed }, photo: photo.length > 0 });
  const canRun = reason === null && !busy;

  async function add(files: File[]) {
    if (files.length === 0) return;
    setError('');
    setBusy(true);
    try {
      setPhoto(await uploadImages(files.slice(0, 1)));
    } catch (e) {
      setError(uploadError(e));
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
      const body = {
        feature: app.feature, modelId: chosen!.id, assetIds: [photo[0]!.id], ratio: HOOK_RATIO, durationSec: HOOK_SECONDS, prompt: hookEffectPrompt(effect), params: { effect, endAssetId: photo[0]!.id },
      };
      if (!(await sendRun(body))) return;
      setNotice('Đã gửi lượt tạo. Theo dõi trong tab "Lịch sử".');
      if (!narrow) setTab('history');
    } catch (e) {
      setError(errorText(e, 'Không gửi được lượt tạo, hãy thử lại.'));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  const tabs: HookTab[] = narrow ? ['create', 'history', 'about'] : ['history', 'about'];
  const shown: HookTab = narrow ? (tab ?? 'create') : tab === 'history' ? tab : 'about';
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
            <Slot label="Sản phẩm" empty="Thêm 1 ảnh rõ nét của sản phẩm" inputLabel="Ảnh sản phẩm" images={photo} max={1} busy={busy} onAdd={(files) => void add(files)} onRemove={() => setPhoto([])} />
            <p className="help">Ảnh rõ nét, sản phẩm ở giữa, nền trơn. Ảnh không đúng khung dọc sẽ được thêm viền cùng màu nền, sản phẩm không bị cắt.</p>
            <p className="help">Chữ nhỏ trên sản phẩm có thể bị nhoè hoặc méo trong lúc hiệu ứng chạy.</p>
            <p className="help">Clip có sẵn âm thanh do mô hình tự tạo, có thể có tiếng nói; tắt tiếng khi ghép nếu không cần.</p>
            <EffectPicker effects={effects} value={effect} onChange={setEffect} />
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
            <FormNotice text={notice} onHistory={narrow ? () => setTab('history') : undefined} />
          </div>
          <div className="runbar">
            <FreeLeft />
            <button type="button" className="primary run" disabled={!canRun} aria-describedby={reason ? reasonId : undefined} onClick={() => void run()}>
              Chạy
              {busy ? <span className="run-cost">· Đang gửi…</span> : chosen && <span className="run-cost">· {usd(chosen.estimateUsd)}</span>}
            </button>
          </div>
        </div>

        <div className="side" id={`app-panel-${panel}`} role="tabpanel" aria-labelledby={`app-tab-${panel}`} hidden={narrow && shown === 'create'}>
          {shown === 'history' ? (
            <FormContext.Provider value={{ recreate: (from) => (recreate(from), narrow && setTab('create')) }}>
              <AppHistoryArt app={app}>
                <Tray feature={app.feature} />
              </AppHistoryArt>
            </FormContext.Provider>
          ) : (
            <AppAbout app={app} />
          )}
        </div>
      </div>
    </section>
  );
}
