'use client';
// Settings > "Connect AI" (Admins only): an AI tool (Claude Code, OpenMausBot) connects by signing in (OAuth, lib/oauth.ts) or with a personal access
// token, and either way acts as the Admin under the same team and company caps (lib/agent-access.ts). Three steps lead the way: pick the tool, connect
// it, and check that CVS saw its first call (tokens/[id]/check, or the list for an app that signed in), never with the secret. A token's secret is shown
// once, right after it is made, and is gone when this section closes; each connection below can be checked and its recent activity read.
import { type FormEvent, type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { ApiError, api, sendJson, startSignOut } from '@/lib/api';
import { sessionTime } from '@/lib/account-security';
import type { ActivityItem } from '@/lib/agent-activity';
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
/** The answer of GET /api/agent-access/tokens/[id]/check. */
export interface TokenCheck {
  id: string;
  ok: boolean;
  status: AgentToken['status'];
  reason: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  monthSpendUsd: string;
}
export type Created = { id?: string; name: string; token: string; origin: string };
export type Tool = 'claude' | 'mausbot' | 'rest';

const STATUS: Record<AgentToken['status'], string> = { active: 'Đang dùng', paused: 'Tạm dừng', revoked: 'Đã thu hồi', expired: 'Hết hạn' };
const DAYS = [7, 30, 90] as const;
const COPIED = 'Đã sao chép.';
const COPY_FAILED = 'Không chép được, hãy bôi đen và chép tay.';
const TOOL_KEY = 'cvs.agent-tool';
const POLL_MS = 3000;
const WAIT_MS = 120_000;
const usd = (v: string | number) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clock = (iso: string) => new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));

/** Why the check says a connection cannot be used now (the reasons of tokens/[id]/check). */
export const REASON: Record<string, string> = {
  revoked: 'Đã thu hồi: AI không dùng được nữa.',
  expired: 'Đã hết hạn: tạo khoá mới để dùng tiếp.',
  not_admin: 'Tạm dừng: chủ khoá không còn là Admin.',
  banned: 'Không dùng được: tài khoản của chủ khoá đang bị khoá.',
  password_change_required: 'Không dùng được: chủ khoá phải đổi mật khẩu trước.',
  workspace: 'Không dùng được: chủ khoá không còn ở workspace của khoá.',
  agent_api_off: 'Không dùng được: Kết nối AI đang tạm tắt cho cả hệ thống.',
};
const reasonText = (reason: string | null) => (reason && REASON[reason]) || 'Không dùng được lúc này.';

/** The text to paste into each tool, with the token filled in: the MCP endpoint (/api/mcp) for Claude Code and OpenMausBot (its mcpServers entry shape), REST for a script. */
export function snippet(kind: Tool, origin: string, token: string): string {
  if (kind === 'claude') return `claude mcp add --scope user --transport http cvs ${origin}/api/mcp --header "Authorization: Bearer ${token}"`;
  if (kind === 'mausbot') return JSON.stringify({ mcpServers: { cvs: { type: 'http', url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${token}` }, enabled: true } } }, null, 2);
  return `curl -H "Authorization: Bearer ${token}" ${origin}/api/me/limits`;
}
/** The setup text of the sign-in way (OAuth): no token in it, the tool opens this site's consent page. */
export function signInSnippet(kind: 'claude' | 'mausbot', origin: string): string {
  if (kind === 'claude') return `claude mcp add --scope user --transport http cvs ${origin}/api/mcp`;
  return JSON.stringify({ mcpServers: { cvs: { type: 'http', url: `${origin}/api/mcp`, enabled: true } } }, null, 2);
}

export const TOOLS: readonly (readonly [Tool, string])[] = [
  ['claude', 'Claude Code'],
  ['mausbot', 'OpenMausBot'],
  ['rest', 'Script (REST)'],
];
const KEY_HINT: Record<Tool, string> = {
  claude: 'Chạy lệnh này trong terminal. Kiểm tra: hỏi AI “gọi whoami của cvs”.',
  mausbot: 'Gộp vào mcpServers trong ~/.openmausbot/config.json. Kiểm tra: hỏi AI “gọi whoami của cvs”.',
  rest: 'Dùng được ngay: lệnh này trả về hạn mức của bạn, để kiểm tra khoá.',
};

/** Copies `text` and reports the result in the note; no clipboard outside a secure context (the LAN address over http). True when it copied. */
function copyText(text: string, setNote: (note: string) => void): Promise<boolean> {
  if (!navigator.clipboard) {
    setNote(COPY_FAILED);
    return Promise.resolve(false);
  }
  return navigator.clipboard.writeText(text).then(
    () => (setNote(COPIED), true),
    () => (setNote(COPY_FAILED), false),
  );
}

/** A copy button whose icon turns to a tick for a moment after a copy, beside the note that the live region reads out. */
function CopyButton({ text, label, onCopy, className }: { text: string; label: string; onCopy: (text: string) => unknown; className?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button type="button" className={`agent-copy${className ? ` ${className}` : ''}`} data-done={done || undefined} onClick={() => void Promise.resolve(onCopy(text)).then((ok) => ok === true && setDone(true))}>
      <Icon name={done ? 'check' : 'copy'} size={16} />
      {label}
    </button>
  );
}

/** The sign-in way: the command or config that points a tool at /api/mcp, which then asks for the Admin's approval in the browser. */
export function SignInSetup({ kind, origin, note, onCopy, onUseKey }: { kind: 'claude' | 'mausbot'; origin: string; note: string; onCopy: (text: string) => unknown; onUseKey: () => void }) {
  const text = signInSnippet(kind, origin);
  return (
    <div className="agent-way">
      <p className="agent-way-head">
        <strong>Đăng nhập</strong>
        <span className="agent-tag">Khuyên dùng</span>
      </p>
      <p className="pw-hint agent-hint">
        {kind === 'claude' ? 'Chạy lệnh này trong terminal. Không cần chép khoá nào.' : 'Gộp vào mcpServers trong ~/.openmausbot/config.json. Không cần chép khoá nào.'}
      </p>
      <pre className="agent-snippet" translate="no">
        <code>{text}</code>
      </pre>
      <p className="agent-then">
        {kind === 'claude' ? (
          <>
            Rồi gõ <kbd translate="no">/mcp</kbd> → <b>cvs</b> → <b>Authenticate</b>, và bấm Cho phép trên trang CVS vừa mở.
          </>
        ) : (
          <>
            Rồi bấm <b>Đăng nhập</b> ở thẻ cvs trong OpenMausBot, và bấm Cho phép trên trang CVS vừa mở.
          </>
        )}
      </p>
      <p className="agent-copied" aria-live="polite">
        {note}
      </p>
      <div className="tf-buttons">
        <CopyButton text={text} label={kind === 'claude' ? 'Sao chép lệnh' : 'Sao chép cấu hình'} onCopy={onCopy} />
        <button type="button" className="agent-alt" onClick={onUseKey}>
          <Icon name="key" size={16} />
          Dùng khoá truy cập
        </button>
      </div>
    </div>
  );
}

/** The new token, once: a read-only field to copy from, and the setup text for the tool picked in step 1 with the token in it. */
export function ShowOnce({ created, kind = 'claude', note, onCopy, onClose }: { created: Created; kind?: Tool; note: string; onCopy: (text: string) => unknown; onClose: () => void }) {
  const id = useId();
  const text = snippet(kind, created.origin, created.token);
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
        <CopyButton text={created.token} label="Sao chép" onCopy={onCopy} />
      </div>
      <p className="agent-copied" aria-live="polite">
        {note}
      </p>
      <p className="agent-label">Dán vào {TOOLS.find(([k]) => k === kind)![1]}</p>
      <p className="pw-hint agent-hint">{KEY_HINT[kind]}</p>
      <pre className="agent-snippet" translate="no">
        <code>{text}</code>
      </pre>
      <div className="tf-buttons">
        <CopyButton text={text} label="Sao chép lệnh" onCopy={onCopy} />
        <button type="button" className="pw-submit" onClick={onClose}>
          Tôi đã lưu khoá
        </button>
      </div>
    </div>
  );
}

type Probe = { state: 'idle' } | { state: 'wait' } | { state: 'ok'; at: string } | { state: 'timeout' } | { state: 'warn'; reason: string | null };

/**
 * Step 3: polls every 3 s for up to 2 minutes until CVS has seen a call. With `keyId` it asks that key's check (from the moment the key is made);
 * otherwise it watches the caller's signed-in apps for a use newer than when it started, and a use in the last 5 minutes counts at once.
 */
export function ConnectCheck({ keyId, oauth, arm, onConnected, tool }: { keyId: string | null; oauth: boolean; arm: number; onConnected: () => void; tool: Tool }) {
  const [probe, setProbe] = useState<Probe>({ state: 'idle' });
  const run = useRef(0);
  const target = keyId ? `key:${keyId}` : oauth ? 'oauth' : null;

  const begin = useCallback(async () => {
    if (!target) return;
    const mine = ++run.current;
    setProbe({ state: 'wait' });
    const until = Date.now() + WAIT_MS;
    let seen: Map<string, string | null> | null = null;
    while (run.current === mine) {
      try {
        if (keyId) {
          const c = await api<TokenCheck>(`/api/agent-access/tokens/${keyId}/check`);
          if (run.current !== mine) return;
          if (!c.ok) return setProbe({ state: 'warn', reason: c.reason });
          if (c.lastUsedAt) {
            onConnected();
            return setProbe({ state: 'ok', at: c.lastUsedAt });
          }
        } else {
          const r = await api<{ tokens: AgentToken[] }>('/api/agent-access/tokens');
          if (run.current !== mine) return;
          const apps = r.tokens.filter((t) => t.kind === 'oauth' && t.status === 'active');
          const fresh = seen
            ? apps.find((t) => t.lastUsedAt && seen!.get(t.id) !== t.lastUsedAt)
            : apps.find((t) => t.lastUsedAt && Date.now() - new Date(t.lastUsedAt).getTime() < 5 * 60_000);
          if (fresh) {
            onConnected();
            return setProbe({ state: 'ok', at: fresh.lastUsedAt! });
          }
          seen ??= new Map(apps.map((t) => [t.id, t.lastUsedAt]));
        }
      } catch {
        // One failed poll is no answer: keep asking until the 2 minutes are up.
      }
      if (Date.now() >= until) return setProbe({ state: 'timeout' });
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }, [target, keyId, onConnected]);

  useEffect(() => {
    run.current++;
    setProbe({ state: 'idle' });
    if (target?.startsWith('key:')) void begin(); // a key was just made: wait for its first call at once
  }, [target]); // restart only when the thing to watch changes
  useEffect(() => {
    if (arm && target === 'oauth') void begin(); // the sign-in text was copied
  }, [arm]);
  useEffect(
    () => () => {
      run.current++; // stop polling when the section closes
    },
    [],
  );

  if (!target)
    return (
      <p className="agent-probe" data-state="idle">
        Tạo khoá ở bước 2, rồi quay lại đây.
      </p>
    );
  const waiting = probe.state === 'wait';
  return (
    <>
      <p className="agent-probe" data-state={probe.state} role="status">
        {probe.state === 'idle' && (keyId ? 'Bấm Kiểm tra sau khi dán khoá vào công cụ.' : 'Sau khi bấm Cho phép, bấm Kiểm tra. CVS báo khi nhận được lần gọi đầu tiên.')}
        {waiting && (
          <>
            <span className="agent-spin" aria-hidden="true" />
            <span>
              Đang chờ lần gọi đầu tiên… <span className="agent-probe-sub">{tool === 'rest' ? 'Chạy lệnh curl ở bước 2 để thử.' : 'Hỏi AI “gọi whoami của cvs” để thử.'}</span>
            </span>
          </>
        )}
        {probe.state === 'ok' && (
          <>
            <Icon name="check" size={16} />
            <span>Đã kết nối lúc {clock(probe.at)}.</span>
          </>
        )}
        {probe.state === 'timeout' && 'Chưa thấy lần gọi nào trong 2 phút. Xem lại bước 2 rồi bấm Kiểm tra lại.'}
        {probe.state === 'warn' && (
          <>
            <Icon name="x" size={16} />
            <span>{reasonText(probe.reason)}</span>
          </>
        )}
      </p>
      <div className="tf-buttons">
        <button type="button" aria-disabled={waiting || undefined} onClick={() => !waiting && void begin()}>
          <Icon name="pulse" size={16} />
          {probe.state === 'idle' ? 'Kiểm tra' : 'Kiểm tra lại'}
        </button>
      </div>
    </>
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

/** The check line of a row: OK with the last use, or why the connection cannot be used. */
export function CheckLine({ check }: { check: TokenCheck | 'busy' | 'failed' }) {
  if (check === 'busy')
    return (
      <p className="agent-check" role="status">
        <span className="agent-spin" aria-hidden="true" />
        Đang kiểm tra…
      </p>
    );
  if (check === 'failed')
    return (
      <p className="agent-check" data-ok="false" role="status">
        <Icon name="x" size={16} />
        Không kiểm tra được. Hãy thử lại.
      </p>
    );
  const text = !check.ok
    ? reasonText(check.reason)
    : check.lastUsedAt
      ? `Kết nối tốt. Dùng lần cuối ${sessionTime(check.lastUsedAt)}${check.lastUsedIp ? ` từ ${check.lastUsedIp}` : ''}.`
      : 'Sẵn sàng, nhưng AI chưa gọi lần nào.';
  return (
    <p className="agent-check" data-ok={check.ok ? 'true' : 'false'} role="status">
      <Icon name={check.ok ? 'check' : 'x'} size={16} />
      {text}
    </p>
  );
}

/** The activity panel of a row: newest first, 20 at a time, a "show more" button for the next page. */
export function ActivityLog({ items, next, busy, failed, onMore, onRetry }: { items: ActivityItem[] | null; next: string | null; busy: boolean; failed: boolean; onMore: () => void; onRetry: () => void }) {
  if (failed && !items) return <LoadError text="Không tải được hoạt động." onRetry={onRetry} />;
  if (!items)
    return (
      <p className="muted" role="status">
        Đang tải hoạt động…
      </p>
    );
  if (items.length === 0) return <p className="agent-log-empty">Chưa có hoạt động nào.</p>;
  return (
    <>
      <ol className="agent-log-rows">
        {items.map((i) => (
          <li key={i.id} className="agent-log-row" data-ok={i.ok ? undefined : 'false'}>
            <span className="agent-log-label">{i.label}</span>
            <span className="agent-log-meta">
              <time dateTime={i.at}>{sessionTime(i.at)}</time>
              {i.method && i.path && (
                <code className="agent-log-path" translate="no">
                  {i.method} {i.path}
                </code>
              )}
            </span>
          </li>
        ))}
      </ol>
      {failed && (
        <p className="error" role="alert">
          Không tải thêm được. Hãy thử lại.
        </p>
      )}
      {next && (
        <button type="button" className="agent-more" disabled={busy} onClick={onMore}>
          {busy ? 'Đang tải…' : 'Xem thêm'}
        </button>
      )}
    </>
  );
}

/** A row's tools: check it now, read its recent activity, and revoke it (`revoke`, only while it can still be used). */
function RowTools({ t, revoke }: { t: AgentToken; revoke: ReactNode }) {
  const [check, setCheck] = useState<TokenCheck | 'busy' | 'failed' | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const panel = useId();

  async function runCheck() {
    setCheck('busy');
    setCheck(await api<TokenCheck>(`/api/agent-access/tokens/${t.id}/check`).catch(() => 'failed' as const));
  }
  async function page(before: string | null) {
    setBusy(true);
    setFailed(false);
    try {
      const r = await api<{ items: ActivityItem[]; next: string | null }>(`/api/agent-access/tokens/${t.id}/activity?limit=20${before ? `&before=${before}` : ''}`);
      setItems((old) => (before && old ? [...old, ...r.items] : r.items));
      setNext(r.next);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  function toggle() {
    if (!open && !items) void page(null);
    setOpen(!open);
  }

  return (
    <>
      <div className="agent-actions">
        <button type="button" aria-label={`Kiểm tra kết nối ${t.name}`} onClick={() => void runCheck()} disabled={check === 'busy'}>
          <Icon name="pulse" size={16} />
          Kiểm tra kết nối
        </button>
        <button type="button" aria-expanded={open} aria-controls={panel} onClick={toggle}>
          <Icon name="log" size={16} />
          Hoạt động gần đây
          <Icon name="down" size={16} />
        </button>
        {revoke}
      </div>
      {check && <CheckLine check={check} />}
      <div id={panel} className="agent-log" hidden={!open} role="region" aria-label={`Hoạt động gần đây của ${t.name}`}>
        {open && <ActivityLog items={items} next={next} busy={busy} failed={failed} onMore={() => void page(next)} onRetry={() => void page(null)} />}
      </div>
    </>
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
  if (tokens.length === 0) return <p className="settings-note">{all ? 'Chưa ai tạo khoá nào.' : 'Chưa có kết nối nào. Làm theo ba bước ở trên để kết nối.'}</p>;
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
            <RowTools
              t={t}
              revoke={
                live && (
                  <button type="button" className="agent-revoke" aria-label={app ? `Ngắt kết nối ${t.name}` : `Thu hồi khoá ${t.name}`} onClick={() => onRevoke(t)}>
                    {app ? 'Ngắt kết nối' : 'Thu hồi'}
                  </button>
                )
              }
            />
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

/** One numbered step of the setup; `done` turns its number into a tick. */
function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <li className="agent-step" data-done={done || undefined}>
      <span className="agent-step-n" aria-hidden="true">
        {done ? <Icon name="check" size={14} /> : n}
      </span>
      <div className="agent-step-body">
        <h4 className="agent-step-title" id={id}>
          <span className="sr-only">Bước {n}: </span>
          {title}
        </h4>
        {children}
      </div>
    </li>
  );
}

export function AgentAccess() {
  const [tokens, setTokens] = useState<AgentToken[] | null | 'failed'>(null);
  const [enabled, setEnabled] = useState(true);
  const [all, setAll] = useState(false);
  const [tool, setTool] = useState<Tool>('claude');
  const [useKey, setUseKey] = useState(false);
  const [origin, setOrigin] = useState('');
  const [name, setName] = useState('');
  const [days, setDays] = useState<(typeof DAYS)[number] | null>(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | 'reauth'>('');
  const [listError, setListError] = useState('');
  const [created, setCreated] = useState<Created | null>(null);
  const [keyId, setKeyId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [arm, setArm] = useState(0);
  const [note, setNote] = useState('');
  const [signInNote, setSignInNote] = useState('');
  const id = useId();

  useEffect(() => {
    setOrigin(window.location.origin);
    try {
      const saved = localStorage.getItem(TOOL_KEY);
      if (saved === 'claude' || saved === 'mausbot' || saved === 'rest') setTool(saved);
    } catch {
      // No storage (a private window): start from Claude Code.
    }
  }, []);

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
  const onConnected = useCallback(() => {
    setConnected(true);
    void load();
  }, [load]);

  function pick(next: Tool) {
    setTool(next);
    setConnected(false);
    setSignInNote('');
    try {
      localStorage.setItem(TOOL_KEY, next);
    } catch {
      // The choice is only a convenience; not keeping it changes nothing else.
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Hãy đặt tên cho khoá.');
    setBusy(true);
    setError('');
    try {
      const made = await api<{ id: string; token: string }>('/api/agent-access/tokens', sendJson('POST', { name: name.trim(), days }));
      setCreated({ id: made.id, name: name.trim(), token: made.token, origin: window.location.origin });
      setKeyId(made.id);
      setConnected(false);
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

  // The key way: a script always, a tool when its sign-in cannot open a browser.
  const keyWay = tool === 'rest' || useKey;
  const form = (
    <form className="pw-form agent-form" aria-labelledby={`${id}-new`} onSubmit={create} noValidate>
      <p className="agent-way-head" id={`${id}-new`}>
        <strong>Tạo khoá truy cập</strong>
      </p>
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
        {tool !== 'rest' && (
          <button type="button" className="agent-alt" onClick={() => setUseKey(false)}>
            Quay lại cách đăng nhập
          </button>
        )}
      </div>
    </form>
  );

  return (
    <>
      <p className="settings-note agent-intro">
        Cho Claude Code, OpenMausBot hay một script dùng CVS bằng tài khoản của bạn: xem hạn mức, tải ảnh lên, chạy việc. Việc tốn tiền và phần lớn thay đổi cần AI xác nhận thêm một
        bước. Việc tốn tiền vẫn tính vào hạn mức của team như khi dùng trên web. Kết nối không đổi được mật khẩu, người dùng hay khoá khác. Đổi mật khẩu hay đăng xuất mọi thiết bị khác sẽ ngắt mọi kết nối của bạn.
      </p>
      {!enabled && <p className="settings-note">Kết nối AI đang tạm tắt.</p>}
      {enabled && (
        <ol className="settings-card agent-steps">
          <Step n={1} title="Chọn công cụ" done={connected}>
            <div className="segmented agent-switch" role="group" aria-label="Công cụ AI">
              {TOOLS.map(([k, label]) => (
                <button key={k} type="button" aria-pressed={tool === k} onClick={() => pick(k)}>
                  {label}
                </button>
              ))}
            </div>
          </Step>
          <Step n={2} title="Kết nối" done={connected}>
            {created ? (
              <ShowOnce
                created={created}
                kind={tool}
                note={note}
                onCopy={(text) => copyText(text, setNote)}
                onClose={() => {
                  setCreated(null);
                  setNote('');
                }}
              />
            ) : keyWay ? (
              form
            ) : (
              <SignInSetup
                kind={tool as 'claude' | 'mausbot'}
                origin={origin}
                note={signInNote}
                onCopy={(text) =>
                  copyText(text, setSignInNote).then((ok) => {
                    if (ok) setArm((a) => a + 1);
                    return ok;
                  })
                }
                onUseKey={() => setUseKey(true)}
              />
            )}
          </Step>
          <Step n={3} title="Kiểm tra" done={connected}>
            <ConnectCheck keyId={keyWay ? keyId : null} oauth={!keyWay} arm={arm} onConnected={onConnected} tool={tool} />
          </Step>
        </ol>
      )}
      <div className="agent-list-head">
        <p className="settings-kicker settings-sub" id={`${id}-list`}>
          Khoá và kết nối
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
