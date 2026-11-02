'use client';
// The account button (the sidebar's bottom chip, or the avatar in the phone top bar) and its menu: Settings, today's clip cap, security, help, sign out.
import { type CSSProperties, type KeyboardEvent, useId, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { isMac } from '@/lib/sidebar';
import { Icon, type IconName } from './Icon';
import { initials, levelOf, type Section, shareOf, signOut, type Usage } from './Settings';

const ITEMS: readonly (readonly [Section, string, IconName])[] = [
  ['profile', 'Cài đặt', 'sliders'],
  ['limits', 'Hạn mức hôm nay', 'gauge'],
  ['security', 'Bảo mật', 'lock'],
  ['support', 'Trợ giúp', 'help'],
];

export function AccountMenu({ name, email, color, variant, onSettings }: { name: string; email: string; color: string; variant: 'chip' | 'avatar'; onSettings: (start: Section) => void }) {
  const [open, setOpen] = useState(false);
  const [clips, setClips] = useState<Usage['clips'] | null | 'failed'>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  function show(at: 'first' | 'last') {
    setOpen(true);
    setClips(null);
    api<Usage>('/api/me/limits')
      .then((u) => setClips(u.clips))
      .catch(() => setClips('failed'));
    requestAnimationFrame(() => items().at(at === 'first' ? 0 : -1)?.focus());
  }
  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }
  function choose(start: Section) {
    close(true); // focus on the button first, so the dialog returns it there when it closes
    onSettings(start);
  }
  function onButtonKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      return close(false);
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    show(e.key === 'ArrowDown' ? 'first' : 'last');
  }
  function onMenuKey(e: KeyboardEvent) {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[e.key];
    if (to !== undefined) {
      e.preventDefault();
      all.at(to % all.length)?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // only the menu closes, not the drawer behind it
      close(true);
    } else if (e.key === 'Tab') close(false);
  }

  const label = `Tài khoản: ${name}`;
  const share = clips && clips !== 'failed' ? shareOf(clips.used, clips.cap) : 0;
  return (
    <div
      className="account"
      data-variant={variant}
      style={{ '--avatar': color } as CSSProperties}
      onBlur={(e) => open && !e.currentTarget.contains(e.relatedTarget) && close(false)} // a click or focus anywhere else
    >
      <button
        ref={button}
        type="button"
        className={variant === 'chip' ? 'account-chip' : 'account-button'}
        aria-label={label}
        title={variant === 'chip' ? name : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close(false) : show('first'))}
        onKeyDown={onButtonKey}
      >
        <span className="avatar" aria-hidden="true">
          {initials(name)}
        </span>
        {variant === 'chip' && (
          <>
            <span className="account-who">
              <span className="account-name">{name}</span>
              <span className="account-email">{email}</span>
            </span>
            <span className="account-chevron">
              <Icon name="up" size={14} />
            </span>
          </>
        )}
      </button>
      {open && (
        <div ref={menu} id={id} className="account-menu" role="menu" aria-label={label} onKeyDown={onMenuKey}>
          {ITEMS.map(([start, text, icon]) => (
            <button key={start} type="button" role="menuitem" tabIndex={-1} aria-keyshortcuts={start === 'profile' ? (isMac() ? 'Meta+Comma' : 'Control+Comma') : undefined} onClick={() => choose(start)}>
              <Icon name={icon} size={16} />
              {start === 'limits' ? (
                <span className="account-meter" data-level={clips && clips !== 'failed' ? levelOf(share) : undefined}>
                  <span>{text}</span>
                  <span className="account-meter-row">
                    <span className="today-bar" aria-hidden="true">
                      <span style={{ width: `${share * 100}%` }} />
                    </span>
                    <span className="account-meter-value">{clips === 'failed' ? 'Không tải được' : clips ? `${clips.used} / ${clips.cap} clip` : '...'}</span>
                  </span>
                </span>
              ) : (
                <span className="account-item-text">{text}</span>
              )}
              {start === 'profile' && <kbd className="account-hint">{isMac() ? '⌘,' : 'Ctrl+,'}</kbd>}
            </button>
          ))}
          <hr />
          <button type="button" role="menuitem" tabIndex={-1} onClick={() => void signOut()}>
            <Icon name="logout" size={16} />
            <span className="account-item-text">Đăng xuất</span>
          </button>
        </div>
      )}
    </div>
  );
}
