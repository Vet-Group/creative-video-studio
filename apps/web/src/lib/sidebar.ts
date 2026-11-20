import type { IconName } from '@/components/Icon';
import { type AppConfig, appBySlug, visibleApps } from './apps';
import { toolGuide } from './tool-guide';

/** A cookie, so the server renders the rail already collapsed and the page does not jump on load. Shared by the layout and the Shell. */
export const COLLAPSED_COOKIE = 'cvs_sidebar_collapsed';

interface NavItem {
  href: string;
  text: string;
  icon: IconName;
  badge?: string;
  /** What the tool is for, beside the item on hover or focus and under it in the phone drawer. */
  hint?: string;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

// The sidebar in the order users know, under quiet group labels; Explore, the home page, has none.
const GROUPS: NavGroup[] = [
  { label: null, items: [{ href: '/explore', text: 'Khám phá', icon: 'home' }] },
  {
    label: 'Sáng tạo',
    items: [
      { href: '/try-on', text: 'Thử đồ', icon: 'tryon' },
      { href: '/image-generation', text: 'Tạo ảnh', icon: 'image' },
      { href: '/create', text: 'Tạo video', icon: 'create' },
      { href: '/marketing-studio', text: 'Marketing Studio', icon: 'megaphone' },
      { href: '/apps', text: 'Ứng dụng', icon: 'apps' },
    ],
  },
  {
    label: 'Thêm',
    items: [
      { href: '/library', text: 'Thư viện', icon: 'library' },
      { href: '/feedback', text: 'Góp ý', icon: 'help' },
      { href: '/changelog', text: 'Có gì mới', icon: 'preset' },
      { href: '/tutorials', text: 'Hướng dẫn', icon: 'film' },
    ],
  },
];
const ADMIN_ITEM: NavItem = { href: '/admin/overview', text: 'Quản trị', icon: 'admin' };
// A partner workspace's owner manages its members here (docs/WORKSPACES.md phase 3); the company's staff stay on Admin > Users.
const MEMBERS_ITEM: NavItem = { href: '/members', text: 'Thành viên', icon: 'users' };

for (const item of GROUPS[1]!.items) item.hint = toolGuide(item.href)!.oneLine;

// The reference-video analysis page (rea-video), shown in the creative group only when REA_ANALYZE_ENABLED is on, as the
// newest tool so it carries the "new" badge. Its line comes from the guide's ANALYZE_TOOL (kept out of the static
// TOOL_GUIDE above so the sidebar-mirror test stays exact for the flag-off default).
const ANALYZE_ITEM: NavItem = { href: '/analyze', text: 'Phân tích', icon: 'chart', badge: 'Mới', hint: toolGuide('/analyze')!.oneLine };

/**
 * `feedbackNew`, shown as a badge on the feedback item: for an Admin the count of items still at status `new` to triage, for a member the count of their items the Admin has changed since they last opened them.
 * `members`: the user owns the partner workspace they are in, so the management group lists its Members page.
 */
export const navGroups = (isAdmin: boolean, feedbackNew = 0, analyzeEnabled = false, members = false): NavGroup[] => {
  const groups = GROUPS.map((g) =>
    analyzeEnabled && g.label === 'Sáng tạo' ? { ...g, items: g.items.flatMap((it) => (it.href === '/create' ? [it, ANALYZE_ITEM] : [it])) } : g,
  );
  const manage = [...(members ? [MEMBERS_ITEM] : []), ...(isAdmin ? [ADMIN_ITEM] : [])];
  const base = manage.length ? [...groups, { label: 'Quản lý', items: manage }] : groups;
  if (feedbackNew <= 0) return base;
  return base.map((g) => ({ ...g, items: g.items.map((it) => (it.href === '/feedback' ? { ...it, badge: String(feedbackNew) } : it)) }));
};

/** The sidebar's open/closed choice for the Apps sub-list, kept in this browser only. */
export const APPS_OPEN_KEY = 'cvs.sidebar.apps.open';

/** The apps listed under the Apps item, in the order of the reference site (Jewelry, Lingerie, Model Generator, Media Optimizer, Background Changer). */
const APP_SHORTCUT_SLUGS = ['jewelry-try-on', 'lingerie-try-on', 'ai-fashion-model', 'media-optimizer', 'background-changer'];

/** The shortcuts the member is offered: the Apps index's own visibility rule applies, so an app it hides is not listed here either. */
export const appShortcuts = (smartRemake: boolean): AppConfig[] => {
  const offered = new Set(visibleApps(smartRemake));
  return APP_SHORTCUT_SLUGS.map((s) => appBySlug(s)).filter((a): a is AppConfig => a !== undefined && offered.has(a));
};

/** Ctrl+, (Cmd+, on a Mac) opens Settings from anywhere, even while typing: Windows and Linux browsers leave it free. */
export const isSettingsShortcut = (e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, mac: boolean): boolean =>
  e.key === ',' && (mac ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey;

/** Ctrl+K (Cmd+K on a Mac) opens the command palette from anywhere, even while typing; the Shell keeps the browser's own search off it. */
export const isPaletteShortcut = (e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, mac: boolean): boolean =>
  e.key.toLowerCase() === 'k' && (mac ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey;

export const isMac = (): boolean => /Mac|iPhone|iPad/.test(navigator.userAgent);
