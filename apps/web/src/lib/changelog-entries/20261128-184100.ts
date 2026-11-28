import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T18:41:00+07:00',
  kind: 'improved',
  title: 'Báo rõ khi Google chặn kết quả vì nội dung nhạy cảm',
  details: ['Ảnh hay video bị Google chặn theo quy tắc an toàn giờ nói rõ lý do và gợi ý viết lại mô tả, đổi ảnh hoặc chọn mô hình khác, thay cho lỗi chung chung. Lượt đó không còn nút Thử lại với đúng mô tả cũ.'],
  prs: [714],
  audience: 'all',
} satisfies ChangeEntry;
