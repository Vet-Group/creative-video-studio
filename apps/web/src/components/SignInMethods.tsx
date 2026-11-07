'use client';
// The signed-in user's own page: which ways of signing in are linked to the account, and linking or unlinking them.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, api, sendJson } from '@/lib/api';
import { addPasskey, cancelled } from '@/lib/passkey';
import { authErrorText, METHOD_LABEL, type PasskeyItem, passkeyDate, providerLabel, type SignInMethod } from '@/lib/sign-in-methods';
import { useHydrated } from '@/lib/use-hydrated';
import { confirmDialog } from './Confirm';
import { Icon } from './Icon';

const PAGE = '/account/sign-in-methods';
const STALE = 'Phiên đăng nhập đã cũ. Hãy đăng xuất, đăng nhập lại rồi thử lại.';

/** Without `passkeys` (the Settings dialog, which does not load them) the passkeys are managed on the page only, reached by a link. */
export function SignInMethods({
  methods,
  passkeys,
  googleEnabled,
  larkEnabled,
  error,
  embedded = false,
}: {
  methods: SignInMethod[];
  passkeys?: PasskeyItem[];
  googleEnabled: boolean;
  larkEnabled: boolean;
  error?: string;
  /** Inside Settings, whose section heading already names it: no heading of its own. */
  embedded?: boolean;
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
    if (!(await confirmDialog({ title: `Xoá passkey ngày ${passkeyDate(p.createdAt)}?`, body: 'Thiết bị giữ passkey này sẽ không đăng nhập bằng nó được nữa.', confirmLabel: 'Xoá', danger: true }))) return;
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
    if (!(await confirmDialog({ title: `Huỷ liên kết ${providerLabel(m.provider)}?`, body: 'Bạn sẽ không đăng nhập bằng cách này được nữa cho đến khi liên kết lại.', confirmLabel: 'Huỷ liên kết', danger: true }))) return;
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
    <section aria-labelledby={embedded ? 'settings-heading' : 'methods-title'}>
      {!embedded && <h1 id="methods-title">Phương thức đăng nhập</h1>}
      <p className="muted">Mọi phương thức dưới đây đều đăng nhập vào cùng một tài khoản. Luôn phải còn ít nhất một phương thức.</p>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <ul className="acct-rows">
        {methods.map((m) => (
          <li key={m.id} className="acct-row">
            <ProviderMark provider={m.provider} />
            <span className="acct-text">
              <strong>{providerLabel(m.provider)}</strong>
              {m.email && <span>{m.email}</span>}
            </span>
            <span className="acct-status" data-on="true">
              {m.provider === 'credential' ? 'Đang dùng' : 'Đã liên kết'}
            </span>
            {m.provider !== 'credential' && (
              <button type="button" aria-label={`Huỷ liên kết ${providerLabel(m.provider)}`} onClick={() => void unlink(m)}>
                Huỷ liên kết
              </button>
            )}
          </li>
        ))}
        {(['google', 'lark'] as const)
          .filter((p) => (p === 'google' ? googleEnabled : larkEnabled) && !linked(p))
          .map((p) => (
            <li key={p} className="acct-row">
              <ProviderMark provider={p} />
              <span className="acct-text">
                <strong>{METHOD_LABEL[p]}</strong>
              </span>
              <span className="acct-status">Chưa liên kết</span>
              <button type="button" className="acct-primary" aria-label={`Liên kết ${METHOD_LABEL[p]}`} onClick={() => void link(p)}>
                Liên kết
              </button>
            </li>
          ))}
        {passkeys ? (
          passkeys.map((p) => (
            <li key={p.id} className="acct-row">
              <ProviderMark provider="passkey" />
              <span className="acct-text">
                <strong>{METHOD_LABEL.passkey}</strong>
                <span>Thêm ngày {passkeyDate(p.createdAt)}</span>
              </span>
              <button type="button" aria-label={`Xoá passkey ngày ${passkeyDate(p.createdAt)}`} onClick={() => void remove(p)}>
                Xoá
              </button>
            </li>
          ))
        ) : (
          <li className="acct-row">
            <ProviderMark provider="passkey" />
            <span className="acct-text">
              <strong>{METHOD_LABEL.passkey}</strong>
              <span>Vân tay, khuôn mặt hoặc mã PIN của thiết bị</span>
            </span>
            <a href={PAGE}>Quản lý passkey</a>
          </li>
        )}
      </ul>
      {passkeys && (
        <div className="actions">
          <button type="button" disabled={!webauthn} onClick={() => void add()}>
            Thêm passkey
          </button>
        </div>
      )}
    </section>
  );
}

/** The small tile beside a sign-in method: Google's and Lark's own colours, a plain glyph for a password or a passkey. */
export function ProviderMark({ provider }: { provider: string }) {
  if (provider === 'google')
    return (
      <span className="acct-mark" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 48 48" focusable="false">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
      </span>
    );
  if (provider === 'lark')
    return (
      <span className="acct-mark" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" focusable="false">
          <path fill="#00D6B9" d="M5.2 3.5h8.3c1.3 0 2.5.7 3.2 1.8l2.4 4c-3-.5-6 .4-8.2 2.5z" />
          <path fill="#3370FF" d="M2.5 10l6.8 6.6c2.6 2.5 6.6 2.6 9.3.3l3.4-2.9c-2-2.7-5.2-4.2-8.6-3.8-2.6.3-4.9 1.8-6.2 3.9z" />
          <path fill="#133C9A" d="M11.2 13.8c2.5-2.7 6.4-3.4 9.6-1.7l1.2.6-3.4 2.9c-2 1.7-4.9 2-7.2.8z" />
        </svg>
      </span>
    );
  return (
    <span className="acct-mark" aria-hidden="true">
      <Icon name={provider === 'passkey' ? 'key' : provider === 'credential' ? 'mail' : 'link'} size={16} />
    </span>
  );
}
