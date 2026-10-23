'use client';
// The Settings dialog behind the gear: the profile, the linked sign-in methods, support, and signing out. No billing: the company pays.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, sendJson } from '@/lib/api';
import type { SignInMethod } from '@/lib/sign-in-methods';
import { Modal } from './Modal';
import { SignInMethods } from './SignInMethods';

export interface Account {
  email: string;
  isAdmin: boolean;
  methods: SignInMethod[];
  googleEnabled: boolean;
  larkEnabled: boolean;
  supportEmail: string | null;
}

const SECTIONS = [
  ['profile', 'Hồ sơ'],
  ['methods', 'Tài khoản liên kết'],
  ['support', 'Hỗ trợ'],
] as const;

export function Settings({ open, onClose, userName, account }: { open: boolean; onClose: () => void; userName: string; account: Account }) {
  const [section, setSection] = useState<(typeof SECTIONS)[number][0]>('profile');
  useEffect(() => {
    if (open) setSection('profile'); // every opening starts on the profile
  }, [open]);
  async function signOut() {
    await api('/api/auth/sign-out', sendJson('POST', {})).catch(() => null);
    window.location.assign('/login');
  }
  return (
    <Modal open={open} onClose={onClose} label="Cài đặt" className="settings">
      <h2 className="settings-title">Cài đặt</h2>
      <div className="settings-grid">
        <nav className="settings-nav" aria-label="Tài khoản">
          <p className="settings-kicker">Tài khoản</p>
          {SECTIONS.map(([id, text]) => (
            <button key={id} type="button" aria-current={section === id ? 'true' : undefined} onClick={() => setSection(id)}>
              {text}
            </button>
          ))}
          <button type="button" className="settings-signout" onClick={() => void signOut()}>
            Đăng xuất
          </button>
        </nav>
        <div className="settings-panel">
          {section === 'profile' && (
            <section aria-labelledby="settings-profile">
              <p className="settings-kicker" id="settings-profile">
                Thông tin cá nhân
              </p>
              <dl className="settings-fields">
                <div>
                  <dt>Tên</dt>
                  <dd>{userName}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{account.email}</dd>
                </div>
                <div>
                  <dt>Vai trò</dt>
                  <dd>{account.isAdmin ? 'Admin' : 'Thành viên'}</dd>
                </div>
              </dl>
              <p className="muted">Tên, nhóm và quyền do Admin quản lý.</p>
            </section>
          )}
          {section === 'methods' && <SignInMethods methods={account.methods} googleEnabled={account.googleEnabled} larkEnabled={account.larkEnabled} />}
          {section === 'support' && (
            <section aria-labelledby="settings-support">
              <p className="settings-kicker" id="settings-support">
                Hỗ trợ
              </p>
              <p>
                {account.supportEmail ? (
                  <>
                    Cần giúp đỡ? Liên hệ <a href={`mailto:${account.supportEmail}`}>{account.supportEmail}</a>.
                  </>
                ) : (
                  'Cần giúp đỡ? Hãy hỏi Admin của công ty.'
                )}
              </p>
              <p>
                <Link href="/privacy">Chính sách quyền riêng tư</Link>
              </p>
            </section>
          )}
        </div>
      </div>
    </Modal>
  );
}
