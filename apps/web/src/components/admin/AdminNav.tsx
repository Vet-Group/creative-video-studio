'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';
import { Icon, type IconName } from '@/components/Icon';

// The hidden words keep each link's full name for screen readers and tests while the tab reads short, so the bar fits one row.
const PAGES: [string, ReactNode, IconName][] = [
  ['overview', 'Tổng quan', 'pulse'],
  ['users', 'Người dùng', 'users'],
  ['workspaces', <>Không gian<span className="sr-only"> làm việc</span></>, 'apps'],
  ['teams', 'Nhóm', 'team'],
  ['stores', 'Cửa hàng', 'store'],
  ['settings', 'Cài đặt', 'gear'],
  ['report', <>Báo cáo<span className="sr-only"> tuần</span></>, 'chart'],
  ['usage', 'Mức độ sử dụng', 'gauge'],
  ['costs', 'Chi phí', 'coin'],
  ['audit', 'Nhật ký', 'log'],
];

export function AdminNav() {
  const pathname = usePathname();
  const bar = useRef<HTMLElement>(null);
  // On a phone the bar scrolls sideways: bring the page shown into view.
  useEffect(() => {
    bar.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname]);
  return (
    <nav ref={bar} className="admin-nav" aria-label="Các trang quản trị">
      {PAGES.map(([slug, text, icon]) => (
        <Link key={slug} href={`/admin/${slug}`} aria-current={pathname === `/admin/${slug}` || pathname.startsWith(`/admin/${slug}/`) ? 'page' : undefined}>
          <Icon name={icon} />
          <span>{text}</span>
        </Link>
      ))}
    </nav>
  );
}
