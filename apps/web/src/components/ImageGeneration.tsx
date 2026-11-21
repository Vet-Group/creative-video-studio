'use client';
// Image Generation: the History, Examples and About tabs take the full width, and a prompt bar (reference images, prompt, style, model, ratio,
// resolution, Enhance, the brand kit, Run) floats at the foot of the screen over them, as on Fash. Below 1024 px the bar is the Create tab. Run posts an image job.
import { type FocusEvent, useEffect, useId, useRef, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { runTotal } from '@/lib/apps';
import { type BrandKit, withBrand } from '@/lib/brand';
import { promptTooLong } from '@/lib/prompt-limit';
import { confirmRun, sendRun, usd } from '@/lib/run-guard';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { useRecall } from '@/lib/use-recall';
import { useDraftState } from '@/lib/use-draft';
import { About } from './About';
import { BrandPicker } from './BrandKit';
import { copyError, FormNotice, Gallery, type Img, LockedFields, photoImg, RATIO_LABEL, Slot, THINKING_LABEL, uploadError, uploadImages, UPLOAD_ERROR, useImageChoice, useImageModels, useReuse, WorkTabs } from './image-tools';
import { ENHANCE_NOTE, EnhanceToggle } from './EnhanceToggle';
import { Icon } from './Icon';
import { FormContext, type Photo, useApplier, useJobs } from './jobs';
import { ModelPicker } from './ModelPicker';
import { PromptComposer } from './PromptComposer';
import type { PresetRow } from './PresetEditing';
import { PromptPreview } from './PromptSections';
import { Select } from './Select';
import { Tray } from './Shell';
import { StylePicker } from './StylePicker';
import { Templates } from './Templates';
import { PageHint } from './ToolGuide';

type Tab = 'create' | 'history' | 'examples' | 'about';
const TAB_LABEL: Record<Tab, string> = { create: 'Tạo', history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };
const NO_PROMPT = 'Nhập mô tả cảnh bạn muốn tạo.';

export function ImageGeneration({ reuse, model }: { reuse?: string; model?: string }) {
  const { refresh, notify, loading } = useJobs();
  const narrow = useMediaQuery(NARROW);
  const [images, setImages] = useState<Img[]>([]);
  const [prompt, setPrompt, clearDraft] = useDraftState('image', reuse !== undefined);
  const [styleId, setStyleId] = useState(''); // '' for no style
  const [enhance, setEnhance] = useState(true); // on by default, as on Fash
  const [count, setCount] = useState(1); // how many pictures one Run makes, one job each
  const [storeId, setStoreId] = useState('');
  const [useBrand, setUseBrand] = useState(false); // the chosen store's brand kit, added to the prompt on the server
  const [style, setStyle] = useState<PresetRow | null>(null);
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [tab, setTab] = useState<Tab | null>(null); // null: the default for the width (Create below 1024 px, else Examples)
  const opening: Tab = 'examples';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [more, setMore] = useState(false); // the store, brand kit, saved settings and sent prompt, folded on a wide screen
  const promptId = useId();
  const bar = useRef<HTMLDivElement>(null);
  /** On a wide screen the bar floats over the pane: a card or link the keyboard moves to under it scrolls up into sight (WCAG 2.4.11). Not a page
   * scroll padding, which also scrolled the page each time a control of the bar itself took focus. */
  function unhide(e: FocusEvent<HTMLElement>) {
    const t = e.target;
    const b = bar.current?.getBoundingClientRect();
    if (narrow || !b || !t.matches(':focus-visible') || t.closest('dialog')) return;
    const r = t.getBoundingClientRect();
    if (r.right <= b.left || r.left >= b.right) return; // beside the bar, not under it
    const over = r.bottom - b.top;
    if (over > 0) window.scrollBy(0, over + 16);
  }
  // Docked at the foot of a wide screen, a bar taller than the screen (a long prompt, the open options) stays in the page's flow instead, so its top
  // can be reached; its height also caps the prompt's lists, which open above it (PromptComposer.module.css). Leaving the foot moves the bar to the
  // end of the page, so the control in use is brought back into sight.
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const fit = () => {
      el.style.setProperty('--imagebar-h', `${el.offsetHeight}px`);
      const tall = el.offsetHeight > innerHeight - 48;
      if (tall === el.hasAttribute('data-tall')) return;
      el.toggleAttribute('data-tall', tall);
      const used = document.activeElement;
      if (tall && used instanceof HTMLElement && el.contains(used)) used.scrollIntoView({ block: 'nearest' });
    };
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    addEventListener('resize', fit);
    return () => (watch.disconnect(), removeEventListener('resize', fit));
  }, []);
  const { models, failed } = useImageModels('image');
  const pick = useImageChoice(models, Math.max(1, images.length), model); // Explore's model card picks the model
  // The member's last model and settings, unless a refill or Explore's model card opens the page.
  const recall = useRecall(
    'image',
    (s) => {
      pick.setModelId(s.modelId);
      if (s.ratio) pick.setRatio(s.ratio);
      if (s.resolution) pick.setResolution(s.resolution);
      if (s.enhance !== null) setEnhance(s.enhance);
      if (s.storeId) setStoreId(s.storeId);
      if (s.brand !== null) setUseBrand(s.brand);
    },
    { skip: reuse !== undefined || model !== undefined },
  );
  const apply = useApplier((s) => {
    recall.touch();
    if (s.ratio) pick.setRatio(s.ratio);
    if (s.resolution) pick.setResolution(s.resolution);
  });
  const { chosen } = pick;
  const max = chosen?.maxImages ?? 4;
  /** A detail's photo or result as one more input, as Fash's "Image added to inputs". */
  async function take(p: Photo) {
    if (images.length >= max) return notify(`Tối đa ${max} ảnh`);
    setError('');
    try {
      const img = await photoImg(p).finally(loading('Đang tải ảnh...'));
      setImages((cur) => (cur.length < max ? [...cur, img] : cur));
      notify('Đã thêm ảnh vào đầu vào');
    } catch (e) {
      setError(copyError(e, UPLOAD_ERROR));
    }
  }

  const recreate = useReuse(
    reuse,
    'image',
    (j) => {
      recall.touch();
      if (j.images) setImages(j.images);
      setPrompt(j.brief ?? j.prompt ?? ''); // with a style or the brand kit, the job's prompt is composed and the member's own words are the brief
      setStyleId(j.presetId ?? '');
      setEnhance(j.enhance ?? true);
      // The brand kit switch comes back with its store (a company example keeps the member's own, a template has no switch); a store hidden since leaves it off.
      if (!j.recipe && j.brand !== undefined) {
        const on = j.brand && !j.storeLost;
        setUseBrand(on);
        if (on) setStoreId(j.storeId ?? '');
      }
      pick.refill({ ...j, store: !j.recipe && j.brand === true && j.storeLost === true });
    },
    (e) => setError(copyError(e, 'Không tìm thấy ảnh để dùng lại.')),
  );

  // What Run sends, composed as POST /api/jobs does: the words, the style's prompt (which only a template editor can read), then the brand kit.
  const styled = style?.prompt ? `${prompt.trim()}

${style.prompt}` : prompt.trim();
  const sent = kit ? withBrand(styled, kit, 'image') : styled;
  // When the member's words fit and what the page adds does not, the reason names it: the brand kit sits under the more-options pill.
  const added = chosen && prompt.trim().length <= chosen.maxPromptChars ? [kit && 'bộ nhận diện', style?.prompt && 'phong cách'].filter(Boolean).join(' và ') : '';
  const on = [storeId && 'cửa hàng', kit && 'bộ nhận diện', count > 1 && `${count} ảnh`].filter(Boolean); // the folded options in use, counted on the more-options pill
  const previewNote = [
    style && !style.prompt && `Mô tả của phong cách "${style.label}" do quản trị giữ, máy chủ thêm vào sau phần của bạn khi tạo.`,
    enhance && ENHANCE_NOTE,
  ]
    .filter(Boolean)
    .join(' ');

  // The first thing that stops Run; null when it can go.
  const reason =
    !recall.answered
      ? 'Đang tải cài đặt đã dùng...'
      : models === null
        ? 'Đang tải danh sách mô hình...'
        : failed
          ? 'Không tải được danh sách mô hình.'
          : !chosen
            ? 'Chưa bật mô hình nào cho Tạo ảnh. Admin bật trong Quản trị → Cài đặt → Mô hình.'
            : images.length === 0 && !chosen.textToImage
              ? 'Mô hình này cần ít nhất 1 ảnh tham chiếu.'
              : images.length > chosen.maxImages
                ? `Mô hình này nhận tối đa ${chosen.maxImages} ảnh.`
                : prompt.trim() === ''
                  ? NO_PROMPT
                  : promptTooLong(chosen, sent.length, added);
  // While the page loads (Run says so), and before the first word (the box's placeholder asks for it), the reason is a quiet muted line rather than a
  // box; a prompt of spaces alone gets the box.
  const starting = !recall.answered || models === null;
  const quiet = starting || (reason === NO_PROMPT && prompt === '');
  const canRun = reason === null && !busy;
  // With no image and a model that needs one, the best model that makes pictures from words is one click away (not switched to silently: its price differs).
  const wordsModel = chosen && images.length === 0 && !chosen.textToImage ? models?.filter((m) => m.textToImage).sort((a, b) => b.score - a.score)[0] : undefined;

  async function upload(files: File[]) {
    if (files.length === 0) return;
    const room = Math.max(0, max - images.length);
    if (room === 0) return notify(`Tối đa ${max} ảnh`);
    if (files.length > room) notify(`Chỉ lấy ${room} ảnh đầu`);
    setError('');
    setBusy(true);
    try {
      const assets = await uploadImages(files.slice(0, room), 'image', storeId, 'image').finally(loading('Đang tải lên…'));
      setImages((cur) => [...cur, ...assets]);
    } catch (e) {
      setError(uploadError(e));
    } finally {
      setBusy(false);
    }
  }

  const total = runTotal(pick.estimate, count);
  async function run() {
    if (!(await confirmRun(total))) return;
    setBusy(true);
    setError('');
    setNotice('');
    let done = 0;
    const batch = count > 1 ? crypto.randomUUID() : undefined; // one id on the Run's jobs, by which History's "Chọn cả lô" finds them all
    try {
      const body = { feature: 'image', modelId: pick.modelId, assetIds: images.map((i) => i.id), prompt: prompt.trim(), ...(styleId && { presetId: styleId }), enhance, ratio: pick.ratio, storeId: storeId || null, useBrand, params: { resolution: pick.resolution, ...(pick.thinking && { thinking: pick.thinking }), ...(batch && { batch }) } };
      for (; done < count; done++) {
        // The first job stands for the Run: a Run the same as the last one asks before anything is sent.
        if (done > 0) await api('/api/jobs', sendJson('POST', body));
        else if (!(await sendRun(body))) return;
      }
      clearDraft();
      setNotice('Đã gửi lượt tạo. Theo dõi trong tab "Lịch sử".');
      if (!narrow) setTab('history');
      await refresh();
    } catch (e) {
      setError(`${errorText(e, 'Không gửi được lượt tạo, hãy thử lại.')}${done > 0 ? ` Đã gửi ${done}/${count} ảnh, còn ${count - done} ảnh chưa gửi.` : ''}`);
      if (done > 0) {
        setCount(count - done); // Run again sends only the rest
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const tabs: Tab[] = narrow ? ['create', 'history', 'examples', 'about'] : ['history', 'examples', 'about'];
  const shown: Tab = narrow ? (tab ?? 'create') : tab === null || tab === 'create' ? opening : tab;
  const panel = shown === 'create' ? 'history' : shown;
  const runButton = (
    <button type="button" className="primary run" disabled={!canRun} aria-describedby={reason ? 'imagegen-reason' : undefined} onClick={() => void run()}>
      Tạo ảnh
      {busy ? <span className="run-cost">· Đang gửi…</span> : starting ? <span className="run-cost">· Đang tải…</span> : total !== undefined && <span className="run-cost">· ${total}</span>}
    </button>
  );

  return (
    <section aria-labelledby="imagegen-title" className="create imagegen">
      <h1 id="imagegen-title" className="sr-only">
        Tạo ảnh
      </h1>
      {/* On a phone the hint belongs to the Create tab, as on the other tools' forms. */}
      {(!narrow || shown === 'create') && <PageHint href="/image-generation" />}
      <WorkTabs prefix="imagegen" tabs={tabs} labels={TAB_LABEL} shown={shown} onSelect={setTab} />

      {/* The prompt bar: the reference strip and the prompt, the settings chips with Run, then the store and brand kit, saved settings and the sent
          prompt, folded under the more-options pill on a wide screen. It comes before the pane, so the keyboard reaches the prompt first; CSS docks it under
          the pane at the foot of a wide screen. Below 1024 px it is the Create tab's card. */}
      <div
        ref={bar}
        className="imagebar"
        id="imagegen-panel-create"
        role={narrow ? 'tabpanel' : 'region'}
        aria-label={narrow ? undefined : 'Thanh tạo ảnh'}
        aria-labelledby={narrow ? 'imagegen-tab-create' : undefined}
        hidden={narrow && shown !== 'create'}
      >
        <div className="imagebar-top">
          <div className="imagebar-refs">
            <Slot label="Ảnh tham chiếu" optional icon="plus" empty={`Tối đa ${max} ảnh tham chiếu`} inputLabel="Ảnh tham chiếu" images={images} max={max} busy={busy} onAdd={(files) => void upload(files)} onRemove={(id) => setImages((cur) => cur.filter((x) => x.id !== id))} onPick={(img) => setImages((cur) => (cur.length < max ? [...cur, img] : cur))} storeId={storeId} slot="image" count="always" zone={bar} />
          </div>
          <PromptComposer
            id={promptId}
            label="Mô tả"
            feature="image"
            value={prompt}
            onChange={setPrompt}
            maxLength={chosen?.maxPromptChars}
            onRun={() => (canRun ? void run() : (reason ?? false))}
            placeholder="Mô tả cảnh bạn muốn tạo…"
            ask={chosen ? () => ({ field: 'prompt', feature: 'image', text: prompt, room: chosen.maxPromptChars, model: chosen.id }) : null}
            enhance={<EnhanceToggle on={enhance} onChange={(v) => (recall.touch(), setEnhance(v))} />}
          />
        </div>

        <div className="form-message">
          {reason && (
            <p className="help" id="imagegen-reason" role="status" data-quiet={quiet || undefined}>
              {reason}
            </p>
          )}
          {wordsModel && (
            <button type="button" className="link-button" onClick={() => (recall.touch(), pick.setModelId(wordsModel.id))}>
              Dùng {wordsModel.label}
            </button>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {pick.note && <p className="help" role="status">{pick.note}</p>}
          {count > 1 && pick.estimate !== undefined && (
            <p className="help" role="status">
              {count} ảnh × {usd(pick.estimate)} = {usd(total!)}
            </p>
          )}
          {style && <p className="help">Phong cách: {style.label} · thêm vào cuối mô tả của bạn</p>}
          <FormNotice text={notice} onHistory={narrow ? () => setTab('history') : undefined} />
        </div>

        <div className="imagebar-chips">
          <StylePicker value={styleId} onChange={setStyleId} onStyle={setStyle} />
          {models && models.length > 0 && <ModelPicker models={pick.options} value={pick.modelId} onChange={(v) => (recall.touch(), pick.setModelId(v))} />}
          {models !== null && !failed && !chosen && <LockedFields />}
          {chosen && (
            <>
              <Select chip label="Tỉ lệ" icon="ratio" heading="Chọn tỉ lệ" value={pick.ratio} options={chosen.ratios.map((r) => ({ value: r, label: RATIO_LABEL[r] ?? r }))} onChange={(v) => (recall.touch(), pick.setRatio(v))} />
              <Select chip label="Độ phân giải" icon="preset" heading="Chọn độ phân giải" value={pick.resolution} options={chosen.resolutions.map((r) => ({ value: r, label: r }))} onChange={(v) => (recall.touch(), pick.setResolution(v))} />
              {pick.thinking && <Select chip label="Mức suy luận" icon="sliders" heading="Chọn mức suy luận" value={pick.thinking} options={chosen.thinking.map((t) => ({ value: t, label: THINKING_LABEL[t] ?? t }))} onChange={pick.setThinking} />}
            </>
          )}
          {!narrow && (
            <button type="button" className="select-trigger imagebar-more" title="Cửa hàng, bộ nhận diện, thiết lập đã lưu và prompt gửi đi" aria-expanded={more} aria-controls="imagegen-more" onClick={() => setMore(!more)}>
              <Icon name="sliders" />
              <span className="select-value">Tuỳ chọn khác</span>
              {on.length > 0 && (
                <span className="imagebar-more-on" title={`${on.length} tuỳ chọn đang bật: ${on.join(', ')}`}>
                  {on.length}
                  <span className="sr-only"> tuỳ chọn đang bật</span>
                </span>
              )}
            </button>
          )}
          {!narrow && runButton}
        </div>

        <div className="imagebar-foot" id="imagegen-more" hidden={!narrow && !more}>
          {chosen && <Select chip label="Số ảnh" icon="copy" heading="Số ảnh mỗi lượt" value={String(count)} options={[...new Set([1, 2, 4, count])].sort((a, b) => a - b).map((n) => ({ value: String(n), label: `${n} ảnh` }))} onChange={(v) => setCount(Number(v))} />}
          <BrandPicker storeId={storeId} onStore={(v) => (recall.touch(), setStoreId(v))} on={useBrand} onToggle={(v) => (recall.touch(), setUseBrand(v))} onKit={setKit} onFailed={() => setMore(true)} />
          <Templates feature="image" data={() => ({ images: images.map((i) => i.id), prompt: prompt.trim(), presetId: styleId, enhance, ratio: pick.ratio, resolution: pick.resolution, modelId: pick.modelId })} />
          {prompt.trim() && <PromptPreview feature="image" prompts={[sent]} limit={chosen?.maxPromptChars} note={previewNote || undefined} folded />}
        </div>
        {/* On a phone Run stays at the foot of the screen while the bar is in sight, as the other tools' Run bar does. */}
        {narrow && <div className="runbar">{runButton}</div>}
      </div>

      <div className="side" id={`imagegen-panel-${panel}`} role="tabpanel" aria-labelledby={`imagegen-tab-${panel}`} hidden={narrow && shown === 'create'} onFocus={unhide}>
        <FormContext.Provider value={{ recreate: (from, recipe) => (recall.touch(), recreate(from, recipe), narrow && setTab('create')), apply, photo: (p) => void take(p), has: (asset) => images.some((i) => i.id === asset), prompt: (text) => (setPrompt(text), notify('Đã chép mô tả')), result: (p) => void take(p) }}>
          {shown === 'examples' ? <Gallery kind="image" samples="image-example-" label="Ảnh của công ty" emptyText="Chưa có ảnh nào trong công ty. Hãy tạo ảnh đầu tiên." /> : shown === 'about' ? <About page="image" /> : <Tray feature="image" />}
        </FormContext.Provider>
      </div>
    </section>
  );
}
