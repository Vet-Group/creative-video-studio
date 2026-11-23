import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-24T00:30:00+07:00',
  kind: 'improved',
  title: 'Xoá trong Thư viện không còn hỏi lại, và có nút Hoàn tác',
  details: [
    'Bấm Xoá trên thẻ ảnh hoặc clip là xoá ngay, không còn hộp xác nhận.',
    'Trong 6 giây sau đó có nút "Hoàn tác" ở cuối màn hình để đưa mục đó về đúng chỗ cũ, kể cả khi nó đang nằm ở mục Ví dụ.',
  ],
  href: '/library',
  prs: [634],
  audience: 'all',
} satisfies ChangeEntry;
