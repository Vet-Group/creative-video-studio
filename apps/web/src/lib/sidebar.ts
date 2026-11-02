import type { IconName } from '@/components/Icon';

/** A cookie, so the server renders the rail already collapsed and the page does not jump on load. Shared by the layout and the Shell. */
export const COLLAPSED_COOKIE = 'cvs_sidebar_collapsed';

interface NavItem {
  href: string;
  text: string;
  icon: IconName;
  badge?: string;
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
  { label: 'Của bạn', items: [{ href: '/library', text: 'Thư viện', icon: 'library' }] },
];
const ADMIN: NavGroup = { label: 'Quản lý', items: [{ href: '/admin/overview', text: 'Quản trị', icon: 'admin' }] };

export const navGroups = (isAdmin: boolean): NavGroup[] => (isAdmin ? [...GROUPS, ADMIN] : GROUPS);

/** Ctrl+, (Cmd+, on a Mac) opens Settings from anywhere, even while typing: Windows and Linux browsers leave it free. */
export const isSettingsShortcut = (e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, mac: boolean): boolean =>
  e.key === ',' && (mac ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey;

export const isMac = (): boolean => /Mac|iPhone|iPad/.test(navigator.userAgent);
