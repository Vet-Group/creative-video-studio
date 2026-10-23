'use client';
import { useState } from 'react';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';

interface Settings {
  monthlyCapUsd: string;
  memberDailyClipCap: number;
  models: { id: string; label: string; provider: string; enabled: boolean; priced: boolean }[];
}

function SettingsForm({ settings, reload }: { settings: Settings; reload: () => void }) {
  const { problem, run } = useAction(reload);
  const [monthly, setMonthly] = useState(settings.monthlyCapUsd);
  const [daily, setDaily] = useState(String(settings.memberDailyClipCap));
  const [enabled, setEnabled] = useState(() => Object.fromEntries(settings.models.map((m) => [m.id, m.enabled])));
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaved(false);
    const ok = await run(
      () => api('/api/admin/settings', sendJson('PUT', { monthlyCapUsd: monthly, memberDailyClipCap: Number(daily), models: settings.models.map((m) => ({ id: m.id, enabled: enabled[m.id] })) })),
      'Không lưu được cài đặt.',
    );
    setSaved(ok);
  }

  return (
    <>
      <div className="row">
        <label>
          Ngân sách tháng của công ty (USD)
          <input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
        </label>
        <label>
          Số clip tối đa mỗi Member mỗi ngày
          <input inputMode="numeric" value={daily} onChange={(e) => setDaily(e.target.value)} />
        </label>
      </div>
      <fieldset>
        <legend>Mô hình</legend>
        {settings.models.map((m) => (
          <label key={m.id} className="model">
            <input type="checkbox" checked={enabled[m.id]} disabled={!m.priced && !m.enabled} onChange={(e) => setEnabled((cur) => ({ ...cur, [m.id]: e.target.checked }))} />
            <span>
              {m.label} ({m.provider})
            </span>
            {!m.priced && <span className="muted">Chưa có giới hạn và giá nên chưa bật được</span>}
          </label>
        ))}
      </fieldset>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {saved && <p role="status">Đã lưu cài đặt.</p>}
      <button type="button" className="primary" disabled={monthly.trim() === '' || daily.trim() === ''} onClick={() => void save()}>
        Lưu cài đặt
      </button>
    </>
  );
}

export function AdminSettings() {
  const { data, failed, reload } = useFetch<Settings>('/api/admin/settings');
  if (!data) return failed ? <p className="error">Không tải được cài đặt.</p> : <p role="status">Đang tải...</p>;
  return (
    <section aria-labelledby="settings-title">
      <h1 id="settings-title">Cài đặt</h1>
      <SettingsForm settings={data} reload={reload} />
    </section>
  );
}
