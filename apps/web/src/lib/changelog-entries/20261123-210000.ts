import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-23T21:00:00+07:00',
  kind: 'new',
  title: 'Tạo tư thế người mẫu theo ảnh mẫu: tải ảnh một người đang đứng đúng tư thế bạn muốn',
  details: [
    'Trong Tạo tư thế người mẫu, ô "Ảnh tư thế mẫu" (dưới ô "Tư thế tự tả") nhận tối đa 4 ảnh. Mỗi ảnh là một tư thế và tạo một ảnh riêng, tính chung trong 4 tư thế mỗi lần chạy với các tư thế đã chọn và ô tự tả.',
    'AI chỉ lấy tư thế, góc người và khung hình từ ảnh mẫu; khuôn mặt, tóc, dáng người, trang phục của người mẫu và nền (theo mục Nền) vẫn giữ như ảnh của bạn.',
  ],
  href: '/apps/pose-generator',
  prs: [628],
  audience: 'all',
} satisfies ChangeEntry;
