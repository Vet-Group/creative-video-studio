'use client';
import { useState } from 'react';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';
import { featureLabel } from '@/lib/features';

interface Settings {
  monthlyCapUsd: string;
  memberDailyClipCap: number;
  featuresMonthlyCapUsd: string;
  memberDailyUsdCap: string;
  memberMonthlyUsdCap: string;
  featureCaps: { feature: string; monthlyUsd: string }[];
  models: { id: string; label: string; provider: string; enabled: boolean; priced: boolean }[];
}

function SettingsForm({ settings, reload }: { settings: Settings; reload: () => void }) {
  const { problem, run } = useAction(reload);
  const [monthly, setMonthly] = useState(settings.monthlyCapUsd);
  const [daily, setDaily] = useState(String(settings.memberDailyClipCap));
  const [features, setFeatures] = useState(settings.featuresMonthlyCapUsd);
  const [memberDay, setMemberDay] = useState(settings.memberDailyUsdCap);
  const [memberMonth, setMemberMonth] = useState(settings.memberMonthlyUsdCap);
  const [soft, setSoft] = useState(() => Object.fromEntries(settings.featureCaps.map((c) => [c.feature, c.monthlyUsd])));
  const [enabled, setEnabled] = useState(() => Object.fromEntries(settings.models.map((m) => [m.id, m.enabled])));
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaved(false);
    const ok = await run(
      () =>
        api(
          '/api/admin/settings',
          sendJson('PUT', {
            monthlyCapUsd: monthly,
            memberDailyClipCap: Number(daily),
            featuresMonthlyCapUsd: features,
            memberDailyUsdCap: memberDay,
            memberMonthlyUsdCap: memberMonth,
            featureCaps: settings.featureCaps.map((c) => ({ feature: c.feature, monthlyUsd: soft[c.feature] })),
            models: settings.models.map((m) => ({ id: m.id, enabled: enabled[m.id] })),
          }),
        ),
      'Không lưu được cài đặt.',
    );
    setSaved(ok);
  }

  return (
    <>
      <div className="row">
        <label>
          Ngân sách tháng cho video (USD)
          <input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
        </label>
        <label>
          Số clip tối đa mỗi Member mỗi ngày
          <input inputMode="numeric" value={daily} onChange={(e) => setDaily(e.target.value)} />
        </label>
      </div>
      <fieldset>
        <legend>Ảnh và ứng dụng</legend>
        <div className="row">
          <label>
            Ngân sách tháng cho ảnh và ứng dụng (USD)
            <input inputMode="decimal" value={features} onChange={(e) => setFeatures(e.target.value)} />
          </label>
          <label>
            Hạn mức mỗi Member mỗi ngày (USD)
            <input inputMode="decimal" value={memberDay} onChange={(e) => setMemberDay(e.target.value)} />
          </label>
          <label>
            Hạn mức mỗi Member mỗi tháng (USD)
            <input inputMode="decimal" value={memberMonth} onChange={(e) => setMemberMonth(e.target.value)} />
          </label>
        </div>
        <p className="muted">Hạn mức theo mục dưới đây chỉ để cảnh báo trên trang Chi phí (từ 80%), không chặn Run.</p>
        <div className="row">
          {settings.featureCaps.map((c) => (
            <label key={c.feature}>
              {featureLabel(c.feature)} (USD/tháng)
              <input inputMode="decimal" value={soft[c.feature]} onChange={(e) => setSoft((cur) => ({ ...cur, [c.feature]: e.target.value }))} />
            </label>
          ))}
        </div>
      </fieldset>
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
      <button type="button" className="primary" disabled={[monthly, daily, features, memberDay, memberMonth, ...Object.values(soft)].some((v) => v.trim() === '')} onClick={() => void save()}>
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
