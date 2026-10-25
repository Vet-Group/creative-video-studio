'use client';
// Image Generation: tabs over the gallery of the company's images (or History, or About), and a floating prompt bar pinned to the bottom of the content area
// with an upload tile, the prompt, the model, ratio and resolution pills, and Run. Every pill is a Select or the model picker, so each works by keyboard.
import { useRef, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { useHydrated } from '@/lib/use-hydrated';
import { Gallery, type Img, RATIO_LABEL, uploadImages, UPLOAD_ERROR, useImageChoice, useImageModels, WorkTabs } from './image-tools';
import { Icon } from './Icon';
import { useJobs } from './jobs';
import { ModelPicker } from './ModelPicker';
import { Select } from './Select';
import { Tray } from './Shell';

type Tab = 'history' | 'examples' | 'about';
const TAB_LABEL: Record<Tab, string> = { history: 'Lịch sử', examples: 'Ví dụ', about: 'Giới thiệu' };
const TABS: Tab[] = ['history', 'examples', 'about'];
const MAX_PROMPT = 2000;

export function ImageGeneration() {
  const { refresh } = useJobs();
  const hydrated = useHydrated();
  const [images, setImages] = useState<Img[]>([]);
  const [prompt, setPrompt] = useState('');
  const [tab, setTab] = useState<Tab>('examples');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const { models, failed } = useImageModels('image');
  const pick = useImageChoice(models, Math.max(1, images.length));
  const { chosen } = pick;
  const max = chosen?.maxImages ?? 4;

  // The first thing that stops Run; null when it can go.
  const reason =
    models === null
      ? 'Đang tải danh sách mô hình...'
      : failed
        ? 'Không tải được danh sách mô hình.'
        : !chosen
          ? 'Chưa bật mô hình nào cho Tạo ảnh. Admin bật trong Quản trị → Cài đặt → Mô hình.'
          : images.length === 0
            ? 'Tải lên ít nhất 1 ảnh tham chiếu.'
            : images.length > chosen.maxImages
              ? `Mô hình này nhận tối đa ${chosen.maxImages} ảnh.`
              : prompt.trim() === ''
                ? 'Nhập mô tả cảnh bạn muốn tạo.'
                : null;
  const canRun = reason === null && !busy;

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setError('');
    setBusy(true);
    try {
      const assets = await uploadImages(files.slice(0, Math.max(0, max - images.length)));
      setImages((cur) => [...cur, ...assets]);
    } catch {
      setError(UPLOAD_ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = { feature: 'image', modelId: pick.modelId, assetIds: images.map((i) => i.id), prompt: prompt.trim(), ratio: pick.ratio, params: { resolution: pick.resolution } };
      await api('/api/jobs', sendJson('POST', body));
      setNotice('Đã gửi job. Theo dõi trong tab "Lịch sử".');
      setTab('history');
      await refresh();
    } catch (e) {
      setError(errorText(e, 'Không gửi được job, hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="imagegen-title" className="imagegen">
      <h1 id="imagegen-title" className="sr-only">
        Tạo ảnh
      </h1>
      <WorkTabs prefix="imagegen" tabs={TABS} labels={TAB_LABEL} shown={tab} onSelect={setTab} />
      <div className="imagegen-side" id={`imagegen-panel-${tab}`} role="tabpanel" aria-labelledby={`imagegen-tab-${tab}`}>
        {tab === 'examples' ? <Gallery kind="image" samples="image-example-" label="Ảnh của công ty" emptyText="Chưa có ảnh nào trong công ty. Hãy tạo ảnh đầu tiên bên dưới." /> : tab === 'about' ? <ImageAbout /> : <Tray feature="image" />}
      </div>

      <div className="imagebar" role="group" aria-label="Thanh tạo ảnh">
        <div className="imagebar-top">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            aria-label="Ảnh tham chiếu"
            disabled={!hydrated}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              void upload(files);
            }}
          />
          <ul className="bar-thumbs" aria-label="Ảnh đã chọn">
            {images.map((i) => (
              <li key={i.id}>
                <img src={`/api/assets/${i.id}/content`} alt={i.filename} />
                <button type="button" aria-label={`Bỏ ảnh ${i.filename}`} onClick={() => setImages((cur) => cur.filter((x) => x.id !== i.id))}>
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
            {images.length < max && (
              <li>
                <button type="button" className="bar-add" aria-label="Thêm ảnh tham chiếu" disabled={!hydrated || busy} onClick={() => input.current?.click()}>
                  <Icon name="plus" size={16} />
                </button>
              </li>
            )}
          </ul>
          <textarea aria-label="Mô tả cảnh bạn muốn tạo" placeholder="Mô tả cảnh bạn muốn tạo…" value={prompt} maxLength={MAX_PROMPT} rows={2} onChange={(e) => setPrompt(e.target.value)} />
        </div>
        {(reason || error || notice) && (
          <div className="bar-message">
            {reason && (
              <p className="help" id="imagegen-reason" role="status">
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
        )}
        <div className="imagebar-bottom">
          <div className="pills">
            {models && models.length > 0 && <ModelPicker models={pick.options} value={pick.modelId} onChange={pick.setModelId} />}
            {chosen && (
              <>
                <Select label="Tỉ lệ" icon="ratio" heading="Chọn tỉ lệ" value={pick.ratio} options={chosen.ratios.map((r) => ({ value: r, label: RATIO_LABEL[r] ?? r }))} onChange={pick.setRatio} />
                <Select label="Độ phân giải" icon="preset" heading="Chọn độ phân giải" value={pick.resolution} options={chosen.resolutions.map((r) => ({ value: r, label: r }))} onChange={pick.setResolution} />
              </>
            )}
          </div>
          <button type="button" className="primary bar-run" disabled={!canRun} aria-describedby={reason ? 'imagegen-reason' : undefined} onClick={() => void run()}>
            Tạo ảnh
            {pick.estimate !== undefined && <span className="run-cost">· ${pick.estimate}</span>}
          </button>
        </div>
      </div>
    </section>
  );
}

function ImageAbout() {
  return (
    <article className="about">
      <h2>Tạo và chỉnh ảnh sản phẩm</h2>
      <p>Đưa vào một hoặc vài ảnh tham chiếu và mô tả cảnh bạn muốn, và nhận lại một ảnh mới. Ảnh nằm trong Thư viện của công ty, mục Tạo ảnh.</p>

      <p className="about-kicker">Từng bước</p>
      <h3>Một lần Run gồm những gì</h3>
      <ol className="about-steps">
        <li>
          <strong>Ảnh tham chiếu.</strong> Bấm dấu cộng trên thanh bên dưới để tải ảnh. Mỗi mô hình nhận tối đa một số ảnh nhất định.
        </li>
        <li>
          <strong>Mô tả.</strong> Tả cảnh, ánh sáng và điều cần đổi, hoặc điều phải giữ nguyên. Viết bằng tiếng Anh thường cho kết quả ổn định hơn.
        </li>
        <li>
          <strong>Mô hình, tỉ lệ, độ phân giải.</strong> Mỗi menu mở bằng chuột hoặc bàn phím (Enter, Space, phím mũi tên, Esc để đóng). Nút Run ghi chi phí ước tính của một ảnh.
        </li>
        <li>
          <strong>Xem kết quả.</strong> Job hiện trong mục Lịch sử và báo khi xong. Thư viện có mọi ảnh của công ty để xem, tải xuống và đánh giá.
        </li>
      </ol>

      <p className="about-kicker">Giới hạn</p>
      <h3>Hạn mức và chi phí</h3>
      <ul>
        <li>Ảnh và ứng dụng có ngân sách riêng, tách khỏi ngân sách video: mỗi người có hạn mức theo ngày và theo tháng, công ty có hạn mức theo tháng. Run làm vượt hạn mức sẽ bị từ chối.</li>
        <li>Chi phí ghi trên mỗi ảnh là chi phí thật từ nhà cung cấp khi có; trước đó là số ước tính.</li>
        <li>Chỉ dùng ảnh công ty có quyền sử dụng.</li>
      </ul>
    </article>
  );
}
