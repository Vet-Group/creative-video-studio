'use client';
// The run page of a custom app (an Admin's one-tap app made from a live clip, lib/custom-apps.ts): one photo slot per slot of the app, the settings it was made with, and Run.
// Everything else (the prompt, model, ratio, length) is the app's own and is neither sent nor shown: the server composes the job (POST /api/custom-apps/[id]/run).
import { useId, useState } from 'react';
import { api, ApiError, errorText, sendJson } from '@/lib/api';
import { hasDuplicate, type CustomAppConfig, CUSTOM_APP_CODE } from '@/lib/custom-apps';
import { confirmRun, usd } from '@/lib/run-guard';
import { useAppPrice } from '@/lib/use-app-price';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { FreeLeft } from './AllowanceBar';
import { AppArt, AppHeader, TAB_LABEL, type Tab } from './AppPage';
import { confirmDialog } from './Confirm';
import { FormNotice, type Img, RATIO_LABEL, Slot, uploadError, uploadImages, WorkTabs } from './image-tools';
import { useJobs } from './jobs';

/** The photos each app was last sent with in this page load, so the same ones again ask first, as run-guard.ts's sendRun does. */
const lastRuns = new Map<string, string>();

/** What a refused Run says: the run route's own Vietnamese refusal (`custom_app`), else the usual error text. */
export const runErrorText = (e: unknown): string => (e instanceof ApiError && e.code === CUSTOM_APP_CODE ? e.message : errorText(e, 'Không gửi được lượt tạo, hãy thử lại.'));

export function CustomAppForm({ app }: { app: CustomAppConfig }) {
  const { refresh, loading } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const price = useAppPrice(app);
  const reasonId = useId();
  const [images, setImages] = useState<Img[][]>(() => app.slots.map(() => []));
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { custom } = app;
  const ids = images.flat().map((i) => i.id);
  const empty = app.slots.findIndex((_, i) => images[i]!.length === 0);
  const reason = price.loading
    ? 'Đang tải giá...'
    : price.failed
      ? 'Không tải được danh sách mô hình.'
      : !price.row
        ? 'Mô hình của ứng dụng này đang tắt. Báo Admin để sửa.'
        : empty >= 0
          ? `Tải lên ảnh: ${app.slots[empty]!.label}.`
          : hasDuplicate(ids)
            ? 'Hai ô đang dùng cùng một ảnh: chọn ảnh khác.'
            : null;
  const canRun = reason === null && !busy;
  const setup = [price.row?.label, RATIO_LABEL[custom.ratio] ?? custom.ratio, app.feature === 'video' ? `${custom.durationSec} giây` : custom.resolution].filter(Boolean).join(' · ');

  const add = (slot: number) => async (files: File[]) => {
    if (files.length === 0) return;
    setError('');
    setBusy(true);
    try {
      const assets = await uploadImages(files).finally(loading('Đang tải lên…'));
      setImages((cur) => cur.map((list, i) => (i === slot ? [...list, ...assets] : list)));
    } catch (e) {
      setError(uploadError(e));
    } finally {
      setBusy(false);
    }
  };

  async function run() {
    if (!(await confirmRun(price.row?.usd, `Tạo lượt này với giá ${usd(price.row?.usd ?? 0)}?`))) return;
    const body = { assetIds: ids };
    const again = lastRuns.get(app.slug) === JSON.stringify(body);
    if (again && !(await confirmDialog({ title: 'Chạy lại đúng các cài đặt vừa gửi?', body: 'Bạn vừa gửi một lượt tạo y hệt. Lượt mới tạo thêm một kết quả và tính phí như lượt trước.', confirmLabel: 'Chạy lại' }))) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`/api/custom-apps/${app.slug}/run`, sendJson('POST', body));
      lastRuns.set(app.slug, JSON.stringify(body));
      setNotice('Đã gửi lượt tạo. Theo dõi trong khay Lượt tạo của tôi.');
      await refresh();
    } catch (e) {
      setError(runErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const tabs: Tab[] = narrow ? ['create', 'about'] : [];
  const shown: Tab = narrow ? (tab ?? 'create') : 'about';

  return (
    <section aria-labelledby="app-title" className="create app-page">
      <h1 id="app-title" className="sr-only">
        {app.name}
      </h1>
      <div className="create-grid">
        {narrow && <WorkTabs prefix="app" tabs={tabs} labels={TAB_LABEL} shown={shown} onSelect={setTab} />}

        <div className="card form-card" id="app-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'app-tab-create' : undefined} hidden={narrow && shown !== 'create'}>
          <div className="form-scroll">
            <AppHeader app={app} />
            <div className="app-slots" data-two={app.slots.length === 2}>
              {app.slots.map((s, i) => (
                <Slot
                  key={`${i}:${s.label}`}
                  label={s.label}
                  empty={s.empty}
                  inputLabel={s.inputLabel}
                  images={images[i]!}
                  max={1}
                  busy={busy}
                  onAdd={add(i)}
                  onRemove={(id) => setImages((cur) => cur.map((list, j) => (j === i ? list.filter((x) => x.id !== id) : list)))}
                  onPick={(img) => setImages((cur) => cur.map((list, j) => (j === i ? [img] : list)))}
                />
              ))}
            </div>
            <p className="help">Cài sẵn: {setup}</p>
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
            <FormNotice text={notice} />
          </div>
          <div className="runbar">
            <FreeLeft />
            <button type="button" className="primary run" disabled={!canRun} aria-describedby={reason ? reasonId : undefined} onClick={() => void run()}>
              Chạy
              {busy ? <span className="run-cost">· Đang gửi…</span> : price.row && <span className="run-cost">· {usd(price.row.usd)}</span>}
            </button>
          </div>
        </div>

        <div className="side" id="app-panel-about" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'app-tab-about' : undefined} hidden={narrow && shown === 'create'}>
          <AppArt app={app} page />
          <article className="about about-long">
            <h2>{app.name}</h2>
            {app.description && <p className="about-intro">{app.description}</p>}
          </article>
        </div>
      </div>
    </section>
  );
}
