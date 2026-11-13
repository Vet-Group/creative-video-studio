'use client';
// Smart Remake as its own app: the member gives a reference video and one product image, and nothing else. The video is analysed as soon as it is chosen
// (the analysis API, as on /analyze); once it has succeeded and a product is set, an AI pass marks the scenes that show a product like theirs (the `scenes`
// suggestion) and those are pre-ticked in the same RemakePanel /analyze uses, which shows the price and makes the video. If the pick fails, nothing is ticked.
import { REMAKE_MAX_SHOTS } from '@cvs/core/analysis/remake';
import { useEffect, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import type { AppConfig } from '@/lib/apps';
import { mergeShots, scenePicks } from '@/lib/analyze';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import type { AnalysisRow } from './AnalyzeView';
import { AppAbout, AppHeader, TAB_LABEL } from './AppPage';
import { copyError, type Img, Slot, uploadError, uploadImages, uploadVideoDirect, WorkTabs } from './image-tools';
import { ReferenceVideoSlot, type RefVideo } from './ReferenceVideo';
import { RemakePanel, remakeDrafts } from './RemakePanel';
import { useSuggest } from './Suggestions';

type Tab = 'create' | 'about';
const LABEL: Record<Tab, string> = { create: 'Tạo', about: TAB_LABEL.about };
const POLL_MS = 2500;

/** What the member reads about the pick: how many scenes were ticked for them, or that they choose themselves. */
export const pickNote = (picked: number | null): string =>
  picked === null ? 'Chưa tự chọn được cảnh nào. Bạn hãy tự chọn các cảnh cần thay sản phẩm.' : picked === 0 ? 'AI chưa thấy cảnh nào có sản phẩm giống của bạn. Bạn hãy tự chọn các cảnh cần thay.' : `AI đã chọn sẵn ${picked} cảnh có sản phẩm của bạn; bỏ chọn cảnh nào không cần.`;

export function SmartRemakeApp({ app }: { app: AppConfig }) {
  const narrow = useMediaQuery(NARROW);
  const [tab, setTab] = useState<Tab>('create');
  const [video, setVideo] = useState<RefVideo | null>(null);
  const [product, setProduct] = useState<Img[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisRow | null>(null);
  const [busy, setBusy] = useState(false); // an upload or the start of the analysis
  const [error, setError] = useState('');
  const [asked, setAsked] = useState(''); // `analysis:product` the pick was last asked for
  const pick = useSuggest();

  // Follows the analysis until it ends.
  const analysisId = analysis?.id;
  const open = analysis !== null && (analysis.status === 'queued' || analysis.status === 'running');
  useEffect(() => {
    if (!analysisId || !open) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = () =>
      void api<AnalysisRow>(`/api/analyses/${analysisId}`).then(
        (row) => {
          if (!live) return;
          setAnalysis(row);
          if (row.status === 'queued' || row.status === 'running') timer = setTimeout(poll, POLL_MS);
        },
        () => live && (timer = setTimeout(poll, POLL_MS)), // a dropped poll tries again
      );
    timer = setTimeout(poll, POLL_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [analysisId, open]);

  async function take(get: () => Promise<RefVideo[]>, failed: (e: unknown) => string) {
    setError('');
    setBusy(true);
    try {
      const chosen = (await get())[0]!;
      setVideo(chosen);
      await analyse(chosen);
    } catch (e) {
      setError(failed(e));
    } finally {
      setBusy(false);
    }
  }

  async function analyse(v: RefVideo) {
    setAnalysis(null);
    try {
      const { id } = await api<{ id: string }>('/api/analyses', sendJson('POST', { sourceAssetId: v.id }));
      setAnalysis({ id, status: 'queued', result: null, error: null, createdAt: new Date().toISOString(), sourceAssetId: v.id });
    } catch (e) {
      setError(errorText(e, 'Không bắt đầu phân tích được.'));
    }
  }

  async function addProduct(files: File[]) {
    setError('');
    setBusy(true);
    try {
      setProduct(await uploadImages(files.slice(0, 1), 'image', '', 'product'));
    } catch (e) {
      setError(uploadError(e));
    } finally {
      setBusy(false);
    }
  }

  // The pick starts once the analysis has succeeded and a product is set, and again for another product or video.
  const key = analysis?.status === 'succeeded' && product[0] ? `${analysis.id}:${product[0].id}` : '';
  useEffect(() => {
    if (!key || asked === key) return;
    setAsked(key);
    remakeDrafts.delete(analysis!.id); // the panel starts from the new pick, not from an earlier form
    void pick.run({ field: 'scenes', text: '', analysisId: analysis!.id, productAssetId: product[0]!.id });
  }, [key]); // asked once per key

  const picking = asked !== '' && asked === key && pick.busy;
  const ready = key !== '' && asked === key && !pick.busy;
  const first = ready && analysis!.result ? mergeShots(analysis!.result).first : [];
  const picked = ready && !pick.error ? scenePicks(first, pick.options, REMAKE_MAX_SHOTS) : null;
  const locked = busy || picking;

  const status = !video
    ? ''
    : analysis === null
      ? error ? '' : 'Đang gửi video…'
      : open
        ? 'Đang phân tích video… (khoảng một phút)'
        : analysis.status === 'failed'
          ? 'Không phân tích được video này. Hãy thử lại hoặc chọn video khác.'
          : !product[0]
            ? 'Đã phân tích xong video. Thêm ảnh sản phẩm để AI chọn các cảnh có sản phẩm của bạn.'
            : picking
              ? 'Đang tìm cảnh có sản phẩm…'
              : '';

  const tabs: Tab[] = narrow ? ['create', 'about'] : ['about'];
  const shown: Tab = narrow ? tab : 'about';
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
            <p className="help">Chỉ cần một video mẫu và một ảnh sản phẩm. AI phân tích video, chọn sẵn các cảnh có sản phẩm giống của bạn, rồi bạn bấm một nút để tạo video.</p>
            <ReferenceVideoSlot
              video={video}
              busy={locked}
              optional={false}
              hint="Video MP4 hoặc MOV. Video được phân tích ngay khi bạn thêm."
              onFile={(f) => void take(() => uploadVideoDirect(f).then((v) => [v]), (e) => uploadError(e, 'video'))}
              onHistory={(id) => void take(() => api<{ assets: RefVideo[] }>('/api/assets/copy', sendJson('POST', { assetId: id })).then((r) => r.assets), (e) => copyError(e, 'Không dùng được video này.'))}
              onRemove={() => {
                setVideo(null);
                setAnalysis(null);
                setAsked('');
              }}
            />
            <Slot label="Ảnh sản phẩm" empty="Thêm 1 ảnh sản phẩm" inputLabel="Ảnh sản phẩm" images={product} max={1} busy={locked} onAdd={(files) => void addProduct(files)} onRemove={() => setProduct([])} onPick={(a) => setProduct([a])} slot="product" />
            <p className="help">Mẹo: dùng ảnh sản phẩm rõ nét trên nền trơn, cùng loại sản phẩm với trong video mẫu (áo thay cho áo).</p>
            {status && (
              <p className="help" role="status">
                {status}
              </p>
            )}
            {analysis?.status === 'failed' && video && (
              <button type="button" className="link-button" disabled={locked} onClick={() => void analyse(video)}>
                Thử phân tích lại
              </button>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {ready && analysis && product[0] && <RemakePanel key={key} row={analysis} initialProduct={product} initialChosen={picked ?? []} note={pickNote(picked === null ? null : picked.length)} productFixed />}
          </div>
        </div>

        <div className="side" id={`app-panel-${panel}`} role="tabpanel" aria-labelledby={`app-tab-${panel}`} hidden={narrow && shown === 'create'}>
          <AppAbout app={app} />
        </div>
      </div>
    </section>
  );
}
