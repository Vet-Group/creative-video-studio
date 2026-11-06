'use client';
// The Settings dialog behind the account menu: the profile, the user's own caps, sign-in security, preferences, the linked sign-in methods, support,
// and signing out. No billing: the company pays. On phones the sections are a list, and each opens as its own page with a back button.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react';
import { api, sendJson, startSignOut } from '@/lib/api';
import { AVATAR_COLORS, NAME_LENGTH, nameProblem, protection, userAvatarColor } from '@/lib/profile';
import type { SignInMethod } from '@/lib/sign-in-methods';
import { useMediaQuery } from '@/lib/use-media-query';
import { PasswordChange, Sessions, TwoFactor } from './AccountSecurity';
import { Icon, type IconName } from './Icon';
import { Modal } from './Modal';
import { Preferences } from './Preferences';
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
  /** The avatar colour the user picked, null for the one their name gives (userAvatarColor). */
  avatarColor: string | null;
  methods: SignInMethod[];
  googleEnabled: boolean;
  larkEnabled: boolean;
  supportEmail: string | null;
}

/** A mail to the company's support address with the open page and the account filled in, so a report says where it happened. */
export const supportMail = (to: string, account: string, page: string) =>
  `mailto:${to}?subject=${encodeURIComponent('Cần hỗ trợ Creative Video Studio')}&body=${encodeURIComponent(`Trang: ${page}\nTài khoản: ${account}\n\nMô tả vấn đề (kèm ảnh chụp màn hình nếu có):\n`)}`;

/** GET /api/me/limits: the caller's use of each Run cap; USD amounts are numeric text. */
export interface Usage {
  clips: { used: number; cap: number };
  dayUsd: { used: string; cap: string };
  monthUsd: { used: string; cap: string };
}

export type Section = 'profile' | 'limits' | 'security' | 'preferences' | 'methods' | 'support';

const SECTIONS: readonly (readonly [Section, string, IconName, string])[] = [
  ['profile', 'Hồ sơ', 'user', 'Tên, màu ảnh đại diện, mức bảo vệ'],
  ['limits', 'Hạn mức', 'gauge', 'Clip và chi phí hôm nay, tháng này'],
  ['security', 'Bảo mật', 'lock', 'Mật khẩu, xác thực 2 lớp, thiết bị'],
  ['preferences', 'Tuỳ chọn', 'sliders', 'Giao diện, thông báo, phím tắt'],
  ['methods', 'Tài khoản liên kết', 'link', 'Google, Lark và passkey'],
  ['support', 'Hỗ trợ', 'help', 'Liên hệ và quyền riêng tư'],
];

/** The phone layout: below the dialog's two-column breakpoint the sections are a list that opens one page at a time. */
const PHONE = '(max-width: 767.98px)';

const COLOR_NAMES = ['Đỏ', 'Hồng đậm', 'Hổ phách', 'Xanh lục', 'Xanh mòng két', 'Xanh dương', 'Chàm', 'Xám'];

/** The first letters of the first and last word of a name, or the first two of a single word. */
export function initials(name: string): string {
  const words = name.normalize('NFC').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...words[0]!];
  const text = words.length > 1 ? first[0]! + [...words.at(-1)!][0]! : first.slice(0, 2).join('');
  return text.toLocaleUpperCase('vi');
}

const monthYear = (iso: string) => {
  const parts = new Intl.DateTimeFormat('vi-VN', { month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).formatToParts(new Date(iso));
  return `tháng ${parts.find((p) => p.type === 'month')?.value}/${parts.find((p) => p.type === 'year')?.value}`;
};
const usd = (v: string | number) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
/** A cap's fill: at or over the cap is full, as checkCaps refuses there (a cap of 0 is always full). */
export const shareOf = (used: number, cap: number) => (cap > 0 ? Math.min(used / cap, 1) : 1);
export const levelOf = (share: number) => (share >= 1 ? 'full' : share >= 0.8 ? 'warn' : 'ok');

/** One cap as a labelled bar. */
function Meter({ label, used, cap, text, left }: { label: string; used: number; cap: number; text: string; left: string }) {
  const share = shareOf(used, cap);
  return (
    <div className="meter" data-level={levelOf(share)}>
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

const LIMITS_FAILED = (
  <p className="error" role="alert">
    Không tải được hạn mức. Hãy thử lại sau.
  </p>
);

function Limits({ usage }: { usage: Usage | null | 'failed' }) {
  if (usage === 'failed') return LIMITS_FAILED;
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
      <p className="settings-note">Hạn mức ngày đặt lại lúc 0:00 giờ Việt Nam, hạn mức tháng vào ngày 1. Admin đặt các hạn mức này. Khi ngân sách chung của công ty đã hết, Run cũng tạm dừng dù thanh của bạn còn trống.</p>
    </>
  );
}

/** The profile's "today" strip: the day's clips and spend against their caps, from the same /api/me/limits answer as the Limits section. */
function Today({ usage, onMore }: { usage: Usage | null | 'failed'; onMore: () => void }) {
  if (usage === 'failed') return LIMITS_FAILED;
  const cells = usage && [
    ['Clip video', usage.clips.used, usage.clips.cap, `${usage.clips.used} / ${usage.clips.cap}`],
    ['Ảnh và ứng dụng', Number(usage.dayUsd.used), Number(usage.dayUsd.cap), `${usd(usage.dayUsd.used)} / ${usd(usage.dayUsd.cap)}`],
  ] as const;
  return (
    <div className="today">
      <div className="today-head">
        <p className="settings-kicker">Hôm nay</p>
        <button type="button" className="link-button today-more" onClick={onMore}>
          Xem hạn mức
        </button>
      </div>
      {cells ? (
        cells.map(([label, used, cap, text]) => (
          <div key={label} className="today-cell" data-level={levelOf(shareOf(used, cap))}>
            <span>{label}</span>
            <strong>{text}</strong>
            <span className="today-bar" aria-hidden="true">
              <span style={{ width: `${shareOf(used, cap) * 100}%` }} />
            </span>
          </div>
        ))
      ) : (
        <p className="muted">Đang tải hạn mức...</p>
      )}
    </div>
  );
}

/** The display name and avatar colour, edited in place on the profile card; saved through PATCH /api/me/profile. */
function ProfileCard({ name, color, email, isAdmin, onSaved }: { name: string; color: string; email: string; isAdmin: boolean; onSaved: (p: { name: string; color: string }) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [pick, setPick] = useState(color);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const edit = useRef<HTMLButtonElement>(null);

  function start() {
    setDraft(name);
    setPick(color);
    setError('');
    setEditing(true);
    requestAnimationFrame(() => input.current?.focus());
  }
  function stop() {
    setEditing(false);
    requestAnimationFrame(() => edit.current?.focus());
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const problem = nameProblem(draft);
    if (problem) return setError(problem);
    const body = { ...(draft.trim() !== name ? { name: draft } : {}), ...(pick !== color ? { avatarColor: pick } : {}) };
    if (Object.keys(body).length === 0) return stop();
    setBusy(true);
    try {
      const saved = await api<{ name: string; avatarColor: string | null }>('/api/me/profile', sendJson('PATCH', body));
      onSaved({ name: saved.name, color: userAvatarColor(saved.name, saved.avatarColor) });
      stop();
    } catch {
      setError('Không lưu được hồ sơ. Hãy thử lại.');
    } finally {
      setBusy(false);
    }
  }

  const shown = editing ? draft.trim() || name : name;
  return (
    <div className="profile-card" style={{ '--avatar': editing ? pick : color } as CSSProperties}>
      <div className="profile-top">
        <span className="avatar" aria-hidden="true">
          {initials(shown)}
        </span>
        <div className="profile-who">
          <p className="profile-name">{name}</p>
          <p className="profile-email">{email}</p>
        </div>
        <span className="role-badge" data-role={isAdmin ? 'admin' : 'member'}>
          {isAdmin ? 'Admin' : 'Thành viên'}
        </span>
        {!editing && (
          <button ref={edit} type="button" className="profile-edit-button" aria-label="Sửa tên và màu" onClick={start}>
            <Icon name="edit" size={14} />
            Sửa
          </button>
        )}
      </div>
      {editing && (
        <form className="profile-edit pw-form" onSubmit={(e) => void save(e)} noValidate>
          <label htmlFor="profile-name">Tên hiển thị</label>
          <input
            ref={input}
            id="profile-name"
            autoComplete="name"
            maxLength={NAME_LENGTH.max}
            aria-describedby="profile-name-hint"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), stop())}
          />
          <p className="pw-hint" id="profile-name-hint">
            Tên này hiện ở thanh bên và trong nhật ký của Admin. Tối đa {NAME_LENGTH.max} ký tự.
          </p>
          <fieldset className="swatches">
            <legend>Màu ảnh đại diện</legend>
            {AVATAR_COLORS.map((c, i) => (
              <label key={c} className="swatch" style={{ '--swatch': c } as CSSProperties}>
                <input type="radio" name="avatar-color" value={c} checked={pick === c} aria-label={COLOR_NAMES[i]} onChange={() => setPick(c)} />
                <span aria-hidden="true">
                  <Icon name="check" size={14} />
                </span>
              </label>
            ))}
          </fieldset>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="tf-buttons">
            <button type="submit" className="pw-submit" disabled={busy}>
              {busy ? 'Đang lưu...' : 'Lưu'}
            </button>
            <button type="button" onClick={stop}>
              Huỷ
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** How many of the protection checks the account meets, as a ring, with a way to the missing ones. */
function Protection({ account, twoFactor, onFix }: { account: Account; twoFactor: boolean; onFix: (section: Section, anchor: string) => void }) {
  const hasPassword = account.methods.some((m) => m.provider === 'credential');
  const linked = account.methods.some((m) => m.provider === 'google' || m.provider === 'lark');
  const checks = protection({ hasPassword, linked, passkeys: account.passkeys, twoFactor });
  const done = checks.filter((c) => c.done).length;
  const full = done === checks.length;
  const C = 2 * Math.PI * 18;
  return (
    <div className="protect" data-full={full ? 'true' : undefined}>
      <div className="protect-head">
        <svg className="protect-ring" viewBox="0 0 44 44" role="img" aria-label={`Đạt ${done} trên ${checks.length}`}>
          <circle cx="22" cy="22" r="18" />
          <circle cx="22" cy="22" r="18" strokeDasharray={`${(done / checks.length) * C} ${C}`} transform="rotate(-90 22 22)" />
          <text x="22" y="22" dominantBaseline="central" textAnchor="middle">
            {done}/{checks.length}
          </text>
        </svg>
        <div>
          <p className="protect-title" id="settings-protect">
            Mức bảo vệ tài khoản
          </p>
          <p className="protect-sub">{full ? 'Tài khoản đã được bảo vệ đầy đủ.' : 'Bật thêm để khó bị chiếm tài khoản hơn.'}</p>
        </div>
      </div>
      <ul className="protect-list" aria-labelledby="settings-protect">
        {checks.map((c) => (
          <li key={c.id} data-done={c.done ? 'true' : undefined}>
            <span className="protect-mark" aria-hidden="true">
              {c.done && <Icon name="check" size={12} />}
            </span>
            <span className="protect-label">{c.label}</span>
            {c.done ? (
              <span className="protect-state">Đã có</span>
            ) : (
              <button
                type="button"
                aria-label={`Thiết lập ${c.label}`}
                onClick={() => onFix(c.id === 'linked' ? 'methods' : 'security', c.id === 'twoFactor' ? 'settings-two-factor' : 'settings-signin')}
              >
                Thiết lập
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const PASSWORD_DONE = 'Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.';

export async function signOut() {
  startSignOut();
  await api('/api/auth/sign-out', sendJson('POST', {})).catch(() => null);
  window.location.assign('/login');
}

/** `start`: the section it opens on (the account menu's items); on phones any other than the profile opens as its page. */
export function Settings({ open, onClose, userName, account, start = 'profile' }: { open: boolean; onClose: () => void; userName: string; account: Account; start?: Section }) {
  const router = useRouter();
  const phone = useMediaQuery(PHONE);
  const [section, setSection] = useState<Section>('profile');
  // Phones: the list, a section's page, or the list again after the back button (which slides in from the left).
  const [view, setView] = useState<'list' | 'page' | 'back'>('list');
  const [focus, setFocus] = useState<{ to: 'heading' | 'row'; anchor?: string } | null>(null);
  const [changes, setChanges] = useState(0); // a password change signs the other devices out, so the sessions list reloads
  const [twoFactor, setTwoFactor] = useState(account.twoFactor);
  const [usage, setUsage] = useState<Usage | null | 'failed'>(null);
  const [saved, setSaved] = useState<{ name: string; color: string } | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwDone, setPwDone] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const nav = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Every opening starts on its section (the profile is the list on phones), with fresh caps for both the profile strip and the Limits section.
    setSection(start);
    setView(start === 'profile' ? 'list' : 'page');
    setSaved(null);
    setPwOpen(false);
    setPwDone(false);
    setUsage(null);
    api<Usage>('/api/me/limits')
      .then(setUsage)
      .catch(() => setUsage('failed'));
  }, [open, start]);

  useEffect(() => {
    panel.current?.scrollTo(0, 0); // a wide screen scrolls the panel itself; each section starts at its top
  }, [section]);

  useEffect(() => {
    if (!focus) return;
    setFocus(null);
    if (focus.to === 'row') return nav.current?.querySelector<HTMLElement>(`[data-section='${section}']`)?.focus();
    heading.current?.focus({ preventScroll: true });
    if (focus.anchor) document.getElementById(focus.anchor)?.scrollIntoView({ block: 'start' });
    else heading.current?.scrollIntoView({ block: 'nearest' });
  }, [focus, section]);

  function go(id: Section, from: 'nav' | 'jump', anchor?: string) {
    setSection(id);
    setView('page');
    // On a phone the page replaces the list, so focus follows it; on a wide screen a nav click keeps focus in the nav.
    if (from === 'jump' || phone) setFocus({ to: 'heading', anchor });
  }

  const name = saved?.name ?? userName;
  const color = saved?.color ?? userAvatarColor(userName, account.avatarColor);
  const hasPassword = account.methods.some((m) => m.provider === 'credential');
  const [, title, , lede] = SECTIONS.find(([id]) => id === section)!;
  return (
    <Modal open={open} onClose={onClose} label="Cài đặt" className="settings">
      <h2 className="settings-title">Cài đặt</h2>
      <div className="settings-grid" data-view={view}>
        <nav ref={nav} className="settings-nav" aria-label="Tài khoản">
          <p className="settings-kicker">Tài khoản</p>
          <div className="settings-nav-list">
            {SECTIONS.map(([id, text, icon, desc]) => (
              <button
                key={id}
                type="button"
                data-section={id}
                aria-current={section === id ? 'true' : undefined}
                aria-labelledby={`settings-nav-${id}`}
                aria-describedby={`settings-nav-${id}-desc`}
                onClick={() => go(id, 'nav')}
              >
                <span className="settings-nav-icon">
                  <Icon name={icon} size={16} />
                </span>
                <span className="settings-nav-text">
                  <span id={`settings-nav-${id}`}>{text}</span>
                  <span className="settings-nav-desc" id={`settings-nav-${id}-desc`}>
                    {desc}
                  </span>
                </span>
                <span className="settings-nav-chevron">
                  <Icon name="right" size={16} />
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="settings-signout" onClick={() => void signOut()}>
            <Icon name="logout" size={16} />
            Đăng xuất
          </button>
        </nav>
        <div ref={panel} className="settings-panel">
          <div className="settings-head">
            <button
              type="button"
              className="settings-back"
              onClick={() => {
                setView('back');
                setFocus({ to: 'row' });
              }}
            >
              <Icon name="left" size={16} />
              Cài đặt
            </button>
            <h3 id="settings-heading" ref={heading} tabIndex={-1}>
              {title}
            </h3>
            <p className="settings-lede">{lede}</p>
          </div>
          {section === 'profile' && (
            <section aria-labelledby="settings-heading">
              <ProfileCard
                name={name}
                color={color}
                email={account.email}
                isAdmin={account.isAdmin}
                onSaved={(p) => {
                  setSaved(p);
                  router.refresh(); // the sidebar shows the new name too
                }}
              />
              <Protection account={account} twoFactor={twoFactor} onFix={(id, anchor) => go(id, 'jump', anchor)} />
              <Today usage={usage} onMore={() => go('limits', 'jump')} />
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
              <p className="settings-note">Nhóm và quyền do Admin quản lý.</p>
            </section>
          )}
          {section === 'limits' && (
            <section aria-labelledby="settings-heading" aria-live="polite">
              <Limits usage={usage} />
            </section>
          )}
          {section === 'security' && (
            <section aria-labelledby="settings-heading">
              <p className="settings-kicker" id="settings-signin">
                Đăng nhập
              </p>
              <ul className="acct-rows" aria-labelledby="settings-signin">
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
                <div className="acct-rows">
                  <div className="acct-row">
                    <span className="acct-mark" aria-hidden="true">
                      <Icon name="key" size={16} />
                    </span>
                    <span className="acct-text">
                      <strong>Mật khẩu đăng nhập</strong>
                      <span>Đổi mật khẩu sẽ đăng xuất các thiết bị khác.</span>
                    </span>
                    <button
                      type="button"
                      aria-expanded={pwOpen}
                      aria-controls="settings-password-form"
                      onClick={() => {
                        setPwOpen(!pwOpen);
                        setPwDone(false);
                      }}
                    >
                      Đổi mật khẩu
                      <Icon name={pwOpen ? 'up' : 'down'} size={14} />
                    </button>
                  </div>
                  {pwOpen && (
                    <div className="acct-row acct-form" id="settings-password-form" role="group" aria-labelledby="settings-password">
                      <PasswordChange
                        onDone={() => {
                          setPwOpen(false);
                          setPwDone(true);
                          setChanges((n) => n + 1);
                        }}
                      />
                    </div>
                  )}
                  {pwDone && (
                    <p className="acct-row pw-done" role="status">
                      {PASSWORD_DONE}
                    </p>
                  )}
                </div>
              ) : (
                <p className="settings-note">Tài khoản của bạn đăng nhập bằng Google, Lark hoặc passkey nên không có mật khẩu để đổi.</p>
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
          {section === 'preferences' && (
            <section aria-labelledby="settings-heading">
              <Preferences />
            </section>
          )}
          {section === 'methods' && <SignInMethods methods={account.methods} googleEnabled={account.googleEnabled} larkEnabled={account.larkEnabled} />}
          {section === 'support' && (
            <section aria-labelledby="settings-heading">
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
                  {account.supportEmail && (
                    // The page is read on click: the dialog opens over whichever page the member is on.
                    <a href={`mailto:${account.supportEmail}`} onClick={(e) => (e.currentTarget.href = supportMail(account.supportEmail!, account.email, location.href))}>
                      Gửi email
                    </a>
                  )}
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
