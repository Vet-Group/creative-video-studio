import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T09:20:00+07:00',
  kind: 'fixed',
  title: 'Xem ảnh toàn màn hình có nút đóng',
  details: [
    'Nút Toàn màn hình trên ảnh ở Lịch sử, Thư viện và Ví dụ giờ mở ảnh ngay trong trang, có nút × để đóng. Trên iPad trước đây ảnh phủ kín màn hình mà không có cách thoát, còn trên iPhone thì mở sang tab mới.',
  ],
  prs: [686],
  audience: 'all',
} satisfies ChangeEntry;
