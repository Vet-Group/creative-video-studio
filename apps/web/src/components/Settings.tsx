'use client';
// The Settings dialog behind the gear: the profile, the user's own caps, sign-in security, the linked sign-in methods, support, and signing out. No billing: the company pays.
import Link from 'next/link';
import { type CSSProperties, useEffect, useState } from 'react';
import { api, sendJson } from '@/lib/api';
import type { SignInMethod } from '@/lib/sign-in-methods';
import { PasswordChange, Sessions, TwoFactor } from './AccountSecurity';
import { Icon, type IconName } from './Icon';
import { Modal } from './Modal';
import { ProviderMark, SignInMethods } from './SignInMethods';

export interface Account {
  email: string;
  isAdmin: boolean;
  /** The team's name, null if it could not be read. */
  team: string | null;
  /** When the account was created, ISO. */
  memberSince: string;
  /** How many passkeys the user has. */
  passkeys: number;
  /** Whether a password sign-in also asks for a TOTP code. */
  twoFactor: boolean;
  methods: SignInMethod[];
  googleEnabled: boolean;
  larkEnabled: boolean;
  supportEmail: string | null;
}

/** GET /api/me/limits: the caller's use of each Run cap; USD amounts are numeric text. */
interface Usage {
  clips: { used: number; cap: number };
  dayUsd: { used: string; cap: string };
  monthUsd: { used: string; cap: string };
}

const SECTIONS: readonly (readonly [string, string, IconName])[] = [
  ['profile', 'Hồ sơ', 'user'],
  ['limits', 'Hạn mức', 'gauge'],
  ['security', 'Bảo mật', 'lock'],
  ['methods', 'Tài khoản liên kết', 'link'],
  ['support', 'Hỗ trợ', 'help'],
];

/** Avatar colours: deep enough for white initials (contrast 4.5:1 or more), warm and cool, beside the red brand. */
const AVATAR_COLORS = ['#b91c1c', '#be123c', '#b45309', '#047857', '#0f766e', '#0369a1', '#4338ca', '#3f3f46'];

/** The first letters of the first and last word of a name, or the first two of a single word. */
export function initials(name: string): string {
  const words = name.normalize('NFC').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...words[0]!];
  const text = words.length > 1 ? first[0]! + [...words.at(-1)!][0]! : first.slice(0, 2).join('');
  return text.toLocaleUpperCase('vi');
}

/** The same colour for the same name, every time and on every device. */
export function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

const monthYear = (iso: string) => {
  const parts = new Intl.DateTimeFormat('vi-VN', { month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).formatToParts(new Date(iso));
  return `tháng ${parts.find((p) => p.type === 'month')?.value}/${parts.find((p) => p.type === 'year')?.value}`;
};
const usd = (v: string | number) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

/** One cap as a labelled bar; at or over the cap is full, as checkCaps refuses there (a cap of 0 is always full). */
function Meter({ label, used, cap, text, left }: { label: string; used: number; cap: number; text: string; left: string }) {
  const share = cap > 0 ? Math.min(used / cap, 1) : 1;
  const level = share >= 1 ? 'full' : share >= 0.8 ? 'warn' : 'ok';
  return (
    <div className="meter" data-level={level}>
      <div className="meter-head">
        <span>{label}</span>
        <strong>{text}</strong>
      </div>
      <div className="meter-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={cap} aria-valuenow={Math.min(used, cap)} aria-valuetext={text}>
        <span style={{ width: `${share * 100}%` }} />
      </div>
      <p className="meter-left">{share >= 1 ? 'Đã hết hạn mức' : left}</p>
    </div>
  );
}

function Limits() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api<Usage>('/api/me/limits')
      .then(setUsage)
      .catch(() => setFailed(true));
  }, []);
  if (failed)
    return (
      <p className="error" role="alert">
        Không tải được hạn mức. Hãy thử lại sau.
      </p>
    );
  if (!usage) return <p className="muted">Đang tải hạn mức...</p>;
  const { clips, dayUsd, monthUsd } = usage;
  return (
    <>
      <div className="settings-card meters">
        <Meter label="Clip video hôm nay" used={clips.used} cap={clips.cap} text={`${clips.used} / ${clips.cap} clip`} left={`Còn ${clips.cap - clips.used} clip`} />
        <Meter
          label="Ảnh và ứng dụng hôm nay"
          used={Number(dayUsd.used)}
          cap={Number(dayUsd.cap)}
          text={`${usd(dayUsd.used)} / ${usd(dayUsd.cap)}`}
          left={`Còn ${usd(Number(dayUsd.cap) - Number(dayUsd.used))}`}
        />
        <Meter
          label="Ảnh và ứng dụng tháng này"
          used={Number(monthUsd.used)}
          cap={Number(monthUsd.cap)}
          text={`${usd(monthUsd.used)} / ${usd(monthUsd.cap)}`}
          left={`Còn ${usd(Number(monthUsd.cap) - Number(monthUsd.used))}`}
        />
      </div>
      <p className="muted">Hạn mức ngày đặt lại lúc 0:00 giờ Việt Nam, hạn mức tháng vào ngày 1. Admin đặt các hạn mức này. Khi ngân sách chung của công ty đã hết, Run cũng tạm dừng dù thanh của bạn còn trống.</p>
    </>
  );
}

export function Settings({ open, onClose, userName, account }: { open: boolean; onClose: () => void; userName: string; account: Account }) {
  const [section, setSection] = useState('profile');
  const [changes, setChanges] = useState(0); // a password change signs the other devices out, so the sessions list reloads
  const [twoFactor, setTwoFactor] = useState(account.twoFactor);
  useEffect(() => {
    if (open) setSection('profile'); // every opening starts on the profile
  }, [open]);
  async function signOut() {
    await api('/api/auth/sign-out', sendJson('POST', {})).catch(() => null);
    window.location.assign('/login');
  }
  const hasPassword = account.methods.some((m) => m.provider === 'credential');
  return (
    <Modal open={open} onClose={onClose} label="Cài đặt" className="settings">
      <h2 className="settings-title">Cài đặt</h2>
      <div className="settings-grid">
        <nav className="settings-nav" aria-label="Tài khoản">
          <p className="settings-kicker">Tài khoản</p>
          {SECTIONS.map(([id, text, icon]) => (
            <button key={id} type="button" aria-current={section === id ? 'true' : undefined} onClick={() => setSection(id)}>
              <Icon name={icon} size={16} />
              {text}
            </button>
          ))}
          <button type="button" className="settings-signout" onClick={() => void signOut()}>
            <Icon name="logout" size={16} />
            Đăng xuất
          </button>
        </nav>
        <div className="settings-panel">
          {section === 'profile' && (
            <section aria-labelledby="settings-profile">
              <p className="settings-kicker" id="settings-profile">
                Thông tin cá nhân
              </p>
              <div className="profile-card" style={{ '--avatar': avatarColor(userName) } as CSSProperties}>
                <span className="avatar" aria-hidden="true">
                  {initials(userName)}
                </span>
                <div className="profile-who">
                  <p className="profile-name">{userName}</p>
                  <p className="profile-email">{account.email}</p>
                </div>
                <span className="role-badge" data-role={account.isAdmin ? 'admin' : 'member'}>
                  {account.isAdmin ? 'Admin' : 'Thành viên'}
                </span>
              </div>
              <dl className="settings-fields settings-fields-pair">
                <div>
                  <dt>Nhóm</dt>
                  <dd>{account.team ?? 'Chưa rõ'}</dd>
                </div>
                <div>
                  <dt>Thành viên từ</dt>
                  <dd>{monthYear(account.memberSince)}</dd>
                </div>
              </dl>
              <p className="muted">Tên, nhóm và quyền do Admin quản lý.</p>
            </section>
          )}
          {section === 'limits' && (
            <section aria-labelledby="settings-limits" aria-live="polite">
              <p className="settings-kicker" id="settings-limits">
                Hạn mức của bạn
              </p>
              <Limits />
            </section>
          )}
          {section === 'security' && (
            <section aria-labelledby="settings-security">
              <p className="settings-kicker" id="settings-security">
                Đăng nhập
              </p>
              <ul className="acct-rows">
                <li className="acct-row">
                  <ProviderMark provider="credential" />
                  <span className="acct-text">
                    <strong>Mật khẩu</strong>
                    <span>{hasPassword ? 'Đăng nhập bằng email và mật khẩu' : 'Tài khoản chưa có mật khẩu'}</span>
                  </span>
                  <span className="acct-status" data-on={hasPassword ? 'true' : undefined}>
                    {hasPassword ? 'Đã đặt' : 'Chưa đặt'}
                  </span>
                </li>
                <li className="acct-row">
                  <ProviderMark provider="passkey" />
                  <span className="acct-text">
                    <strong>Passkey</strong>
                    <span>{account.passkeys > 0 ? `${account.passkeys} passkey trên các thiết bị của bạn` : 'Chưa có passkey'}</span>
                  </span>
                  <a href="/account/sign-in-methods">Quản lý passkey</a>
                </li>
              </ul>
              <p className="settings-kicker settings-sub" id="settings-password">
                Đổi mật khẩu
              </p>
              {hasPassword ? (
                <div className="settings-card" role="group" aria-labelledby="settings-password">
                  <PasswordChange onDone={() => setChanges((n) => n + 1)} />
                </div>
              ) : (
                <p className="muted">Tài khoản của bạn đăng nhập bằng Google, Lark hoặc passkey nên không có mật khẩu để đổi.</p>
              )}
              <p className="settings-kicker settings-sub" id="settings-two-factor">
                Xác thực 2 lớp
              </p>
              <div role="group" aria-labelledby="settings-two-factor">
                <TwoFactor
                  email={account.email}
                  hasPassword={hasPassword}
                  on={twoFactor}
                  onChange={(on) => {
                    setTwoFactor(on);
                    setChanges((n) => n + 1);
                  }}
                />
              </div>
              <p className="settings-kicker settings-sub" id="settings-sessions">
                Phiên đăng nhập
              </p>
              <div role="group" aria-labelledby="settings-sessions">
                <Sessions key={changes} />
              </div>
            </section>
          )}
          {section === 'methods' && <SignInMethods methods={account.methods} googleEnabled={account.googleEnabled} larkEnabled={account.larkEnabled} />}
          {section === 'support' && (
            <section aria-labelledby="settings-support">
              <p className="settings-kicker" id="settings-support">
                Hỗ trợ
              </p>
              <ul className="acct-rows">
                <li className="acct-row">
                  <span className="acct-mark" aria-hidden="true">
                    <Icon name="mail" size={16} />
                  </span>
                  <span className="acct-text">
                    <strong>Cần giúp đỡ?</strong>
                    {account.supportEmail ? (
                      <span>
                        Liên hệ <a href={`mailto:${account.supportEmail}`}>{account.supportEmail}</a>
                      </span>
                    ) : (
                      <span>Hãy hỏi Admin của công ty.</span>
                    )}
                  </span>
                </li>
                <li className="acct-row">
                  <span className="acct-mark" aria-hidden="true">
                    <Icon name="admin" size={16} />
                  </span>
                  <span className="acct-text">
                    <strong>Quyền riêng tư</strong>
                    <span>Cách dùng dữ liệu của bạn</span>
                  </span>
                  <Link href="/privacy">Xem chính sách</Link>
                </li>
              </ul>
            </section>
          )}
        </div>
      </div>
    </Modal>
  );
}
