'use client';
import { PasswordChange } from '@/components/AccountSecurity';
import { VetLogo } from '@/components/VetLogo';
import { api, sendJson } from '@/lib/api';

/** The way out of a page that opens nothing else: this one, and the notice of a user in no active workspace ((app)/layout.tsx). */
export function SignOutButton() {
  async function signOut() {
    await api('/api/auth/sign-out', sendJson('POST', {})).catch(() => null);
    window.location.assign('/login');
  }
  return (
    <button type="button" className="forced-pw-signout" onClick={() => void signOut()}>
      Đăng xuất
    </button>
  );
}

/** The only thing a user with a temporary password can do: set their own, or sign out. */
export function ForcedChange({ email }: { email: string }) {
  return (
    <main className="forced-pw">
      <section className="forced-pw-card" aria-labelledby="forced-pw-title">
        <VetLogo size={40} label="VET Group" />
        <h1 id="forced-pw-title">Đặt mật khẩu mới</h1>
        <p className="muted">
          Tài khoản <strong>{email}</strong> đang dùng mật khẩu tạm thời do người quản lý đặt. Hãy đổi sang mật khẩu của riêng bạn trước khi tiếp tục.
        </p>
        <PasswordChange submitText="Lưu và tiếp tục" onDone={() => window.location.assign('/create')} />
        <SignOutButton />
      </section>
    </main>
  );
}
