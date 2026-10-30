'use client';
import { useState } from 'react';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';

interface Preset {
  id: string;
  label: string;
  prompt: string;
  enabled: boolean;
  sortOrder: number;
}

function PresetRow({ preset, run }: { preset: Preset; run: ReturnType<typeof useAction>['run'] }) {
  const [label, setLabel] = useState(preset.label);
  const [prompt, setPrompt] = useState(preset.prompt);
  const [sortOrder, setSortOrder] = useState(String(preset.sortOrder));
  const [enabled, setEnabled] = useState(preset.enabled);
  const order = Number(sortOrder);
  return (
    <tr>
      <td data-label="Tên mẫu">
        <input aria-label={`Tên mẫu ${preset.id}`} value={label} onChange={(e) => setLabel(e.target.value)} />
      </td>
      <td data-label="Mô tả chuyển động">
        <textarea aria-label={`Mô tả của mẫu ${preset.id}`} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </td>
      <td data-label="Thứ tự">
        <input className="narrow" aria-label={`Thứ tự của mẫu ${preset.id}`} inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
      </td>
      <td data-label="Trạng thái">
        <label className="check">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Đang bật
        </label>
      </td>
      <td data-label="Thao tác">
        <button
          type="button"
          disabled={!label.trim() || !prompt.trim() || sortOrder.trim() === '' || !Number.isInteger(order)}
          onClick={() => void run(() => api(`/api/admin/presets/${preset.id}`, sendJson('PATCH', { label, prompt, sortOrder: order, enabled })), 'Không lưu được mẫu.')}
        >
          Lưu
        </button>
      </td>
    </tr>
  );
}

export function AdminPresets() {
  const { data, failed, reload } = useFetch<{ presets: Preset[] }>('/api/admin/presets');
  const { problem, run } = useAction(reload);
  if (!data) return failed ? <p className="error">Không tải được danh sách mẫu.</p> : <p role="status">Đang tải...</p>;
  return (
    <section aria-labelledby="presets-title">
      <h1 id="presets-title">Mẫu chuyển động</h1>
      <p className="muted">Mô tả nên viết bằng tiếng Anh vì mô hình hiểu tốt nhất tiếng Anh.</p>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="table-wrap">
        <table className="mobile-records">
          <thead>
            <tr>
              <th scope="col">Tên mẫu</th>
              <th scope="col" className="wide">Mô tả chuyển động</th>
              <th scope="col">Thứ tự</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {data.presets.map((p) => (
              <PresetRow key={p.id} preset={p} run={run} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
