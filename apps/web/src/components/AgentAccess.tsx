'use client';
// Settings > "Kết nối AI" (Admins only): personal access tokens that let an AI tool (Claude Code, OpenMausBot) or a script call the API as the Admin,
// each with its own expiry and monthly cap (lib/agent-access.ts). The secret is shown once, right after it is made, and is gone when this section closes.
import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { ApiError, api, sendJson, startSignOut } from '@/lib/api';
import { sessionTime } from '@/lib/account-security';
import { levelOf, shareOf } from '@/lib/profile';
import { loginFor } from '@/lib/return-to';
import { passkeyDate } from '@/lib/sign-in-methods';
import { confirmDialog } from './Confirm';
import { Icon } from './Icon';
import { LoadError } from './LoadError';

/** A row of GET /api/agent-access/tokens. */
export interface AgentToken {
  id: string;
  name: string;
  kind: 'pat' | 'oauth';
  owner: { id: string; name: string; email: string };
  mine: boolean;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  status: 'active' | 'paused' | 'revoked' | 'expired';
  paused: boolean;
  capUsd: string;
  monthSpendUsd: string;
}
export type Created = { name: string; token: string; origin: string };
type Snippet = 'claude' | 'mausbot' | 'rest';

const STATUS: Record<AgentToken['status'], string> = { active: 'Đang dùng', paused: 'Tạm dừng', revoked: 'Đã thu hồi', expired: 'Hết hạn' };
const DAYS = [7, 30, 90] as const;
const COPIED = 'Đã sao chép.';
const COPY_FAILED = 'Không chép được, hãy bôi đen và chép tay.';
const usd = (v: string | number) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The text to paste into each tool, with the token filled in. The MCP endpoint (/api/mcp) ships in a later update; REST works today. */
export function snippet(kind: Snippet, origin: string, token: string): string {
  if (kind === 'claude') return `claude mcp add --scope user --transport http cvs ${origin}/api/mcp --header "Authorization: Bearer ${token}"`;
  if (kind === 'mausbot') return JSON.stringify({ mcpServers: { cvs: { type: 'http', url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${token}` }, enabled: true } } }, null, 2);
  return `curl -H "Authorization: Bearer ${token}" ${origin}/api/me/limits`;
}
const SNIPPETS: readonly (readonly [Snippet, string, string])[] = [
  ['claude', 'Claude Code', 'Chạy lệnh này trong terminal. MCP có trong bản cập nhật tới, nên lệnh chưa kết nối được ngay hôm nay.'],
  ['mausbot', 'OpenMausBot', 'Gộp vào mcpServers trong ~/.openmausbot/config.json. MCP có trong bản cập nhật tới, nên mục này chưa kết nối được ngay hôm nay.'],
  ['rest', 'REST (curl)', 'Dùng được ngay: lệnh này trả về hạn mức của bạn, để kiểm tra khoá.'],
];

/** Copies `text` and reports the result in the note; no clipboard outside a secure context (the LAN address over http). */
function copyText(text: string, setNote: (note: string) => void) {
  if (!navigator.clipboard) return setNote(COPY_FAILED);
  void navigator.clipboard.writeText(text).then(
    () => setNote(COPIED),
    () => setNote(COPY_FAILED),
  );
}

/** The new token, once: a read-only field to copy from, and the setup text for each tool with the token in it. */
export function ShowOnce({ created, note, onCopy, onClose }: { created: Created; note: string; onCopy: (text: string) => void; onClose: () => void }) {
  const [kind, setKind] = useState<Snippet>('claude');
  const id = useId();
  const text = snippet(kind, created.origin, created.token);
  const hint = SNIPPETS.find(([k]) => k === kind)![2];
  return (
    <div className="settings-card agent-once" role="group" aria-labelledby={`${id}-title`}>
      <p className="tf-step" id={`${id}-title`}>
        <strong>Đã tạo khoá “{created.name}”.</strong> Khoá chỉ hiện một lần. Đóng mục này là mất.
      </p>
      <label className="agent-label" htmlFor={`${id}-secret`}>
        Khoá truy cập
      </label>
      <div className="agent-secret-row">
        <input id={`${id}-secret`} className="agent-secret" readOnly spellCheck={false} value={created.token} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" onClick={() => onCopy(created.token)}>
          <Icon name="copy" size={16} />
          Sao chép
        </button>
      </div>
      <p className="agent-copied" aria-live="polite">
        {note}
      </p>
      <p className="agent-label" id={`${id}-tools`}>
        Dán vào công cụ AI
      </p>
      <div className="segmented agent-switch" role="group" aria-labelledby={`${id}-tools`}>
        {SNIPPETS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
      </div>
      <p className="pw-hint agent-hint">{hint}</p>
      <pre className="agent-snippet">
        <code>{text}</code>
      </pre>
      <div className="tf-buttons">
        <button type="button" onClick={() => onCopy(text)}>
          <Icon name="copy" size={16} />
          Sao chép lệnh
        </button>
        <button type="button" className="pw-submit" onClick={onClose}>
          Tôi đã lưu khoá
        </button>
      </div>
    </div>
  );
}

/** One token's spend this month against its cap, as the Limits section draws a cap. */
function Spend({ used, cap }: { used: string; cap: string }) {
  const share = shareOf(Number(used), Number(cap));
  const text = `${usd(used)} / ${usd(cap)}`;
  return (
    <div className="meter agent-spend" data-level={levelOf(share)}>
      <div className="meter-head">
        <span>Chi tháng này</span>
        <strong>{text}</strong>
      </div>
      <div className="meter-track" role="meter" aria-label="Chi tháng này" aria-valuemin={0} aria-valuemax={Number(cap)} aria-valuenow={Math.min(Number(used), Number(cap))} aria-valuetext={text}>
        <span style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

/** The inline form that sets a token's monthly cap. */
function CapForm({ token, onSaved, onCancel }: { token: AgentToken; onSaved: () => void; onCancel: () => void }) {
  const [cap, setCap] = useState(String(Number(token.capUsd)));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const id = useId();
  async function save(e: FormEvent) {
    e.preventDefault();
    const n = Number(cap);
    if (cap.trim() === '' || !(n >= 0 && n <= 1000)) return setError('Hạn mức là số từ 0 đến 1000.');
    setBusy(true);
    try {
      await api(`/api/agent-access/tokens/${token.id}`, sendJson('PATCH', { capUsd: n }));
      onSaved();
    } catch {
      setError('Không lưu được hạn mức. Hãy thử lại.');
      setBusy(false);
    }
  }
  return (
    <form className="pw-form agent-cap" onSubmit={save} noValidate>
      <label htmlFor={`${id}-cap`}>Hạn mức mỗi tháng (USD)</label>
      <input id={`${id}-cap`} type="number" inputMode="decimal" min={0} max={1000} step="0.01" autoFocus value={cap} onChange={(e) => setCap(e.target.value)} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="tf-buttons">
        <button type="submit" className="pw-submit" disabled={busy}>
          {busy ? 'Đang lưu...' : 'Lưu'}
        </button>
        <button type="button" onClick={onCancel}>
          Huỷ
        </button>
      </div>
    </form>
  );
}

/** The tokens, or the state of their loading. `all` adds each one's owner. */
export function TokenList({
  tokens,
  all,
  editing,
  onRetry,
  onEdit,
  onRevoke,
  onSaved,
}: {
  tokens: AgentToken[] | null | 'failed';
  all: boolean;
  editing: string | null;
  onRetry: () => unknown;
  onEdit: (id: string | null) => void;
  onRevoke: (token: AgentToken) => void;
  onSaved: () => void;
}) {
  if (tokens === 'failed') return <LoadError text="Không tải được danh sách khoá." onRetry={onRetry} />;
  if (!tokens)
    return (
      <p className="muted" role="status">
        Đang tải kết nối...
      </p>
    );
  if (tokens.length === 0) return <p className="settings-note">{all ? 'Chưa ai tạo khoá nào.' : 'Chưa có kết nối nào. Tạo khoá ở trên, rồi dán vào công cụ AI.'}</p>;
  return (
    <ul className="acct-rows" aria-label="Các khoá truy cập">
      {tokens.map((t) => {
        const live = t.status === 'active' || t.status === 'paused';
        return (
          <li key={t.id} className="acct-row agent-row" data-status={t.status}>
            <span className="acct-mark" aria-hidden="true">
              <Icon name="key" size={16} />
            </span>
            <span className="acct-text">
              <strong>{t.name}</strong>
              {all && <span>{t.mine ? 'Của bạn' : `Của ${t.owner.name}`}</span>}
              <span>
                Tạo {passkeyDate(t.createdAt)}
                {t.expiresAt && ` · ${t.status === 'expired' ? 'Đã hết hạn' : 'Hết hạn'} ${passkeyDate(t.expiresAt)}`}
              </span>
              <span>{t.lastUsedAt ? `Dùng lần cuối ${sessionTime(t.lastUsedAt)}${t.lastUsedIp ? ` từ ${t.lastUsedIp}` : ''}` : 'Chưa dùng lần nào'}</span>
            </span>
            <span className="acct-status" data-on={t.status === 'active' ? 'true' : undefined} data-status={t.status}>
              {STATUS[t.status]}
            </span>
            {t.paused && live && <p className="agent-paused">Đang tạm dừng: chủ khoá không còn là Admin.</p>}
            <Spend used={t.monthSpendUsd} cap={t.capUsd} />
            {live && editing !== t.id && (
              <div className="agent-actions">
                <button type="button" aria-label={`Sửa hạn mức của khoá ${t.name}`} onClick={() => onEdit(t.id)}>
                  Sửa hạn mức
                </button>
                <button type="button" className="agent-revoke" aria-label={`Thu hồi khoá ${t.name}`} onClick={() => onRevoke(t)}>
                  Thu hồi
                </button>
              </div>
            )}
            {live && editing === t.id && <CapForm token={t} onSaved={onSaved} onCancel={() => onEdit(null)} />}
          </li>
        );
      })}
    </ul>
  );
}

/** Signs out and opens the login, which comes back to this page: a token is made only from a sign-in of the last 10 minutes. */
async function signInAgain() {
  startSignOut();
  await api('/api/auth/sign-out', sendJson('POST', {})).catch(() => null);
  window.location.assign(loginFor(window.location.pathname + window.location.search));
}

export function AgentAccess() {
  const [tokens, setTokens] = useState<AgentToken[] | null | 'failed'>(null);
  const [enabled, setEnabled] = useState(true);
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [days, setDays] = useState<(typeof DAYS)[number]>(30);
  const [cap, setCap] = useState('20');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | 'reauth'>('');
  const [listError, setListError] = useState('');
  const [created, setCreated] = useState<Created | null>(null);
  const [note, setNote] = useState('');
  const id = useId();

  const load = useCallback(
    () =>
      api<{ enabled: boolean; tokens: AgentToken[] }>(`/api/agent-access/tokens${all ? '?all=1' : ''}`).then(
        (r) => {
          setEnabled(r.enabled);
          setTokens(r.tokens);
        },
        () => setTokens('failed'),
      ),
    [all],
  );
  useEffect(() => {
    setTokens(null);
    void load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    const n = Number(cap);
    if (!name.trim()) return setError('Hãy đặt tên cho khoá.');
    if (cap.trim() === '' || !(n >= 0 && n <= 1000)) return setError('Hạn mức là số từ 0 đến 1000.');
    setBusy(true);
    setError('');
    try {
      const made = await api<{ token: string }>('/api/agent-access/tokens', sendJson('POST', { name: name.trim(), days, capUsd: n }));
      setCreated({ name: name.trim(), token: made.token, origin: window.location.origin });
      setNote('');
      setName('');
      void load();
    } catch (err) {
      setError(
        err instanceof ApiError && err.message === 'reauth_required'
          ? 'reauth'
          : err instanceof ApiError && err.message === 'too_many_tokens'
            ? 'Bạn đã có 10 khoá. Thu hồi bớt rồi tạo lại.'
            : 'Không tạo được khoá. Hãy thử lại.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke(t: AgentToken) {
    const yes = await confirmDialog({ title: `Thu hồi khoá “${t.name}”?`, body: 'AI đang dùng khoá này sẽ mất quyền ngay.', confirmLabel: 'Thu hồi', danger: true });
    if (!yes) return;
    setListError('');
    try {
      await api(`/api/agent-access/tokens/${t.id}`, { method: 'DELETE' });
      await load();
    } catch {
      setListError('Không thu hồi được khoá. Hãy thử lại.');
    }
  }

  return (
    <>
      <p className="settings-note agent-intro">
        Khoá truy cập cho Claude Code, OpenMausBot hay một script dùng CVS bằng tài khoản của bạn: xem hạn mức, tải ảnh lên, chạy việc. Việc tốn tiền và phần lớn thay đổi cần AI xác nhận
        thêm một bước, và mỗi khoá có hạn mức chi riêng mỗi tháng. Khoá không đổi được mật khẩu, người dùng hay khoá khác.
      </p>
      {!enabled && <p className="settings-note">Kết nối AI đang tạm tắt.</p>}
      {enabled && created && (
        <ShowOnce
          created={created}
          note={note}
          onCopy={(text) => copyText(text, setNote)}
          onClose={() => {
            setCreated(null);
            setNote('');
          }}
        />
      )}
      {enabled && !created && (
        <>
          <p className="settings-kicker settings-sub" id={`${id}-new`}>
            Tạo khoá truy cập
          </p>
          <form className="pw-form settings-card agent-form" aria-labelledby={`${id}-new`} onSubmit={create} noValidate>
            <label htmlFor={`${id}-name`}>Tên khoá</label>
            <input id={`${id}-name`} maxLength={60} autoComplete="off" aria-describedby={`${id}-name-hint`} value={name} onChange={(e) => setName(e.target.value)} />
            <p className="pw-hint" id={`${id}-name-hint`}>
              Đặt theo nơi dùng, ví dụ Claude Code trên máy văn phòng. Tối đa 60 ký tự.
            </p>
            <label htmlFor={`${id}-days`}>Hạn dùng</label>
            <select id={`${id}-days`} value={days} onChange={(e) => setDays(Number(e.target.value) as (typeof DAYS)[number])}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d} ngày
                </option>
              ))}
            </select>
            <label htmlFor={`${id}-cap`}>Hạn mức mỗi tháng (USD)</label>
            <input
              id={`${id}-cap`}
              type="number"
              inputMode="decimal"
              min={0}
              max={1000}
              step="0.01"
              aria-describedby={`${id}-cap-hint`}
              value={cap}
              onChange={(e) => setCap(e.target.value)}
            />
            <p className="pw-hint" id={`${id}-cap-hint`}>
              Chi qua khoá này chạm hạn mức thì AI không chạy thêm việc tốn tiền. Đặt lại vào ngày 1 hằng tháng.
            </p>
            {error === 'reauth' ? (
              <div className="error agent-reauth" role="alert">
                <span>Vì an toàn, hãy đăng nhập lại rồi tạo khoá.</span>
                <button type="button" onClick={() => void signInAgain()}>
                  Đăng nhập lại
                </button>
              </div>
            ) : (
              error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )
            )}
            <div className="tf-buttons">
              <button type="submit" className="pw-submit" disabled={busy}>
                {busy ? 'Đang tạo...' : 'Tạo khoá'}
              </button>
            </div>
          </form>
        </>
      )}
      <div className="agent-list-head">
        <p className="settings-kicker settings-sub" id={`${id}-list`}>
          Các khoá
        </p>
        <div className="segmented agent-switch" role="group" aria-labelledby={`${id}-list`}>
          <button type="button" aria-pressed={!all} onClick={() => setAll(false)}>
            Của tôi
          </button>
          <button type="button" aria-pressed={all} onClick={() => setAll(true)}>
            Tất cả
          </button>
        </div>
      </div>
      {listError && (
        <p className="error" role="alert">
          {listError}
        </p>
      )}
      <TokenList tokens={tokens} all={all} editing={editing} onRetry={load} onEdit={setEditing} onRevoke={(t) => void revoke(t)} onSaved={() => (setEditing(null), void load())} />
    </>
  );
}
