'use client';
import { useEffect, useRef, useState } from 'react';
import { api, rotatingSession } from '@/lib/api';

/** The Admin users page, where the Admin lands again after leaving. */
const ADMIN_USERS_PAGE = '/admin/users';

/** Shown on every app page while an Admin is signed in as a user (a session with impersonatedBy); its Exit button puts the Admin back in their own session. */
export function ImpersonationBanner({ name }: { name: string }) {
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState('');
  const banner = useRef<HTMLDivElement>(null);
  // The screen-tall form card gives up the banner's height and top margin (--impersonation-h in globals.css), so its Run button stays in view.
  useEffect(() => {
    const el = banner.current;
    if (!el) return;
    const root = document.documentElement.style;
    const watch = new ResizeObserver(() => root.setProperty('--impersonation-h', `${el.offsetHeight + parseFloat(getComputedStyle(el).marginTop)}px`));
    watch.observe(el);
    return () => {
      watch.disconnect();
      root.removeProperty('--impersonation-h');
    };
  }, []);
  async function stop() {
    setPending(true);
    setProblem('');
    try {
      // Stopping deletes the user's session: a page call still in flight on it gets a 401 that must not send the Admin to the login.
      await rotatingSession(() => api('/api/me/stop-impersonating', { method: 'POST' }));
      window.location.assign(ADMIN_USERS_PAGE);
    } catch {
      setProblem('Không thoát được. Hãy thử lại hoặc đăng xuất.');
      setPending(false);
    }
  }
  return (
    <div ref={banner} className="warn impersonation-banner" role="status">
      <span>
        Bạn đang đăng nhập thay <strong>{name}</strong>.<span className="impersonation-note"> Mọi thao tác được tính cho tài khoản này.</span>
        {problem && <span className="error"> {problem}</span>}
      </span>
      <button type="button" className="small" disabled={pending} onClick={() => void stop()}>
        Thoát
      </button>
    </div>
  );
}
