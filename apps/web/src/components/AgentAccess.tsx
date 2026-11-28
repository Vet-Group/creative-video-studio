'use client';
// Settings > "Connect AI" (Admins only): an AI tool (Claude Code, OpenMausBot) connects by signing in (OAuth, lib/oauth.ts) or with a personal access
// token, and either way acts as the Admin under the same team and company caps (lib/agent-access.ts). A token's secret is shown once, right after it is made, and is
// gone when this section closes; an app that signed in is listed with its name and ended with Disconnect.
import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { ApiError, api, sendJson, startSignOut } from '@/lib/api';
import { sessionTime } from '@/lib/account-security';
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
  clientName?: string | null;
  owner: { id: string; name: string; email: string };
  mine: boolean;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  status: 'active' | 'paused' | 'revoked' | 'expired';
  paused: boolean;
  monthSpendUsd: string;
}
export type Created = { name: string; token: string; origin: string };
type Snippet = 'claude' | 'mausbot' | 'rest';

const STATUS: Record<AgentToken['status'], string> = { active: 'Đang dùng', paused: 'Tạm dừng', revoked: 'Đã thu hồi', expired: 'Hết hạn' };
const DAYS = [7, 30, 90] as const;
const COPIED = 'Đã sao chép.';
const COPY_FAILED = 'Không chép được, hãy bôi đen và chép tay.';
const usd = (v: string | number) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The text to paste into each tool, with the token filled in: the MCP endpoint (/api/mcp) for Claude Code and OpenMausBot (its mcpServers entry shape), REST for a script. */
export function snippet(kind: Snippet, origin: string, token: string): string {
  if (kind === 'claude') return `claude mcp add --scope user --transport http cvs ${origin}/api/mcp --header "Authorization: Bearer ${token}"`;
  if (kind === 'mausbot') return JSON.stringify({ mcpServers: { cvs: { type: 'http', url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${token}` }, enabled: true } } }, null, 2);
  return `curl -H "Authorization: Bearer ${token}" ${origin}/api/me/limits`;
}
/** The setup text of the sign-in way (OAuth): no token in it, the tool opens this site's consent page. */
export function signInSnippet(kind: 'claude' | 'mausbot', origin: string): string {
  if (kind === 'claude') return `claude mcp add --scope user --transport http cvs ${origin}/api/mcp`;
  return JSON.stringify({ mcpServers: { cvs: { type: 'http', url: `${origin}/api/mcp`, enabled: true } } }, null, 2);
}
const SIGN_IN: readonly (readonly ['claude' | 'mausbot', string, string])[] = [
  ['claude', 'Claude Code', 'Chạy lệnh này trong terminal, rồi gõ /mcp, chọn cvs, Authenticate. Trình duyệt mở trang của CVS để bạn bấm Cho phép.'],
  ['mausbot', 'OpenMausBot', 'Gộp vào mcpServers trong ~/.openmausbot/config.json, rồi bấm đăng nhập ở thẻ cvs mà OpenMausBot hiện ra. Trình duyệt mở trang của CVS để bạn bấm Cho phép.'],
];

/** The sign-in way: the command or config that points a tool at /api/mcp, which then asks for the Admin's approval in the browser. */
function SignInSetup({ note, onCopy }: { note: string; onCopy: (text: string) => void }) {
  const [kind, setKind] = useState<'claude' | 'mausbot'>('claude');
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const id = useId();
  const text = signInSnippet(kind, origin);
  return (
    <div className="settings-card agent-once" role="group" aria-labelledby={`${id}-tools`}>
      <p className="agent-label" id={`${id}-tools`}>
        Công cụ AI
      </p>
      <div className="segmented agent-switch" role="group" aria-labelledby={`${id}-tools`}>
        {SIGN_IN.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
      </div>
      <p className="pw-hint agent-hint">{SIGN_IN.find(([k]) => k === kind)![2]}</p>
      <pre className="agent-snippet">
        <code>{text}</code>
      </pre>
      <p className="agent-copied" aria-live="polite">
        {note}
      </p>
      <div className="tf-buttons">
        <button type="button" onClick={() => onCopy(text)}>
          <Icon name="copy" size={16} />
          Sao chép lệnh
        </button>
      </div>
    </div>
  );
}

const SNIPPETS: readonly (readonly [Snippet, string, string])[] = [
  ['claude', 'Claude Code', 'Chạy lệnh này trong terminal. Kiểm tra: hỏi AI “gọi whoami của cvs”.'],
  ['mausbot', 'OpenMausBot', 'Gộp vào mcpServers trong ~/.openmausbot/config.json. Kiểm tra: hỏi AI “gọi whoami của cvs”.'],
  ['rest', 'REST', 'Dùng được ngay: lệnh này trả về hạn mức của bạn, để kiểm tra khoá.'],
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

/** One token's spend this month, as the Limits section heads a meter. */
function Spend({ used }: { used: string }) {
  return (
    <div className="meter agent-spend">
      <div className="meter-head">
        <span>Đã chi tháng này</span>
        <strong>{usd(used)}</strong>
      </div>
    </div>
  );
}

/** The tokens, or the state of their loading. `all` adds each one's owner. */
export function TokenList({
  tokens,
  all,
  onRetry,
  onRevoke,
}: {
  tokens: AgentToken[] | null | 'failed';
  all: boolean;
  onRetry: () => unknown;
  onRevoke: (token: AgentToken) => void;
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
        const app = t.kind === 'oauth';
        return (
          <li key={t.id} className="acct-row agent-row" data-status={t.status}>
            <span className="acct-mark" aria-hidden="true">
              <Icon name={app ? 'link' : 'key'} size={16} />
            </span>
            <span className="acct-text">
              <strong>{t.name}</strong>
              {app && <span>Ứng dụng đã đăng nhập{t.clientName && t.clientName !== t.name ? ` · ${t.clientName}` : ''}</span>}
              {all && <span>{t.mine ? 'Của bạn' : `Của ${t.owner.name}`}</span>}
              <span>
                Tạo {passkeyDate(t.createdAt)}
                {t.expiresAt && ` · ${t.status === 'expired' ? 'Đã hết hạn' : 'Hết hạn'} ${passkeyDate(t.expiresAt)}`}
                {app && ' · Không hết hạn khi còn dùng'}
                {!app && !t.expiresAt && ' · Không hết hạn'}
              </span>
              <span>{t.lastUsedAt ? `Dùng lần cuối ${sessionTime(t.lastUsedAt)}${t.lastUsedIp ? ` từ ${t.lastUsedIp}` : ''}` : 'Chưa dùng lần nào'}</span>
            </span>
            <span className="acct-status" data-on={t.status === 'active' ? 'true' : undefined} data-status={t.status}>
              {STATUS[t.status]}
            </span>
            {t.paused && live && <p className="agent-paused">Đang tạm dừng: chủ khoá không còn là Admin.</p>}
            <Spend used={t.monthSpendUsd} />
            {live && (
              <div className="agent-actions">
                <button type="button" className="agent-revoke" aria-label={app ? `Ngắt kết nối ${t.name}` : `Thu hồi khoá ${t.name}`} onClick={() => onRevoke(t)}>
                  {app ? 'Ngắt kết nối' : 'Thu hồi'}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Signs out and opens the login, which comes back to this page: a token is made only from a sign-in of the last 10 minutes. */
export async function signInAgain() {
  startSignOut();
  await api('/api/auth/sign-out', sendJson('POST', {})).catch(() => null);
  window.location.assign(loginFor(window.location.pathname + window.location.search));
}

export function AgentAccess() {
  const [tokens, setTokens] = useState<AgentToken[] | null | 'failed'>(null);
  const [enabled, setEnabled] = useState(true);
  const [all, setAll] = useState(false);
  const [name, setName] = useState('');
  const [days, setDays] = useState<(typeof DAYS)[number] | null>(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | 'reauth'>('');
  const [listError, setListError] = useState('');
  const [created, setCreated] = useState<Created | null>(null);
  const [note, setNote] = useState('');
  const [signInNote, setSignInNote] = useState('');
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
    if (!name.trim()) return setError('Hãy đặt tên cho khoá.');
    setBusy(true);
    setError('');
    try {
      const made = await api<{ token: string }>('/api/agent-access/tokens', sendJson('POST', { name: name.trim(), days }));
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
    const yes = await confirmDialog(
      t.kind === 'oauth'
        ? { title: `Ngắt kết nối “${t.name}”?`, body: 'Ứng dụng này sẽ mất quyền ngay và phải đăng nhập lại.', confirmLabel: 'Ngắt kết nối', danger: true }
        : { title: `Thu hồi khoá “${t.name}”?`, body: 'AI đang dùng khoá này sẽ mất quyền ngay.', confirmLabel: 'Thu hồi', danger: true },
    );
    if (!yes) return;
    setListError('');
    try {
      await api(`/api/agent-access/tokens/${t.id}`, { method: 'DELETE' });
      await load();
    } catch {
      setListError(t.kind === 'oauth' ? 'Không ngắt được kết nối. Hãy thử lại.' : 'Không thu hồi được khoá. Hãy thử lại.');
    }
  }

  return (
    <>
      <p className="settings-note agent-intro">
        Cho Claude Code, OpenMausBot hay một script dùng CVS bằng tài khoản của bạn: xem hạn mức, tải ảnh lên, chạy việc. Việc tốn tiền và phần lớn thay đổi cần AI xác nhận thêm một
        bước. Việc tốn tiền vẫn tính vào hạn mức của team như khi dùng trên web. Kết nối không đổi được mật khẩu, người dùng hay khoá khác. Đổi mật khẩu hay đăng xuất mọi thiết bị khác sẽ ngắt mọi kết nối của bạn.
      </p>
      {!enabled && <p className="settings-note">Kết nối AI đang tạm tắt.</p>}
      {enabled && !created && (
        <>
          <p className="settings-kicker settings-sub">Cách 1: Đăng nhập (khuyên dùng)</p>
          <SignInSetup note={signInNote} onCopy={(text) => copyText(text, setSignInNote)} />
        </>
      )}
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
            Cách 2: Tạo khoá truy cập
          </p>
          <form className="pw-form settings-card agent-form" aria-labelledby={`${id}-new`} onSubmit={create} noValidate>
            <label htmlFor={`${id}-name`}>Tên khoá</label>
            <input id={`${id}-name`} maxLength={60} autoComplete="off" aria-describedby={`${id}-name-hint`} value={name} onChange={(e) => setName(e.target.value)} />
            <p className="pw-hint" id={`${id}-name-hint`}>
              Đặt theo nơi dùng, ví dụ Claude Code trên máy văn phòng. Tối đa 60 ký tự.
            </p>
            <label htmlFor={`${id}-days`}>Hạn dùng</label>
            <select
              id={`${id}-days`}
              value={days ?? 'never'}
              aria-describedby={days === null ? `${id}-days-hint` : undefined}
              onChange={(e) => setDays(e.target.value === 'never' ? null : (Number(e.target.value) as (typeof DAYS)[number]))}
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d} ngày
                </option>
              ))}
              <option value="never">Không hết hạn</option>
            </select>
            {days === null && (
              <p className="pw-hint" id={`${id}-days-hint`}>
                Khoá chỉ mất quyền khi bạn thu hồi nó.
              </p>
            )}
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
      <TokenList tokens={tokens} all={all} onRetry={load} onRevoke={(t) => void revoke(t)} />
    </>
  );
}
