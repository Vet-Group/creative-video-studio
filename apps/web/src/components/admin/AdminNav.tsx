'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PAGES = [
  ['users', 'Người dùng'],
  ['teams', 'Nhóm'],
  ['stores', 'Cửa hàng'],
  ['settings', 'Cài đặt'],
  ['presets', 'Mẫu chuyển động'],
  ['report', 'Báo cáo tuần'],
  ['costs', 'Chi phí'],
  ['audit', 'Nhật ký'],
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Các trang quản trị">
      {PAGES.map(([slug, text]) => (
        <Link key={slug} href={`/admin/${slug}`} aria-current={pathname === `/admin/${slug}` ? 'page' : undefined}>
          {text}
        </Link>
      ))}
    </nav>
  );
}
