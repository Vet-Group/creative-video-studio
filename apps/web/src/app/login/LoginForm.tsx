'use client';
import { type FormEvent, useState } from 'react';
import { ApiError, api, sendJson } from '@/lib/api';
import { authErrorText, METHOD_LABEL } from '@/lib/sign-in-methods';
import { useHydrated } from '@/lib/use-hydrated';

/** `error` is the `?error=` code a failed social sign-in left in the URL. */
export function LoginForm({ googleEnabled, larkEnabled, error: errorCode }: { googleEnabled: boolean; larkEnabled: boolean; error?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(authErrorText(errorCode) ?? '');
  const [busy, setBusy] = useState(false);
  // Submitting before hydration would send the form as a plain GET, with the password in the URL.
  const hydrated = useHydrated();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/sign-in/email', sendJson('POST', { email, password }));
      window.location.assign('/create');
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? 'Email hoặc mật khẩu không đúng.' : 'Không đăng nhập được, hãy thử lại sau.');
      setBusy(false);
    }
  }

  // Without errorCallbackURL better-auth sends a refused sign-in to its own /api/auth/error page.
  async function social(provider: 'google' | 'lark') {
    setError('');
    try {
      const r = await api<{ url?: string }>('/api/auth/sign-in/social', sendJson('POST', { provider, callbackURL: '/create', errorCallbackURL: '/login' }));
      if (r.url) window.location.assign(r.url);
    } catch {
      setError(`Không đăng nhập được bằng ${METHOD_LABEL[provider]}.`);
    }
  }

  return (
    <main className="login">
      <h1>Đăng nhập</h1>
      <form onSubmit={(e) => void submit(e)}>
        <label>
          Email
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Mật khẩu
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || !hydrated}>
          Đăng nhập
        </button>
      </form>
      {(googleEnabled || larkEnabled) && (
        <div className="social">
          {googleEnabled && (
            <button type="button" onClick={() => void social('google')}>
              Đăng nhập bằng Google
            </button>
          )}
          {larkEnabled && (
            <button type="button" onClick={() => void social('lark')}>
              Đăng nhập bằng Lark
            </button>
          )}
        </div>
      )}
    </main>
  );
}
