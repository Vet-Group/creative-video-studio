import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-24T12:10:00+07:00',
  kind: 'new',
  title: 'Tải video theo tỉ lệ 9:16, 4:5 hoặc 1:1 miễn phí',
  details: [
    'Trong chi tiết một video ở Thư viện, mục "Tải theo tỉ lệ khác" tải về video trong khung 9:16 (TikTok, Reels), 4:5 (Instagram, Facebook) hoặc 1:1, với nền mờ từ chính video hoặc nền đen, không cắt mất phần nào.',
    'Âm thanh được chỉnh về độ to chuẩn của mạng xã hội và nhỏ dần ở cuối. Không tốn phí và không cần tạo lại video.',
  ],
  href: '/library',
  prs: [636],
  audience: 'all',
} satisfies ChangeEntry;
