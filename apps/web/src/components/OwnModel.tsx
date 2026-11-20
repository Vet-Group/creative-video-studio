'use client';
// Try On's own-model creator (Fash's "Create a model unique to your brand", inside the model picker): Fash's five traits and an optional line make one
// fashion_model job, run as the AI model app runs it; the result is saved as the member's private model and shown with Fash's "Use This Model" (fills the Model slot)
// and "Create Another" (back to the same traits). Once this form is closed, a note says the model was saved instead.
import { useEffect, useId, useRef, useState } from 'react';
import { api, errorText, type JobStatus, sendJson, thumbUrl } from '@/lib/api';
import { DEFAULT_FASHION_TRAITS, FASHION_OPTIONS, fashionModelName, fashionModelPrompt, type FashionTraits, MAX_EXTRA, mentionsMinor, MINOR_REASON } from '@/lib/fashion-model';
import type { FashionModelItem } from '@/lib/fashion-models';
import { promptTooLong } from '@/lib/prompt-limit';
import { confirmRun, usd } from '@/lib/run-guard';
import { type Img, nearestOption, useImageChoice, useImageModels } from './image-tools';
import { useJobs } from './jobs';
import { Select } from './Select';

const FIELDS = [
  ['gender', 'Giới tính'],
  ['age', 'Độ tuổi'],
  ['ethnicity', 'Nguồn gốc'],
  ['body', 'Dáng người'],
  ['hair', 'Tóc'],
] as const;
/** The app's defaults, but shown full length on white, as a Try On model photo is. */
const START: FashionTraits = { ...DEFAULT_FASHION_TRAITS, framing: 'full', background: 'white' };
const POLL_MS = 3_000;
const FAILED: JobStatus[] = ['failed', 'failed_unknown', 'timed_out'];

export function OwnModel({ onSaved, onPick }: { onSaved: () => void; onPick: (img: Img) => void }) {
  const [traits, setTraits] = useState<FashionTraits>(START);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [made, setMade] = useState<Img | null>(null); // the model just made, waiting for Use this model or Create another
  const use = useRef<HTMLButtonElement>(null);
  const ids = { extra: useId(), reason: useId(), made: useId() };
  const box = useRef<HTMLDivElement>(null);
  // Focus follows the step: the first trait on opening (the tile that opened this form is gone) and after Create another, Use this model once made.
  useEffect(() => void (made ? use.current : box.current?.querySelector('button'))?.focus(), [made]);
  const shown = useRef(true); // false once the member goes back or closes the picker: the run still saves the model and says so in a note, filling nothing
  useEffect(() => {
    shown.current = true;
    return () => void (shown.current = false);
  }, []);
  const { notify, refresh } = useJobs();
  const { models, failed } = useImageModels('fashion_model');
  // No input image, so the model must make a picture from words, as on the app's page.
  const offered = models?.filter((m) => m.textToImage) ?? (models === null ? null : []);
  const pick = useImageChoice(offered, 0);
  const { chosen } = pick;
  const portrait = chosen?.ratios.filter((r) => r !== 'auto') ?? [];
  const ratio = portrait.length > 0 ? nearestOption(portrait, '3:4') : 'auto';
  const prompt = fashionModelPrompt(traits);
  const reason =
    offered === null ? 'Đang tải danh sách mô hình...' : failed ? 'Không tải được danh sách mô hình.' : !chosen ? 'Admin chưa bật mô hình nào cho Tạo người mẫu AI.' : mentionsMinor(traits.extra) ? MINOR_REASON : promptTooLong(chosen, prompt.length);

  async function run() {
    if (!(await confirmRun(pick.estimate, `Tạo lượt này với giá ${usd(pick.estimate ?? 0)}?`))) return; // the price as the button shows it
    setRunning(true);
    setError('');
    try {
      const { id } = await api<{ id: string }>('/api/jobs', sendJson('POST', { feature: 'fashion_model', modelId: pick.modelId, assetIds: [], ratio, prompt, params: { resolution: pick.resolution, traits: JSON.stringify(traits) } }));
      void refresh(); // the tray watches the new job at once
      for (;;) {
        await new Promise((go) => setTimeout(go, POLL_MS));
        const job = await api<{ status: JobStatus; error: string | null; outputAssetId: string | null }>(`/api/jobs/${id}`);
        if (FAILED.includes(job.status)) throw new Error(job.error || 'Không tạo được người mẫu, hãy thử lại.');
        if (job.status !== 'succeeded' || !job.outputAssetId) continue;
        const saved = await api<FashionModelItem>('/api/fashion-models', sendJson('POST', { assetId: job.outputAssetId, name: fashionModelName(traits) }));
        onSaved();
        if (shown.current) setMade({ id: saved.assetId, filename: saved.name });
        else notify(`Đã lưu người mẫu ${saved.name} vào Người mẫu AI`);
        return;
      }
    } catch (e) {
      const text = errorText(e, 'Không tạo được người mẫu, hãy thử lại.');
      setError(text);
      if (!shown.current) notify(text); // the form that would show it is gone
    } finally {
      setRunning(false);
    }
  }

  if (made)
    return (
      <div ref={box} className="own-model own-model-made">
        <img src={thumbUrl(made.id)} alt={made.filename} />
        <p id={ids.made} className="help" role="status">
          Đã lưu vào mục Người mẫu AI.
        </p>
        <div className="own-model-actions">
          <button ref={use} type="button" className="primary" aria-describedby={ids.made} onClick={() => onPick(made)}>
            Dùng người mẫu này
          </button>
          <button type="button" onClick={() => setMade(null)}>
            Tạo người mẫu khác
          </button>
        </div>
      </div>
    );

  return (
    <div ref={box} className="own-model">
      <div className="portrait-filter">
        {FIELDS.map(([key, label]) => (
          <Select key={key} label={label} icon="sliders" heading={label} value={traits[key]} options={FASHION_OPTIONS[key].map((o) => ({ value: o.id, label: o.label }))} onChange={(v) => setTraits((t) => ({ ...t, [key]: v }))} />
        ))}
      </div>
      <div className="field">
        <span className="optional-head">
          <label htmlFor={ids.extra} className="field-label">
            Chi tiết thêm<span className="sr-only"> (tuỳ chọn)</span>
          </label>
          <span className="choice-optional" aria-hidden="true">
            Tuỳ chọn
          </span>
        </span>
        <textarea id={ids.extra} rows={2} maxLength={MAX_EXTRA} value={traits.extra} placeholder="Ví dụ: tóc buộc cao, tàn nhang nhẹ" disabled={running} onChange={(e) => setTraits((t) => ({ ...t, extra: e.target.value }))} />
      </div>
      {running && (
        <p className="help" role="status">
          Đang tạo, thường dưới một phút. Người mẫu được lưu vào mục Người mẫu AI, kể cả khi bạn đóng hộp này.
        </p>
      )}
      {reason && (
        <p id={ids.reason} className="help" role="status">
          {reason}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="primary" disabled={reason !== null || running} aria-describedby={reason ? ids.reason : undefined} onClick={() => void run()}>
        Tạo người mẫu
        {running ? <span className="run-cost">· Đang tạo…</span> : pick.estimate !== undefined && <span className="run-cost">· {usd(pick.estimate)}</span>}
      </button>
    </div>
  );
}
