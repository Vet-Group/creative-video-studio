'use client';
// The signed-in user's own page: which ways of signing in are linked to the account, and linking or unlinking them.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, api, sendJson } from '@/lib/api';
import { addPasskey, cancelled } from '@/lib/passkey';
import { authErrorText, METHOD_LABEL, methodText, type PasskeyItem, providerLabel, type SignInMethod } from '@/lib/sign-in-methods';
import { useHydrated } from '@/lib/use-hydrated';

const PAGE = '/account/sign-in-methods';
const STALE = 'Phiên đăng nhập đã cũ. Hãy đăng xuất, đăng nhập lại rồi thử lại.';
const fmtDate = (iso: string) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));

/** Without `passkeys` (the Settings dialog, which does not load them) the passkeys are managed on the page only, reached by a link. */
export function SignInMethods({
  methods,
  passkeys,
  googleEnabled,
  larkEnabled,
  error,
}: {
  methods: SignInMethod[];
  passkeys?: PasskeyItem[];
  googleEnabled: boolean;
  larkEnabled: boolean;
  error?: string;
}) {
  const router = useRouter();
  const [problem, setProblem] = useState(authErrorText(error) ?? '');
  const linked = (provider: string) => methods.some((m) => m.provider === provider);
  const webauthn = useHydrated() && typeof window.PublicKeyCredential === 'function';

  async function add() {
    setProblem('');
    try {
      await addPasskey();
      router.refresh();
    } catch (e) {
      if (!cancelled(e)) setProblem(e instanceof ApiError && e.status === 403 ? STALE : 'Không thêm được passkey.');
    }
  }

  async function remove(p: PasskeyItem) {
    setProblem('');
    try {
      await api('/api/auth/passkey/delete-passkey', sendJson('POST', { id: p.id }));
      router.refresh();
    } catch {
      setProblem('Không xoá được passkey.');
    }
  }

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
          ? STALE
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
        {passkeys?.map((p) => (
          <li key={p.id}>
            <span>
              {METHOD_LABEL.passkey} · {fmtDate(p.createdAt)}
            </span>
            <button type="button" aria-label={`Xoá passkey ngày ${fmtDate(p.createdAt)}`} onClick={() => void remove(p)}>
              Xoá
            </button>
          </li>
        ))}
      </ul>
      <div className="actions">
        {passkeys ? (
          <button type="button" disabled={!webauthn} onClick={() => void add()}>
            Thêm passkey
          </button>
        ) : (
          <a href={PAGE}>Quản lý passkey</a>
        )}
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
