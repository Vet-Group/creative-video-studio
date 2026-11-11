import type { IconName } from '@/components/Icon';
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
      { href: '/marketing-studio', text: 'Marketing Studio', icon: 'megaphone', badge: 'Mới' },
      { href: '/apps', text: 'Ứng dụng', icon: 'apps' },
    ],
  },
  {
    label: 'Của bạn',
    items: [
      { href: '/library', text: 'Thư viện', icon: 'library' },
      { href: '/feedback', text: 'Góp ý', icon: 'help' },
    ],
  },
];
const ADMIN: NavGroup = { label: 'Quản lý', items: [{ href: '/admin/overview', text: 'Quản trị', icon: 'admin' }] };

for (const item of GROUPS[1]!.items) item.hint = toolGuide(item.href)!.oneLine;

/** `feedbackNew`, shown to an Admin as a badge on the feedback item, is the count of items still at status `new` to triage. */
export const navGroups = (isAdmin: boolean, feedbackNew = 0): NavGroup[] => {
  const base = isAdmin ? [...GROUPS, ADMIN] : [...GROUPS];
  if (!isAdmin || feedbackNew <= 0) return base;
  return base.map((g) => ({ ...g, items: g.items.map((it) => (it.href === '/feedback' ? { ...it, badge: String(feedbackNew) } : it)) }));
};

/** Ctrl+, (Cmd+, on a Mac) opens Settings from anywhere, even while typing: Windows and Linux browsers leave it free. */
export const isSettingsShortcut = (e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, mac: boolean): boolean =>
  e.key === ',' && (mac ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey;

export const isMac = (): boolean => /Mac|iPhone|iPad/.test(navigator.userAgent);
