// The Settings security section and the forced change page: changing one's own password, two-factor sign-in, and the devices signed in to the account.
// Not a client entry: only client components (Settings, ForcedChange) import it, so its function props never cross from the server.
import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { encode } from 'uqr';
import { changeFailure, deviceLabel, PASSWORD_LENGTH, passwordProblem, SESSIONS_SHOWN, sessionTime, visibleSessions } from '@/lib/account-security';
import { api, sendJson } from '@/lib/api';
import { backupCodesText, manualSecret, twoFactorCall, twoFactorFailure } from '@/lib/two-factor';
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
  const [all, setAll] = useState(false);

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
  const hidden = sessions.length - SESSIONS_SHOWN;
  return (
    <>
      <ul className="acct-rows" aria-label="Phiên đăng nhập">
        {visibleSessions(sessions, all).map((s) => {
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
      {hidden > 0 && (
        <button type="button" className="link-button" aria-expanded={all} onClick={() => setAll((a) => !a)}>
          {all ? 'Thu gọn' : `Xem tất cả ${sessions.length} phiên`}
        </button>
      )}
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

/** An otpauth:// link as a QR code, drawn as one path; dark on white in both themes, as authenticator apps read best. */
function Qr({ uri }: { uri: string }) {
  const { data } = encode(uri, { border: 2, ecc: 'M' });
  const d = data.flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ''))).join('');
  return (
    <svg className="tf-qr" viewBox={`0 0 ${data.length} ${data.length}`} role="img" aria-label="Mã QR để thêm tài khoản vào ứng dụng xác thực" shapeRendering="crispEdges">
      <rect width={data.length} height={data.length} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

type TwoFactorAction = 'enable' | 'regenerate' | 'disable';
const ACTION_SUBMIT: Record<TwoFactorAction, string> = { enable: 'Tiếp tục', regenerate: 'Tạo mã mới', disable: 'Tắt xác thực 2 lớp' };
const ACTION_HINT: Record<TwoFactorAction, string> = {
  enable: 'Nhập mật khẩu để bắt đầu.',
  regenerate: 'Các mã dự phòng cũ sẽ không dùng được nữa.',
  disable: 'Sau khi tắt, chỉ cần mật khẩu là đăng nhập được.',
};

/**
 * Optional TOTP two-factor sign-in: turning it on (password, QR code, a first code, then the backup codes once), new backup codes and
 * turning it off, each behind the password. `onChange` gets the new state; turning it on or off also replaces the sign-in session.
 */
export function TwoFactor({ email, hasPassword, on, onChange }: { email: string; hasPassword: boolean; on: boolean; onChange: (on: boolean) => void }) {
  const [action, setAction] = useState<TwoFactorAction | null>(null);
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<{ uri: string; codes: string[] } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const id = useId();

  function start(next: TwoFactorAction | null) {
    setAction(next);
    setPassword('');
    setSetup(null);
    setCode('');
    setError('');
  }
  async function attempt(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(twoFactorFailure(err));
    } finally {
      setBusy(false);
    }
  }
  function submitPassword(e: FormEvent) {
    e.preventDefault();
    if (!password) return setError('Hãy nhập mật khẩu.');
    void attempt(async () => {
      if (action === 'enable') {
        const r = await twoFactorCall<{ totpURI: string; backupCodes: string[] }>('enable', { password });
        setSetup({ uri: r.totpURI, codes: r.backupCodes });
        setPassword('');
      } else if (action === 'regenerate') {
        setCodes((await twoFactorCall<{ backupCodes: string[] }>('generate-backup-codes', { password })).backupCodes);
        start(null);
      } else {
        await twoFactorCall('disable', { password });
        start(null);
        onChange(false);
      }
    });
  }
  function confirm(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Hãy nhập đủ 6 số trong ứng dụng xác thực.');
    void attempt(async () => {
      await twoFactorCall('verify-totp', { code });
      setCodes(setup!.codes);
      start(null);
      onChange(true);
    });
  }
  const copy = () => navigator.clipboard.writeText(codes!.join('\n')).then(() => setNote('Đã sao chép.'), () => setNote('Không sao chép được.'));
  const idle = action === null && !codes;
  const problem = error && (
    <p className="error" role="alert">
      {error}
    </p>
  );

  return (
    <>
      <ul className="acct-rows">
        <li className="acct-row">
          <span className="acct-mark" aria-hidden="true">
            <Icon name="lock" size={16} />
          </span>
          <span className="acct-text">
            <strong>Ứng dụng xác thực</strong>
            <span>Hỏi thêm mã 6 số từ ứng dụng xác thực khi đăng nhập bằng email và mật khẩu.</span>
          </span>
          <span className="acct-status" data-on={on ? 'true' : undefined}>
            {on ? 'Đang bật' : 'Đang tắt'}
          </span>
          {idle && hasPassword && !on && (
            <button type="button" className="acct-primary" aria-label="Bật xác thực 2 lớp" onClick={() => start('enable')}>
              Bật
            </button>
          )}
          {idle && on && (
            <>
              <button type="button" onClick={() => start('regenerate')}>
                Tạo lại mã dự phòng
              </button>
              <button type="button" aria-label="Tắt xác thực 2 lớp" onClick={() => start('disable')}>
                Tắt
              </button>
            </>
          )}
        </li>
      </ul>
      {!hasPassword && !on && <p className="muted tf-note">Chỉ tài khoản có mật khẩu mới bật được xác thực 2 lớp.</p>}
      {action && !setup && (
        <form className="pw-form settings-card tf-card" onSubmit={submitPassword} noValidate>
          <label htmlFor={`${id}-password`}>Mật khẩu</label>
          <input id={`${id}-password`} type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="pw-hint">{ACTION_HINT[action]}</p>
          {problem}
          <div className="tf-buttons">
            <button type="submit" className="pw-submit" disabled={busy}>
              {ACTION_SUBMIT[action]}
            </button>
            <button type="button" onClick={() => start(null)}>
              Huỷ
            </button>
          </div>
        </form>
      )}
      {setup && (
        <form className="settings-card tf-card tf-setup" onSubmit={confirm} noValidate>
          <Qr uri={setup.uri} />
          <div className="pw-form">
            <p className="tf-step">Quét mã QR bằng ứng dụng xác thực (Google Authenticator, Microsoft Authenticator...) hoặc nhập khoá này:</p>
            <code className="tf-secret" data-testid="totp-secret">
              {manualSecret(setup.uri)}
            </code>
            <label htmlFor={`${id}-code`}>Mã 6 số</label>
            <input
              id={`${id}-code`}
              className="tf-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            {problem}
            <div className="tf-buttons">
              <button type="submit" className="pw-submit" disabled={busy}>
                Xác nhận
              </button>
              <button type="button" onClick={() => start(null)}>
                Huỷ
              </button>
            </div>
          </div>
        </form>
      )}
      {codes && (
        <div className="settings-card tf-card" role="group" aria-labelledby={`${id}-codes`}>
          <p className="tf-step" id={`${id}-codes`}>
            <strong>Lưu {codes.length} mã dự phòng này ở nơi an toàn.</strong> Mỗi mã thay cho mã 6 số được một lần, khi bạn không có điện thoại. Mã chỉ hiện lần này.
          </p>
          <ol className="tf-codes" aria-label="Mã dự phòng">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <div className="tf-buttons">
            <button type="button" onClick={() => void copy()}>
              <Icon name="copy" size={16} />
              Sao chép
            </button>
            <a className="tf-download" href={`data:text/plain;charset=utf-8,${encodeURIComponent(backupCodesText(email, codes))}`} download="ma-du-phong-vet-cvs.txt">
              <Icon name="download" size={16} />
              Tải .txt
            </a>
            <button type="button" className="pw-submit" onClick={() => (setCodes(null), setNote(''))}>
              Tôi đã lưu
            </button>
          </div>
          <p className="pw-hint" role="status">
            {note}
          </p>
        </div>
      )}
    </>
  );
}
