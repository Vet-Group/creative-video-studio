import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-23T10:10:00+07:00',
  kind: 'new',
  title: 'Tạo video từ 2 ảnh và tải lookbook dạng PDF',
  details: [
    'Trong Lịch sử của các ứng dụng ảnh, chọn đúng 2 ảnh rồi bấm "Tạo video từ 2 ảnh": ảnh chọn trước là khung hình đầu, ảnh chọn sau là khung hình cuối. Form Tạo video mở sẵn hai ảnh đó, bạn xem giá rồi mới bấm tạo.',
    'Cạnh "Ghép lookbook" có thêm ô "Tiêu đề lookbook" và nút "Tải PDF": lookbook được xuất thành một trang A4 có tiêu đề và ngày hôm nay ở đầu trang.',
  ],
  href: '/apps/pose-generator',
  prs: [625],
  audience: 'all',
} satisfies ChangeEntry;
