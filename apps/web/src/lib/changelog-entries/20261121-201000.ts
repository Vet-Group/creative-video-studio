import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-21T20:10:00+07:00',
  kind: 'new',
  title: 'Ghép lookbook từ ảnh đã tạo, tab Ví dụ cho Tạo tư thế và nhãn "Mới" cho ứng dụng mới',
  details: [
    'Ở tab Lịch sử của các trang tạo ảnh, chọn 2 đến 4 ảnh (hoặc bấm "Chọn cả lô") rồi bấm "Ghép lookbook" để tải về một ảnh JPG ghép sẵn, mỗi hàng hai ảnh trên nền trắng.',
    'Tạo tư thế người mẫu có thêm tab Ví dụ. Khi đang ở một ô tư thế, bấm phím 1 đến 9 để chọn nhanh chín tư thế đầu.',
    'Trang Ứng dụng gắn nhãn "Mới" cho ứng dụng ra mắt trong 14 ngày gần nhất.',
  ],
  href: '/apps/pose-generator',
  prs: [0],
  audience: 'all',
} satisfies ChangeEntry;
