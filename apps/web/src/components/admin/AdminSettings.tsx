'use client';
import { useId, useState } from 'react';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';
import { featureLabel } from '@/lib/features';
import { PageHead } from './PageHead';

interface Model {
  id: string;
  label: string;
  provider: string;
  enabled: boolean;
  priced: boolean;
}
interface Settings {
  monthlyCapUsd: string;
  memberDailyClipCap: number;
  featuresMonthlyCapUsd: string;
  memberDailyUsdCap: string;
  memberMonthlyUsdCap: string;
  featureCaps: { feature: string; monthlyUsd: string }[];
  models: Model[];
  vertexActiveProject: string | null;
  vertexAccounts: VertexAccount[];
  balanceWarningUsd: string;
  replicateCreditUsd: string | null;
  replicateCreditSince: string | null;
}
interface VertexAccount {
  projectId: string;
  creditTotal: string | null;
  creditCurrency: string;
  creditExpiresOn: string | null;
  stopWhenCreditsEnd: boolean;
  /** The worker has this account's key. */
  configured: boolean;
}
/** A Vertex account's credits as typed: an empty total or date means none. */
type VertexForm = { creditTotal: string; creditCurrency: string; creditExpiresOn: string; stopWhenCreditsEnd: boolean };

const PROVIDER_NAME: Record<string, string> = { fal: 'fal.ai', replicate: 'Replicate', vertex: 'Google Vertex AI', byteplus: 'BytePlus ModelArk', mock: 'Mô hình thử (mock)' };
/** Lower case without accents, so a search typed without accents still finds a model. */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** A number field with its unit shown inside the box and a short explanation under it. */
function Field({ label, unit, hint, value, onChange, numeric = false }: { label: string; unit: string; hint?: string; value: string; onChange: (v: string) => void; numeric?: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        <span className="sr-only"> ({unit})</span>
      </label>
      <div className="unit-input">
        <input id={id} inputMode={numeric ? 'numeric' : 'decimal'} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} />
        <span aria-hidden="true">{unit}</span>
      </div>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}

function SettingsForm({ settings, reload }: { settings: Settings; reload: () => void }) {
  const { problem, run } = useAction(reload);
  const [monthly, setMonthly] = useState(settings.monthlyCapUsd);
  const [daily, setDaily] = useState(String(settings.memberDailyClipCap));
  const [features, setFeatures] = useState(settings.featuresMonthlyCapUsd);
  const [memberDay, setMemberDay] = useState(settings.memberDailyUsdCap);
  const [memberMonth, setMemberMonth] = useState(settings.memberMonthlyUsdCap);
  const [warning, setWarning] = useState(settings.balanceWarningUsd);
  const [replicate, setReplicate] = useState(settings.replicateCreditUsd ?? '');
  const [recount, setRecount] = useState(false);
  const softOf = (s: Settings) => Object.fromEntries(s.featureCaps.map((c) => [c.feature, c.monthlyUsd]));
  const enabledOf = (s: Settings) => Object.fromEntries(s.models.map((m) => [m.id, m.enabled]));
  const [soft, setSoft] = useState(() => softOf(settings));
  const [enabled, setEnabled] = useState(() => enabledOf(settings));
  const vertexOf = (s: Settings): Record<string, VertexForm> =>
    Object.fromEntries(s.vertexAccounts.map((a) => [a.projectId, { creditTotal: a.creditTotal ?? '', creditCurrency: a.creditCurrency, creditExpiresOn: a.creditExpiresOn ?? '', stopWhenCreditsEnd: a.stopWhenCreditsEnd }]));
  const [vertex, setVertex] = useState(() => vertexOf(settings));
  const setAccount = (id: string, change: Partial<VertexForm>) => setVertex((cur) => ({ ...cur, [id]: { ...cur[id]!, ...change } }));
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState(false);

  // By value: the server answers "250.0000" for a typed "250"; an empty field always counts as a change.
  const differs = (typed: string | undefined, stored: string | number) => !typed?.trim() || Number(typed) !== Number(stored);
  const dirty =
    differs(monthly, settings.monthlyCapUsd) ||
    differs(daily, settings.memberDailyClipCap) ||
    differs(features, settings.featuresMonthlyCapUsd) ||
    differs(memberDay, settings.memberDailyUsdCap) ||
    differs(memberMonth, settings.memberMonthlyUsdCap) ||
    differs(warning, settings.balanceWarningUsd) ||
    recount ||
    (replicate.trim() ? settings.replicateCreditUsd === null || Number(replicate) !== Number(settings.replicateCreditUsd) : settings.replicateCreditUsd !== null) ||
    settings.featureCaps.some((c) => differs(soft[c.feature], c.monthlyUsd)) ||
    settings.models.some((m) => enabled[m.id] !== m.enabled) ||
    settings.vertexAccounts.some((a) => {
      const v = vertex[a.projectId]!;
      const total = v.creditTotal.trim();
      return (total ? a.creditTotal === null || Number(total) !== Number(a.creditTotal) : a.creditTotal !== null) ||
        v.creditCurrency !== a.creditCurrency || (v.creditExpiresOn || null) !== a.creditExpiresOn || v.stopWhenCreditsEnd !== a.stopWhenCreditsEnd;
    });

  function undo() {
    setMonthly(settings.monthlyCapUsd);
    setDaily(String(settings.memberDailyClipCap));
    setFeatures(settings.featuresMonthlyCapUsd);
    setMemberDay(settings.memberDailyUsdCap);
    setMemberMonth(settings.memberMonthlyUsdCap);
    setWarning(settings.balanceWarningUsd);
    setReplicate(settings.replicateCreditUsd ?? '');
    setRecount(false);
    setSoft(softOf(settings));
    setEnabled(enabledOf(settings));
    setVertex(vertexOf(settings));
  }

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
            balanceWarningUsd: warning,
            replicateCreditUsd: replicate.trim() || null,
            replicateCreditRecount: recount,
            featureCaps: settings.featureCaps.map((c) => ({ feature: c.feature, monthlyUsd: soft[c.feature] })),
            models: settings.models.map((m) => ({ id: m.id, enabled: enabled[m.id] })),
            vertexAccounts: settings.vertexAccounts.map((a) => {
              const v = vertex[a.projectId]!;
              return { projectId: a.projectId, creditTotal: v.creditTotal.trim() || null, creditCurrency: v.creditCurrency.trim().toUpperCase(), creditExpiresOn: v.creditExpiresOn || null, stopWhenCreditsEnd: v.stopWhenCreditsEnd };
            }),
          }),
        ),
      'Không lưu được cài đặt.',
    );
    if (ok) setRecount(false);
    setSaved(ok);
  }

  const providers = [...new Set(settings.models.map((m) => m.provider))];
  const q = fold(query.trim());
  const matching = settings.models.filter((m) => !q || fold(`${m.label} ${m.id}`).includes(q));
  const setMany = (models: Model[], on: boolean) => setEnabled((cur) => ({ ...cur, ...Object.fromEntries(models.filter((m) => !on || m.priced || m.enabled).map((m) => [m.id, on])) }));

  return (
    <>
      <fieldset>
        <legend>Video</legend>
        <p className="muted">Tạo video và Marketing Studio dùng chung ngân sách này.</p>
        <div className="fields">
          <Field
            label="Ngân sách tháng cho video"
            unit="USD"
            value={monthly}
            onChange={setMonthly}
            hint="Trần chung của cả công ty. Chạm mức (tính cả tiền đang tạm giữ) thì không ai bấm Run video được tới ngày 1 tháng sau. 200 USD ≈ 350 clip Kling 5 giây."
          />
          <Field label="Số clip tối đa mỗi Member mỗi ngày" unit="clip" numeric value={daily} onChange={setDaily} hint="Clip lỗi không mất tiền thì không tính." />
        </div>
      </fieldset>
      <fieldset>
        <legend>Ảnh và ứng dụng</legend>
        <p className="muted">Thử đồ, Tạo ảnh và các Ứng dụng ảnh; tách riêng khỏi ngân sách video, không tính video.</p>
        <div className="fields">
          <Field label="Ngân sách tháng cho ảnh và ứng dụng" unit="USD" value={features} onChange={setFeatures} hint="Trần chung của cả công ty. Chạm mức thì các trang này không bấm Run được tới ngày 1 tháng sau." />
          <Field label="Hạn mức mỗi Member mỗi ngày" unit="USD" value={memberDay} onChange={setMemberDay} />
          <Field label="Hạn mức mỗi Member mỗi tháng" unit="USD" value={memberMonth} onChange={setMemberMonth} />
        </div>
      </fieldset>
      <fieldset>
        <legend>Số dư nhà cung cấp</legend>
        <p className="muted">Số dư hiện trên trang Chi phí; nạp tiền ở trang thanh toán của từng nhà cung cấp.</p>
        <div className="fields">
          <Field label="Ngưỡng cảnh báo số dư" unit="USD" value={warning} onChange={setWarning} hint="Số dư dưới mức này hiện màu đỏ trên trang Chi phí." />
          <Field
            label="Số dư Replicate hiện tại"
            unit="USD"
            value={replicate}
            onChange={setReplicate}
            hint={`Xem trên trang thanh toán của Replicate rồi nhập vào đây (Replicate không có API số dư). App lấy số này trừ chi phí Replicate của các job chạy từ lúc lưu; nhập số khác thì đếm lại từ lúc lưu. Còn dưới 2 USD thì hệ thống tự tắt các mô hình Replicate và bật bản fal tương ứng (kiểm tra mỗi giờ). Để trống nếu không theo dõi.${settings.replicateCreditSince ? ` Đang đếm từ ${new Date(settings.replicateCreditSince).toLocaleString('vi-VN')}.` : ''}`}
          />
        </div>
        <label className="model">
          <input type="checkbox" checked={recount} disabled={!replicate.trim()} onChange={(e) => setRecount(e.target.checked)} />
          <span>Đếm lại từ bây giờ (sau khi nạp thêm mà số dư nhập vẫn như cũ)</span>
        </label>
      </fieldset>
      <fieldset>
        <legend>Cảnh báo theo mục</legend>
        <p className="muted">Chỉ để cảnh báo trên trang Chi phí (từ 80%), không chặn Run.</p>
        <div className="fields compact">
          {settings.featureCaps.map((c) => (
            <Field key={c.feature} label={featureLabel(c.feature)} unit="USD/tháng" value={soft[c.feature] ?? ''} onChange={(v) => setSoft((cur) => ({ ...cur, [c.feature]: v }))} />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Mô hình</legend>
        <div className="filters" role="search" aria-label="Tìm mô hình">
          <label>
            Tìm mô hình
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <p className="muted">
            {Object.values(enabled).filter(Boolean).length} trên {settings.models.length} mô hình đang bật
          </p>
        </div>
        {providers.map((p) => {
          const all = settings.models.filter((m) => m.provider === p);
          const models = matching.filter((m) => m.provider === p);
          if (models.length === 0) return null;
          return (
            <section key={p} className="model-set" aria-label={PROVIDER_NAME[p] ?? p}>
              <div className="model-set-head">
                <h3>{PROVIDER_NAME[p] ?? p}</h3>
                <span className="muted">
                  {all.filter((m) => enabled[m.id]).length}/{all.length} đang bật
                </span>
                <button type="button" className="small" aria-label={`Bật tất cả ${PROVIDER_NAME[p] ?? p}${q ? ' đang hiện' : ''}`} onClick={() => setMany(models, true)}>
                  Bật tất cả
                </button>
                <button type="button" className="small" aria-label={`Tắt tất cả ${PROVIDER_NAME[p] ?? p}${q ? ' đang hiện' : ''}`} onClick={() => setMany(models, false)}>
                  Tắt tất cả
                </button>
              </div>
              <div className="model-checks">
                {models.map((m) => (
                  <label key={m.id} className="model">
                    <input type="checkbox" checked={enabled[m.id]} disabled={!m.priced && !m.enabled} onChange={(e) => setEnabled((cur) => ({ ...cur, [m.id]: e.target.checked }))} />
                    <span>
                      {m.label}
                      <span className="sr-only"> ({m.provider})</span>
                      {!m.priced && <span className="tag">Chưa có giá nên chưa bật được</span>}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
        {matching.length === 0 && <p className="muted">Không có mô hình nào khớp “{query.trim()}”.</p>}
      </fieldset>
      {settings.vertexAccounts.length > 0 && (
        <fieldset>
          <legend>Tài khoản Vertex (Google Cloud)</legend>
          <p className="muted">
            Job Vertex mới đi vào tài khoản dùng được đầu tiên theo thứ tự dưới đây. Tài khoản bật “Dừng khi hết credits” thôi nhận job khi credits còn dưới 15 USD hoặc từ 1 ngày
            trước ngày hết hạn; hệ thống kiểm tra mỗi ngày và tự chuyển. Google không có API số dư nên credits còn lại = tổng nhập ở đây trừ credits đã dùng trong billing export.
          </p>
          <p>
            {settings.vertexActiveProject ? (
              <>
                Đang dùng: <strong>{settings.vertexActiveProject}</strong>
              </>
            ) : (
              <span className="error">Chưa có tài khoản Vertex nào dùng được: job Vertex mới sẽ bị từ chối.</span>
            )}
          </p>
          {settings.vertexAccounts.map((a) => {
            const v = vertex[a.projectId]!;
            return (
              <section key={a.projectId} className="model-set" aria-label={a.projectId}>
                <div className="model-set-head">
                  <h3>{a.projectId}</h3>
                  {a.projectId === settings.vertexActiveProject && <span className="tag">Đang dùng</span>}
                  {!a.configured && <span className="tag">Chưa có khóa trên máy chủ</span>}
                </div>
                <div className="fields">
                  <Field label="Tổng credits" unit={v.creditCurrency || '—'} value={v.creditTotal} onChange={(x) => setAccount(a.projectId, { creditTotal: x })} hint="Để trống nếu chưa biết." />
                  <label>
                    Đơn vị tiền
                    <input value={v.creditCurrency} maxLength={3} onChange={(e) => setAccount(a.projectId, { creditCurrency: e.target.value.toUpperCase() })} />
                  </label>
                  <label>
                    Credits hết hạn ngày
                    <input type="date" value={v.creditExpiresOn} onChange={(e) => setAccount(a.projectId, { creditExpiresOn: e.target.value })} />
                  </label>
                </div>
                <label className="model">
                  <input type="checkbox" checked={v.stopWhenCreditsEnd} onChange={(e) => setAccount(a.projectId, { stopWhenCreditsEnd: e.target.checked })} />
                  <span>Dừng khi hết credits (không để Google trừ tiền thẻ)</span>
                </label>
              </section>
            );
          })}
        </fieldset>
      )}
      <p className="muted">Mức mới áp dụng từ lần bấm Run tiếp theo, được ghi vào Nhật ký và tính theo giờ Việt Nam (tháng bắt đầu ngày 1, ngày bắt đầu lúc 0 giờ). Đặt 0 để khoá hẳn phần đó.</p>
      <p role="status" className="save-note">
        {saved && !dirty ? 'Đã lưu cài đặt.' : ''}
      </p>
      {(dirty || problem) && (
        <div className="save-bar" role="region" aria-label="Lưu cài đặt">
          {problem ? (
            <p className="error" role="alert">
              {problem}
            </p>
          ) : (
            <p>Có thay đổi chưa lưu.</p>
          )}
          {dirty && (
            <>
              <button type="button" onClick={undo}>
                Hoàn tác
              </button>
              <button type="button" className="primary" disabled={[monthly, daily, features, memberDay, memberMonth, ...Object.values(soft)].some((v) => v.trim() === '')} onClick={() => void save()}>
                Lưu cài đặt
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

export function AdminSettings() {
  const { data, failed, reload } = useFetch<Settings>('/api/admin/settings');
  return (
    <section aria-labelledby="settings-title">
      <PageHead id="settings-title" title="Cài đặt" lead="Ngân sách tháng, hạn mức mỗi người và các mô hình được dùng. Sửa xong bấm “Lưu cài đặt” ở thanh dưới cùng." />
      {data ? <SettingsForm settings={data} reload={reload} /> : failed ? <p className="error">Không tải được cài đặt.</p> : <p role="status">Đang tải...</p>}
    </section>
  );
}
