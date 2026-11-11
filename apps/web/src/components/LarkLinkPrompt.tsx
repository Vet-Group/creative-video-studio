'use client';
import { useEffect, useState } from 'react';
import { api, sendJson } from '@/lib/api';
import { LARK_PROMPT_KEY, larkPromptDue, vnDay } from '@/lib/lark-prompt';
import { Modal } from './Modal';

const METHODS_PAGE = '/account/sign-in-methods';

/**
 * A user with no linked Lark account: a popup at most once a day (per browser) asking them to link Lark, until they do. The layout decides
 * who sees it; the day it was last shown is kept in localStorage, so a blocked storage shows it on each visit rather than never.
 */
export function LarkLinkPrompt() {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    const today = vnDay(new Date());
    let last: string | null = null;
    try {
      last = localStorage.getItem(LARK_PROMPT_KEY);
      localStorage.setItem(LARK_PROMPT_KEY, today);
    } catch {}
    if (larkPromptDue(last, today)) setOpen(true);
  }, []);

  async function link() {
    setProblem('');
    try {
      const r = await api<{ url?: string }>('/api/auth/link-social', sendJson('POST', { provider: 'lark', callbackURL: METHODS_PAGE, errorCallbackURL: METHODS_PAGE }));
      if (r.url) window.location.assign(r.url);
    } catch {
      setProblem('Không liên kết được Lark. Hãy thử lại tại "Phương thức đăng nhập".');
    }
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} label="Liên kết Lark" className="confirm">
      <h2>Liên kết tài khoản Lark</h2>
      <p>Tài khoản của bạn chưa liên kết Lark. Liên kết một lần, từ lần sau chỉ cần bấm &quot;Đăng nhập bằng Lark&quot; là vào, không cần mật khẩu.</p>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="actions">
        <button type="button" onClick={() => setOpen(false)}>
          Để sau
        </button>
        <button type="button" className="primary" onClick={link}>
          Liên kết Lark
        </button>
      </div>
    </Modal>
  );
}
