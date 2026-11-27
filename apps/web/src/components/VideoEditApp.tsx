'use client';
// The video edit app: one of the member's clips (an upload or a History clip, as Motion Control takes its video) changed by one instruction, a quick edit that writes its
// English prompt (lib/apps.ts videoEditPrompt) or the member's own words, which Enhance turns into one English edit instruction. The cost follows the clip's length.
// Laid out like the other app pages (the form card beside History, Examples and About).
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { type AppConfig, EDIT_BACKGROUNDS, type EditKind, RECOLOR_COLORS, videoEditPrompt, videoEditReason } from '@/lib/apps';
import { GALLERY_SAMPLES } from '@/lib/examples';
import { promptTooLong } from '@/lib/prompt-limit';
import { confirmRun, sendRun, usd } from '@/lib/run-guard';
import { useDraftState } from '@/lib/use-draft';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { FreeLeft } from './AllowanceBar';
import { AppAbout, AppHeader, AppHistoryArt, TAB_LABEL, type Tab } from './AppPage';
import { EnhanceToggle } from './EnhanceToggle';
import { copyError, FormNotice, Gallery, type Img, uploadError, uploadImages, useReuse, WorkTabs } from './image-tools';
import { FormContext, useJobs } from './jobs';
import { PromptComposer } from './PromptComposer';
import { type RefVideo, ReferenceVideoSlot } from './ReferenceVideo';
import { Tray } from './Shell';

interface EditModel {
  id: string;
  label: string;
  estimateUsd: string;
  durationsSec: number[];
  maxPromptChars: number;
}

/** The kinds of edit, in the page's order. */
export const EDIT_KINDS: { id: EditKind; label: string }[] = [
  { id: 'color', label: 'Đổi màu áo' },
  { id: 'background', label: 'Đổi nền' },
  { id: 'own', label: 'Tự mô tả' },
];

/** One radio group of the page: native radios in the house's segmented chips, each label optionally led by its colour patch. */
function Choice({ label, name, items, value, onChange }: { label: string; name: string; items: { id: string; label: string; swatch?: string }[]; value: string; onChange: (id: string) => void }) {
  const labelId = useId();
  return (
    <div className="field">
      <span id={labelId} className="field-label">
        {label}
      </span>
      <div className="segmented theme-choice angle-choice" role="radiogroup" aria-labelledby={labelId}>
        {items.map((it) => (
          <label key={it.id}>
            <input type="radio" name={name} value={it.id} checked={value === it.id} onChange={() => onChange(it.id)} />
            {it.swatch && <span className="swatch" style={{ background: it.swatch }} aria-hidden="true" />}
            {it.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function VideoEditApp({ app, reuse, remake = false }: { app: AppConfig; reuse?: string; remake?: boolean }) {
  const { refresh, loading } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const [video, setVideo] = useState<RefVideo | null>(null);
  const [kind, setKind] = useState<EditKind>('color');
  const [color, setColor] = useState('');
  const [background, setBackground] = useState('');
  const [text, setText, clearDraft] = useDraftState(`app.${app.slug}`, reuse !== undefined);
  const [enhance, setEnhance] = useState(true); // on by default, as on Create: the member's words reach the model as one English instruction
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (the form below 1024 px, else About)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [answer, setAnswer] = useState<{ seconds: number; models: EditModel[]; best: string | null; failed: boolean } | null>(null);
  const names = useId();
  const promptId = useId();
  const reasonId = useId();
  // The estimate is per second of the clip, so the list is asked again for its length (5 s until a clip is chosen).
  const seconds = video ? Math.ceil(video.durationMs / 1000) : 5;
  useEffect(() => {
    let live = true;
    api<{ models: EditModel[]; defaultModelId: string | null }>(`/api/models?feature=${app.feature}&ratio=auto&durationSec=${seconds}&images=1`).then(
      (r) => live && setAnswer({ seconds, models: r.models, best: r.defaultModelId, failed: false }),
      () => live && setAnswer({ seconds, models: [], best: null, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [seconds]);
  // An answer for another length is still loading: its estimate would skip the price confirm of a longer clip.
  const list = answer?.seconds === seconds ? answer : null;

  // Dùng lại: the clip and the edit (the swatch, the backdrop, or the member's own words and Enhance).
  const recreate = useReuse(
    reuse,
    app.feature,
    (j) => {
      const clip = (j.images as (Img & { mime?: string; durationMs?: number | null })[] | undefined)?.find((i) => i.mime?.startsWith('video/'));
      if (clip) setVideo({ id: clip.id, filename: clip.filename, durationMs: clip.durationMs ?? 0 });
      if (j.color && RECOLOR_COLORS.some((c) => c.hex === j.color)) {
        setKind('color');
        setColor(j.color);
      } else if (j.background && EDIT_BACKGROUNDS.some((b) => b.value === j.background)) {
        setKind('background');
        setBackground(j.background);
      } else {
        setKind('own');
        setText(j.prompt ?? '');
        setEnhance(j.enhance ?? true);
      }
    },
    (e) => setError(copyError(e, 'Không tìm thấy video để dùng lại.')),
  );

  const chosen = list?.models.find((m) => m.id === list.best) ?? list?.models[0];
  const quick = kind === 'color' ? videoEditPrompt({ color }) : kind === 'background' ? videoEditPrompt({ background }) : undefined;
  const reason =
    videoEditReason({ model: list === null ? null : chosen, failed: list?.failed ?? false, videoMs: video?.durationMs ?? null, kind, picked: quick !== undefined, text }) ??
    (kind === 'own' ? promptTooLong(chosen, text.trim().length) : null);
  const canRun = reason === null && !busy;

  async function upload(file: File) {
    setError('');
    setBusy(true);
    try {
      const [v] = (await uploadImages([file], 'video').finally(loading('Đang tải lên…'))) as (Img & { durationMs: number | null })[];
      if (v) setVideo({ id: v.id, filename: v.filename, durationMs: v.durationMs ?? 0 });
    } catch (e) {
      setError(uploadError(e, 'video'));
    } finally {
      setBusy(false);
    }
  }

  // A History clip is copied as the member's own input, as Motion Control's video is.
  async function copyVideo(assetId: string) {
    setError('');
    setBusy(true);
    try {
      const [v] = (await api<{ assets: RefVideo[] }>('/api/assets/copy', sendJson('POST', { assetId }))).assets;
      if (v) setVideo({ id: v.id, filename: v.filename, durationMs: v.durationMs });
    } catch (e) {
      setError(copyError(e, 'Không dùng được video này.'));
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
        feature: app.feature, modelId: chosen!.id, assetIds: [video!.id], ratio: 'auto',
        ...(quick !== undefined ? { prompt: quick, params: kind === 'color' ? { color } : { background } } : { prompt: text.trim(), enhance }),
      };
      if (!(await sendRun(body))) return;
      if (kind === 'own') clearDraft();
      setNotice('Đã gửi lượt tạo. Theo dõi trong tab "Lịch sử".');
      if (!narrow) setTab('history');
      await refresh();
    } catch (e) {
      setError(errorText(e, 'Không gửi được lượt tạo, hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  const tabs: Tab[] = [...(narrow ? (['create'] as const) : []), 'history', 'examples', 'about'];
  const shown: Tab = narrow ? (tab ?? 'create') : tab === 'history' || tab === 'examples' ? tab : 'about';
  const panel = shown === 'create' ? 'about' : shown;

  return (
    <AppHistoryArt app={app}>
      <section aria-labelledby="app-title" className="create app-page">
        <h1 id="app-title" className="sr-only">
          {app.name}
        </h1>
        <div className="create-grid">
          <WorkTabs prefix="app" tabs={tabs} labels={TAB_LABEL} shown={shown} onSelect={setTab} />

          <div className="card form-card" id="app-panel-create" role={narrow ? 'tabpanel' : undefined} aria-labelledby={narrow ? 'app-tab-create' : undefined} hidden={narrow && shown !== 'create'}>
            <div className="form-scroll">
              <AppHeader app={app} />
              {/* Owners mixed it up with Smart Remake (2026-11-27): each form points to the other; this one only while Smart Remake's flags are on. */}
              {remake && (
                <p className="help">
                  Muốn đặt đúng sản phẩm của bạn, kể cả hình in, vào video? Dùng <Link href="/apps/smart-remake">Smart Remake</Link>.
                </p>
              )}
              <ReferenceVideoSlot
                label="Video cần sửa"
                optional={false}
                fileLabel="Tệp video cần sửa"
                hint="Thêm 1 video MP4 hoặc MOV dài 3 đến 15 giây, mỗi cạnh từ 720 px, tối đa 20 MB"
                video={video}
                busy={busy}
                onFile={(file) => void upload(file)}
                onHistory={(id) => void copyVideo(id)}
                onRemove={() => setVideo(null)}
              />
              <p className="help">Video kết quả dài bằng video gốc và giữ âm thanh gốc. Chỉ tải lên video mà công ty có quyền sử dụng.</p>

              <Choice label="Kiểu sửa" name={`${names}-kind`} items={EDIT_KINDS} value={kind} onChange={(id) => setKind(id as EditKind)} />
              {kind === 'color' && <Choice label="Màu áo mới" name={`${names}-color`} items={RECOLOR_COLORS.map((c) => ({ id: c.hex, label: c.label, swatch: c.hex }))} value={color} onChange={setColor} />}
              {kind === 'background' && <Choice label="Nền mới" name={`${names}-background`} items={EDIT_BACKGROUNDS.map((b) => ({ id: b.value, label: b.label }))} value={background} onChange={setBackground} />}
              {kind === 'color' && <p className="help">AI đổi màu áo, giữ nguyên hình in, chữ, người, chuyển động và nền. Chữ nhỏ có thể bị nhoè ở vài khung hình.</p>}
              {kind === 'own' && (
                <PromptComposer
                  id={promptId}
                  label="Mô tả thay đổi"
                  feature={app.feature}
                  value={text}
                  onChange={setText}
                  maxLength={chosen?.maxPromptChars}
                  onRun={() => canRun && void run()}
                  placeholder="Ví dụ: đổi chiếc cốc trên bàn thành màu xanh lá, giữ nguyên mọi thứ khác"
                  parts={['clear', 'expand']}
                  enhance={<EnhanceToggle on={enhance} onChange={setEnhance} />}
                  starters={[]}
                  required
                />
              )}
              {kind === 'own' && <p className="help">Mỗi lần chỉ sửa một thứ. Chưa thêm được chữ vào video: hãy chèn chữ khi dựng.</p>}
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
                {/* Before a clip the price is per second (the 5 s estimate over 5), then the clip's total. */}
                {busy ? <span className="run-cost">· Đang gửi…</span> : chosen && <span className="run-cost">· {video ? usd(chosen.estimateUsd) : `${usd(Number(chosen.estimateUsd) / seconds)}/giây`}</span>}
              </button>
            </div>
          </div>

          <div className="side" id={`app-panel-${panel}`} role="tabpanel" aria-labelledby={`app-tab-${panel}`} hidden={narrow && shown === 'create'}>
            <FormContext.Provider value={{ recreate: (from) => (recreate(from), narrow && setTab('create')) }}>
              {shown === 'history' ? (
                <Tray feature={app.feature} />
              ) : shown === 'examples' ? (
                <Gallery kind={app.feature} video samples={GALLERY_SAMPLES.video_edit} cols={[2, 2, 3]} label={`Video ${app.name.toLowerCase()} của công ty`} emptyText={`Chưa có video ${app.name.toLowerCase()} nào trong công ty.`} />
              ) : (
                <AppAbout app={app} />
              )}
            </FormContext.Provider>
          </div>
        </div>
      </section>
    </AppHistoryArt>
  );
}
