'use client';
import { type FormEvent, useState } from 'react';
import { ApiError, api, sendJson } from '@/lib/api';
import { useHydrated } from '@/lib/use-hydrated';

export function LoginForm({ larkEnabled }: { larkEnabled: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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

  async function lark() {
    setError('');
    try {
      const r = await api<{ url?: string }>('/api/auth/sign-in/social', sendJson('POST', { provider: 'lark', callbackURL: '/create' }));
      if (r.url) window.location.assign(r.url);
    } catch {
      setError('Không đăng nhập được bằng Lark.');
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
      {larkEnabled && (
        <button type="button" onClick={() => void lark()}>
          Đăng nhập bằng Lark
        </button>
      )}
    </main>
  );
}
