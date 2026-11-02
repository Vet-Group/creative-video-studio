'use client';
import { PasswordChange } from '@/components/AccountSecurity';
import { VetLogo } from '@/components/VetLogo';
import { api, sendJson } from '@/lib/api';

/** The only thing a user with an Admin's temporary password can do: set their own, or sign out. */
export function ForcedChange({ email }: { email: string }) {
  async function signOut() {
    await api('/api/auth/sign-out', sendJson('POST', {})).catch(() => null);
    window.location.assign('/login');
  }
  return (
    <main className="forced-pw">
      <section className="forced-pw-card" aria-labelledby="forced-pw-title">
        <VetLogo size={40} label="VET Group" />
        <h1 id="forced-pw-title">Đặt mật khẩu mới</h1>
        <p className="muted">
          Admin đã đặt một mật khẩu tạm thời cho <strong>{email}</strong>. Hãy đổi sang mật khẩu của riêng bạn trước khi tiếp tục.
        </p>
        <PasswordChange submitText="Lưu và tiếp tục" onDone={() => window.location.assign('/create')} />
        <button type="button" className="forced-pw-signout" onClick={() => void signOut()}>
          Đăng xuất
        </button>
      </section>
    </main>
  );
}
