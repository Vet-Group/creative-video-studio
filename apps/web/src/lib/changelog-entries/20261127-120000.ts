import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T12:00:00+07:00',
  kind: 'new',
  title: 'Ứng dụng mới: Sửa video',
  details: [
    'Chọn một video có sẵn (3–15 giây) rồi sửa bằng một câu: đổi màu áo, thay nền, hoặc tự mô tả thay đổi. Phần còn lại của clip và âm thanh được giữ nguyên.',
    'Giá tính theo độ dài video gốc và hiện trên nút Chạy trước khi bấm. Video ra dài bằng video gốc.',
  ],
  href: '/apps/video-edit',
  prs: [692],
  audience: 'all',
} satisfies ChangeEntry;
