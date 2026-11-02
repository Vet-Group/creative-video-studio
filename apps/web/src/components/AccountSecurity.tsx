// The Settings security section and the forced change page: changing one's own password, and the devices signed in to the account.
// Not a client entry: only client components (Settings, ForcedChange) import it, so its function props never cross from the server.
import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { changeFailure, deviceLabel, PASSWORD_LENGTH, passwordProblem, sessionTime } from '@/lib/account-security';
import { api, sendJson } from '@/lib/api';
import { Icon } from './Icon';

/** The caller's session as GET /api/me/sessions lists it. */
interface SessionItem {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  current: boolean;
}

/** Changes the signed-in user's password and signs every other device out; `onDone` runs after a change. */
export function PasswordChange({ onDone, submitText = 'Đổi mật khẩu' }: { onDone?: () => void; submitText?: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [shown, setShown] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    const problem = passwordProblem(current, next, confirm);
    setError(problem ?? '');
    if (problem) return;
    setBusy(true);
    try {
      await api('/api/auth/change-password', sendJson('POST', { currentPassword: current, newPassword: next, revokeOtherSessions: true }));
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
      onDone?.();
    } catch (err) {
      setError(changeFailure(err));
    } finally {
      setBusy(false);
    }
  }

  const type = shown ? 'text' : 'password';
  return (
    <form className="pw-form" onSubmit={(e) => void submit(e)} noValidate>
      <label htmlFor={`${id}-current`}>Mật khẩu hiện tại</label>
      <input id={`${id}-current`} type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <label htmlFor={`${id}-next`}>Mật khẩu mới</label>
      <input
        id={`${id}-next`}
        type={type}
        autoComplete="new-password"
        maxLength={PASSWORD_LENGTH.max}
        aria-describedby={`${id}-hint`}
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <p className="pw-hint" id={`${id}-hint`}>
        Ít nhất {PASSWORD_LENGTH.min} ký tự, khác mật khẩu hiện tại.
      </p>
      <label htmlFor={`${id}-confirm`}>Nhập lại mật khẩu mới</label>
      <input id={`${id}-confirm`} type={type} autoComplete="new-password" maxLength={PASSWORD_LENGTH.max} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <label className="pw-show">
        <input type="checkbox" checked={shown} onChange={(e) => setShown(e.target.checked)} />
        Hiện mật khẩu
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="pw-done" role="status">
          Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.
        </p>
      )}
      <button type="submit" className="pw-submit" disabled={busy}>
        {busy ? 'Đang đổi...' : submitText}
      </button>
    </form>
  );
}

/** The devices signed in to the account, with sign-out for each other one or all of them at once. */
export function Sessions() {
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSessions((await api<{ sessions: SessionItem[] }>('/api/me/sessions')).sessions);
    } catch {
      setError('Không tải được danh sách phiên đăng nhập. Hãy thử lại sau.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(id?: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/me/sessions${id ? `?id=${encodeURIComponent(id)}` : ''}`, { method: 'DELETE' });
    } catch {
      setError('Không đăng xuất được. Hãy thử lại.');
    }
    await load();
    setBusy(false);
  }

  if (!sessions) return error ? <p className="error" role="alert">{error}</p> : <p className="muted">Đang tải phiên đăng nhập...</p>;
  const others = sessions.filter((s) => !s.current).length;
  return (
    <>
      <ul className="acct-rows" aria-label="Phiên đăng nhập">
        {sessions.map((s) => {
          const device = deviceLabel(s.userAgent);
          return (
            <li key={s.id} className="acct-row">
              <span className="acct-mark" aria-hidden="true">
                <Icon name="key" size={16} />
              </span>
              <span className="acct-text">
                <strong>{device}</strong>
                <span>
                  {s.ipAddress ?? 'IP không rõ'} · Đăng nhập lúc {sessionTime(s.createdAt).replace(' ', '\u00a0')}
                </span>
              </span>
              {s.current ? (
                <span className="acct-status" data-on="true">
                  Thiết bị này
                </span>
              ) : (
                <button type="button" aria-label={`Đăng xuất ${device}`} disabled={busy} onClick={() => void revoke(s.id)}>
                  Đăng xuất
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {others > 0 ? (
        <div className="actions">
          <button type="button" disabled={busy} onClick={() => void revoke()}>
            Đăng xuất các thiết bị khác
          </button>
        </div>
      ) : (
        <p className="muted">Không có thiết bị nào khác đang đăng nhập.</p>
      )}
    </>
  );
}
