'use client';
import { browserSupportsWebAuthnAutofill } from '@simplewebauthn/browser';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { VetLogo } from '@/components/VetLogo';
import { ApiError, api, sendJson } from '@/lib/api';
import { cancelled, signInWithPasskey } from '@/lib/passkey';
import { authErrorText, METHOD_LABEL } from '@/lib/sign-in-methods';
import { useHydrated } from '@/lib/use-hydrated';
import { PasswordField, useRevealMode } from './PasswordField';
import { StudioScene } from './StudioScene';

/** How long the sign-in flash and clapperboard play before the next page opens. */
const ENTER_MS = 700;

/** Why a passkey sign-in failed; a passkey used without its PIN or fingerprint gets its own message, since trying again with them works. */
export const passkeyFailure = (e: unknown) =>
  e instanceof ApiError && e.code === 'USER_NOT_VERIFIED'
    ? 'Passkey chưa xác minh bạn bằng vân tay hoặc mã PIN. Hãy thử lại và xác nhận khi trình duyệt hỏi.'
    : 'Không đăng nhập được bằng passkey.';

/**
 * `error` is the `?error=` code a failed social sign-in left in the URL; `lastMethod` the method this browser signed in with last; `next` the
 * page to open after the sign-in, already checked to be one of this site.
 */
export function LoginForm({
  googleEnabled,
  larkEnabled,
  lastMethod,
  next = '/create',
  error: errorCode,
}: {
  googleEnabled: boolean;
  larkEnabled: boolean;
  lastMethod?: string;
  next?: string;
  error?: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(authErrorText(errorCode) ?? '');
  const [busy, setBusy] = useState(false);
  const [scene, setScene] = useState<'day' | 'night'>('day');
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [result, setResult] = useState<'success' | null>(null);
  const kind = useRevealMode();
  const mode = revealed ? kind : 'off';
  const mascot = useRef<SVGGElement>(null);
  const emailId = useId();
  const passwordId = useId();
  // Submitting before hydration would send the form as a plain GET, with the password in the URL.
  const hydrated = useHydrated();
  const webauthn = hydrated && typeof window.PublicKeyCredential === 'function';

  // Signed in: the studio flashes and claps (globals.css) before the next page opens.
  async function enter() {
    setResult('success');
    await new Promise((r) => setTimeout(r, ENTER_MS));
    window.location.assign(next);
  }

  // The camera looks toward the pointer anywhere on the page. While the flashlight is on, PasswordField aims it instead and marks it data-lit.
  useEffect(() => {
    const look = (e: PointerEvent) => {
      const m = mascot.current;
      const body = m?.querySelector('.mascot-body')?.getBoundingClientRect();
      if (!m || !body || m.dataset.lit !== undefined) return;
      const angle = (Math.atan2(e.clientY - (body.top + body.height / 2), e.clientX - (body.left + body.width / 2)) * 180) / Math.PI;
      m.style.setProperty('--lens-angle', `${Math.max(-40, Math.min(40, angle))}deg`); // a lens turned further would point into the camera
    };
    document.addEventListener('pointermove', look);
    return () => document.removeEventListener('pointermove', look);
  }, []);

  // Offer the saved passkeys in the Email field's suggestions. A browser without them, the limiter or a closed list leaves the field as it was;
  // a passkey the user picked that the server then refuses (a ban, an expired challenge) says so.
  useEffect(() => {
    void (async () => {
      if (!(await browserSupportsWebAuthnAutofill())) return;
      await signInWithPasskey(true);
      await enter();
    })().catch((e: unknown) => {
      if (e instanceof ApiError && e.status !== 429) setError(passkeyFailure(e));
    });
  }, [next]);

  async function passkey() {
    setError('');
    try {
      await signInWithPasskey();
      await enter();
    } catch (err) {
      if (!cancelled(err)) setError(passkeyFailure(err));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setRevealed(false);
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/sign-in/email', sendJson('POST', { email, password }));
      await enter();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? `Bạn thử quá nhiều lần. Hãy đợi ${err.retryAfter ?? 10} giây rồi thử lại.`
          : err instanceof ApiError && err.status < 500
            ? 'Email hoặc mật khẩu không đúng.'
            : 'Không đăng nhập được, hãy thử lại sau.',
      );
      setBusy(false);
      // The camera shakes its head (globals.css); the mark goes when the shake ends, so the next failure shakes it again.
      const m = mascot.current;
      if (m) {
        m.dataset.result = 'fail';
        m.addEventListener('animationend', () => delete m.dataset.result, { once: true });
      }
    }
  }

  // Shown beside the method, inside its button but hidden from its accessible name, which stays the button's own text.
  const last = (method: string) =>
    lastMethod === method && (
      <span className="login-last" aria-hidden="true">
        Lần trước
      </span>
    );

  // Without errorCallbackURL better-auth sends a refused sign-in to its own /api/auth/error page.
  async function social(provider: 'google' | 'lark') {
    setError('');
    try {
      const r = await api<{ url?: string }>('/api/auth/sign-in/social', sendJson('POST', { provider, callbackURL: next, errorCallbackURL: '/login' }));
      if (r.url) window.location.assign(r.url);
    } catch {
      setError(`Không đăng nhập được bằng ${METHOD_LABEL[provider]}.`);
    }
  }

  return (
    <main className="login" data-result={result ?? undefined} data-scene={scene} data-flashlight={mode} data-dark={scene === 'night' || mode === 'pointer' || mode === 'touch'}>
      <div className="login-card">
        <section className="login-form">
          <div className="login-brand">
            <VetLogo size={40} label="VET Group" />
            <span>Creative Video Studio</span>
          </div>
          <h1>Đăng nhập</h1>
          <p className="muted">Tài khoản do Admin tạo. Liên hệ Admin nếu bạn chưa có tài khoản.</p>
          <form onSubmit={(e) => void submit(e)}>
            <label htmlFor={emailId}>Email</label>
            <input id={emailId} type="email" autoComplete="username webauthn" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <label htmlFor={passwordId}>Mật khẩu</label>
            <PasswordField id={passwordId} value={password} onChange={setPassword} mode={mode} onToggle={() => setRevealed((r) => !r)} mascot={mascot} onCapsLock={setCapsLock} />
            <p className="login-hint login-caps" aria-live="polite">
              {capsLock && 'Caps Lock đang bật.'}
            </p>
            <div className="login-forgot">
              <button type="button" className="link-button" onClick={() => setHint(true)}>
                Quên mật khẩu?
              </button>
            </div>
            <p className="login-hint muted" aria-live="polite">
              {hint && 'Liên hệ Admin để đặt lại mật khẩu.'}
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="primary" aria-busy={busy || undefined} disabled={busy || !hydrated}>
              {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
              {!busy && last('email')}
            </button>
          </form>
          <div className="social">
            {googleEnabled && (
              <button type="button" onClick={() => void social('google')}>
                Đăng nhập bằng Google
                {last('google')}
              </button>
            )}
            {larkEnabled && (
              <button type="button" onClick={() => void social('lark')}>
                Đăng nhập bằng Lark
                {last('lark')}
              </button>
            )}
            {/* Disabled until hydration, and for good in a browser without WebAuthn. */}
            <button type="button" disabled={!webauthn} onClick={() => void passkey()}>
              Đăng nhập bằng passkey
              {last('passkey')}
            </button>
          </div>
        </section>
        <section className="login-scene">
          <StudioScene mascot={mascot} />
          <button type="button" className="scene-toggle" aria-pressed={scene === 'night'} aria-label="Cảnh ban đêm" onClick={() => setScene((s) => (s === 'day' ? 'night' : 'day'))}>
            <span>
              <Icon name="sun" size={16} />
            </span>
            <span>
              <Icon name="moon" size={16} />
            </span>
          </button>
        </section>
      </div>
    </main>
  );
}
