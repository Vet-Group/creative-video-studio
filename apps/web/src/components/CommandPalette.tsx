'use client';
// Ctrl+K (⌘K on a Mac) or the sidebar's quick search row: one box to jump to a page, an app or a recent job. The Shell opens it.
import Link from 'next/link';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { visibleApps } from '@/lib/apps';
import { type PaletteItem, searchPalette } from '@/lib/command-palette';
import { featureLabel } from '@/lib/features';
import { cardTitleOfFormat } from '@/lib/marketing';
import { Icon, type IconName } from './Icon';
import { resultHref, useJobs } from './jobs';
import { Modal } from './Modal';
import { useSmartRemakeEnabled } from './SmartRemakeGate';

/** The pages and apps last opened from the palette, newest first, kept in this browser only: an empty query lists them first. */
const RECENT_KEY = 'cvs.palette.recent';
const RECENT_MAX = 5;
/** How many of the member's latest jobs it lists, from the list the jobs tray already polls. */
const JOBS_MAX = 5;

function readRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((h): h is string => typeof h === 'string') : [];
  } catch {
    return []; // storage blocked or the value spoiled: no recent group
  }
}

function remember(href: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([href, ...readRecent().filter((h) => h !== href)].slice(0, RECENT_MAX)));
  } catch {}
}

const fmtTime = (iso: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));

/** What a key pressed in the box does: ↑/↓ move the active option (round the ends), Enter opens it, Ctrl/⌘+Enter in a new tab; null leaves the key to the box. */
export function paletteKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey'>, active: number, count: number): { active: number } | { open: 'here' | 'tab' } | null {
  if (count === 0) return null;
  if (e.key === 'ArrowDown') return { active: (active + 1) % count };
  if (e.key === 'ArrowUp') return { active: (active - 1 + count) % count };
  if (e.key === 'Enter') return { open: e.ctrlKey || e.metaKey ? 'tab' : 'here' };
  return null;
}

/** `pages`: the sidebar's items for this user (lib/sidebar.ts navGroups), so an Admin page is offered only where the sidebar shows it. `mac`: name ⌘ rather than Ctrl. */
export function CommandPalette({ open, onClose, pages, mac }: { open: boolean; onClose: () => void; pages: { href: string; text: string; icon: IconName; hint?: string }[]; mac: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const smartRemake = useSmartRemakeEnabled();
  const { jobs } = useJobs();

  // showModal (in Modal's effect, which runs first) focuses the close button, so the box takes the focus afterwards. Closed, it starts empty again.
  useEffect(() => {
    if (!open) return (setQuery(''), setActive(0));
    setRecent(readRecent());
    input.current?.focus();
  }, [open]);

  const pageItems: PaletteItem[] = pages.map((p) => ({ href: p.href, name: p.text, description: p.hint, icon: p.icon }));
  const appItems: PaletteItem[] = visibleApps(smartRemake).map((a) => ({ href: `/apps/${a.slug}`, name: a.name, description: a.description, keywords: a.keywords, icon: 'apps' }));
  // A job is titled as the Library titles it, and opens as the tray opens it; its words are searched too.
  const jobItems: PaletteItem[] = jobs.slice(0, JOBS_MAX).map((j) => ({ href: resultHref(j), name: j.feature === 'marketing' ? cardTitleOfFormat(j.format) : featureLabel(j.feature), description: [fmtTime(j.createdAt), j.text].filter(Boolean).join(' · '), icon: 'clock' }));
  const recentItems = recent.map((href) => [...pageItems, ...appItems].find((it) => it.href === href)).filter((it) => it !== undefined);
  const groups = searchPalette([...(query.trim() ? [] : [{ label: 'Gần đây', items: recentItems }]), { label: 'Trang', items: pageItems }, { label: 'Ứng dụng', items: appItems }, { label: 'Lượt tạo gần đây', items: jobItems }], query);
  const flat = groups.flatMap((g) => g.items);
  const at = Math.min(active, flat.length - 1);
  const optionId = (i: number) => `${id}-option-${i}`;

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${at}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, at, query, id]);

  // A page or app opened goes on the recent list; a job is already on its own.
  const opened = (item: PaletteItem) => !jobItems.includes(item) && remember(item.href);
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return; // Enter that ends a word typed with an input method (Vietnamese on a Mac) opens nothing
    const r = paletteKey(e, at, flat.length);
    if (!r) return;
    e.preventDefault();
    if ('active' in r) return setActive(r.active);
    const item = flat[at]!;
    if (r.open === 'here') return document.getElementById(optionId(at))?.click(); // the option's own link navigates, as a click on it does
    opened(item);
    window.open(item.href, '_blank', 'noopener');
    onClose();
  }

  let n = 0;
  return (
    <Modal open={open} onClose={onClose} label="Tìm nhanh" className="palette">
      <div className="palette-field">
        <Icon name="search" size={16} />
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label="Tìm trang, ứng dụng hoặc lượt tạo"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={flat.length > 0 ? optionId(at) : undefined}
          placeholder="Tìm trang, ứng dụng, lượt tạo…"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          value={query}
          onChange={(e) => (setQuery(e.target.value), setActive(0))}
          onKeyDown={onKey}
        />
      </div>
      <div id={`${id}-list`} role="listbox" aria-label="Kết quả" className="palette-list">
        {groups.map((g, gi) => (
          <div key={g.label} role="group" aria-labelledby={`${id}-group-${gi}`}>
            <p id={`${id}-group-${gi}`} className="palette-group" aria-hidden="true">
              {g.label}
            </p>
            {g.items.map((item) => {
              const i = n++;
              return (
                // A click with Ctrl, ⌘ or Shift is the browser's: a new tab or window, the palette stays open.
                <Link key={i} id={optionId(i)} href={item.href} role="option" aria-selected={i === at} tabIndex={-1} onMouseMove={() => i !== at && setActive(i)} onClick={(e) => (opened(item), !(e.ctrlKey || e.metaKey || e.shiftKey) && onClose())}>
                  <Icon name={item.icon} size={16} />
                  <span className="palette-text">
                    <span>{item.name}</span>
                    {item.description && <span className="palette-desc">{item.description}</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      {flat.length === 0 && (
        <p className="palette-empty" role="status">
          Không tìm thấy “{query.trim()}”. Thử tên một trang hoặc ứng dụng, như “thư viện” hay “đổi nền”.
        </p>
      )}
      <p className="palette-keys" aria-hidden="true">
        <kbd>↑</kbd> <kbd>↓</kbd> chọn · <kbd>Enter</kbd> mở · <kbd>{mac ? '⌘' : 'Ctrl'}</kbd>+<kbd>Enter</kbd> mở ở tab mới · <kbd>Esc</kbd> đóng
      </p>
    </Modal>
  );
}
