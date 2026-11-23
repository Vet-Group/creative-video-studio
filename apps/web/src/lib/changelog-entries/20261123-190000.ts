import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-23T19:00:00+07:00',
  kind: 'new',
  title: 'Chèn ảnh vào mô tả bằng một cú bấm',
  details: ['Khi đã chọn từ 2 ảnh trở lên, dưới ô mô tả có mỗi ảnh một nút "Ảnh 1", "Ảnh 2"… Bấm nút để chèn [Image1], [Image2]… vào chỗ con trỏ.', 'Nhờ đó bạn nói rõ được ảnh nào là sản phẩm, ảnh nào là người mẫu, cho cả Tạo video và Tạo ảnh.'],
  href: '/image-generation',
  prs: [0],
  audience: 'all',
} satisfies ChangeEntry;
