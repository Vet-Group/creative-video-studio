'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

/** The Admin users page, where the Admin lands again after leaving. */
const ADMIN_USERS_PAGE = '/admin/users';

/** Shown on every app page while an Admin is signed in as a user (a session with impersonatedBy); its Exit button puts the Admin back in their own session. */
export function ImpersonationBanner({ name }: { name: string }) {
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState('');
  async function stop() {
    setPending(true);
    setProblem('');
    try {
      await api('/api/me/stop-impersonating', { method: 'POST' });
      window.location.assign(ADMIN_USERS_PAGE);
    } catch {
      setProblem('Không thoát được. Hãy thử lại hoặc đăng xuất.');
      setPending(false);
    }
  }
  return (
    <div className="warn impersonation-banner" role="status">
      <span>
        Bạn đang đăng nhập thay <strong>{name}</strong>. Mọi thao tác được tính cho tài khoản này.
        {problem && <span className="error"> {problem}</span>}
      </span>
      <button type="button" className="small" disabled={pending} onClick={() => void stop()}>
        Thoát
      </button>
    </div>
  );
}
