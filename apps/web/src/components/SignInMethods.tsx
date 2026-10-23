'use client';
// The signed-in user's own page: which ways of signing in are linked to the account, and linking or unlinking them.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, api, sendJson } from '@/lib/api';
import { authErrorText, METHOD_LABEL, methodText, providerLabel, type SignInMethod } from '@/lib/sign-in-methods';

const PAGE = '/account/sign-in-methods';

export function SignInMethods({ methods, googleEnabled, larkEnabled, error }: { methods: SignInMethod[]; googleEnabled: boolean; larkEnabled: boolean; error?: string }) {
  const router = useRouter();
  const [problem, setProblem] = useState(authErrorText(error) ?? '');
  const linked = (provider: string) => methods.some((m) => m.provider === provider);

  // A link that fails comes back to this page, not to /login, which sends a signed-in user on to /create and would drop the reason.
  async function link(provider: 'google' | 'lark') {
    setProblem('');
    try {
      const r = await api<{ url?: string }>('/api/auth/link-social', sendJson('POST', { provider, callbackURL: PAGE, errorCallbackURL: PAGE }));
      if (r.url) window.location.assign(r.url);
    } catch {
      setProblem(`Không liên kết được ${METHOD_LABEL[provider]}.`);
    }
  }

  async function unlink(m: SignInMethod) {
    setProblem('');
    try {
      await api('/api/auth/unlink-account', sendJson('POST', { accountId: m.id }));
      router.refresh();
    } catch (e) {
      setProblem(
        e instanceof ApiError && e.status === 403
          ? 'Phiên đăng nhập đã cũ. Hãy đăng xuất, đăng nhập lại rồi thử lại.'
          : e instanceof ApiError && e.status === 400
            ? 'Không thể huỷ liên kết phương thức đăng nhập cuối cùng.'
            : 'Không huỷ được liên kết.',
      );
    }
  }

  return (
    <section aria-labelledby="methods-title">
      <h1 id="methods-title">Phương thức đăng nhập</h1>
      <p className="muted">Mọi phương thức dưới đây đều đăng nhập vào cùng một tài khoản. Luôn phải còn ít nhất một phương thức.</p>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <ul className="methods">
        {methods.map((m) => (
          <li key={m.id}>
            <span>{methodText(m)}</span>
            {m.provider !== 'credential' && (
              <button type="button" aria-label={`Huỷ liên kết ${providerLabel(m.provider)}`} onClick={() => void unlink(m)}>
                Huỷ liên kết
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="actions">
        {googleEnabled && !linked('google') && (
          <button type="button" onClick={() => void link('google')}>
            Liên kết Google
          </button>
        )}
        {larkEnabled && !linked('lark') && (
          <button type="button" onClick={() => void link('lark')}>
            Liên kết Lark
          </button>
        )}
      </div>
    </section>
  );
}
