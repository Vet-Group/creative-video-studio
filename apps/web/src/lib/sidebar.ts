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
      { href: '/changelog', text: 'Có gì mới', icon: 'preset' },
    ],
  },
];
const ADMIN: NavGroup = { label: 'Quản lý', items: [{ href: '/admin/overview', text: 'Quản trị', icon: 'admin' }] };

for (const item of GROUPS[1]!.items) item.hint = toolGuide(item.href)!.oneLine;

// The reference-video analysis page (rea-video), shown in the creative group only when REA_ANALYZE_ENABLED is on. Its hint
// is inline rather than a tool-guide entry so the static group above (which asserts a tool-guide per item) stays untouched.
const ANALYZE_ITEM: NavItem = { href: '/analyze', text: 'Phân tích', icon: 'chart', hint: 'Phân tích video tham chiếu thành danh sách cảnh và prompt tiếng Anh để dựng lại.' };

/** `feedbackNew`, shown to an Admin as a badge on the feedback item, is the count of items still at status `new` to triage. */
export const navGroups = (isAdmin: boolean, feedbackNew = 0, analyzeEnabled = false): NavGroup[] => {
  const groups = GROUPS.map((g) =>
    analyzeEnabled && g.label === 'Sáng tạo' ? { ...g, items: g.items.flatMap((it) => (it.href === '/create' ? [it, ANALYZE_ITEM] : [it])) } : g,
  );
  const base = isAdmin ? [...groups, ADMIN] : groups;
  if (!isAdmin || feedbackNew <= 0) return base;
  return base.map((g) => ({ ...g, items: g.items.map((it) => (it.href === '/feedback' ? { ...it, badge: String(feedbackNew) } : it)) }));
};

/** Ctrl+, (Cmd+, on a Mac) opens Settings from anywhere, even while typing: Windows and Linux browsers leave it free. */
export const isSettingsShortcut = (e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, mac: boolean): boolean =>
  e.key === ',' && (mac ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey;

export const isMac = (): boolean => /Mac|iPhone|iPad/.test(navigator.userAgent);
