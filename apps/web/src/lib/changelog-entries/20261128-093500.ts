import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T09:35:00+07:00',
  kind: 'improved',
  title: 'Số "lượt dùng tuần này" đếm sát hơn',
  details: [
    'Một lượt Marketing Studio hay Góc máy tạo nhiều clip giờ chỉ tính là một lượt dùng.',
    'Ứng dụng do công ty tự tạo và Smart Remake có số lượt dùng riêng trên thẻ ở trang Ứng dụng, không còn cộng vào Tạo video hay Tạo ảnh.',
    'Các lượt chạy thử của tài khoản hệ thống không còn được tính.',
  ],
  href: '/apps',
  prs: [709],
  audience: 'all',
} satisfies ChangeEntry;
