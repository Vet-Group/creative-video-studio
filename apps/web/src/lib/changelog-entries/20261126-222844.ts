import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-26T22:28:44+07:00',
  kind: 'improved',
  title: 'Tạo video: xem trước từng góc máy trước khi chọn',
  details: [
    'Các góc máy ở trang Tạo video giờ là những ô nhỏ có hình chiếc áo. Rê chuột, dùng phím Tab vào một ô hoặc chọn nó để xem máy quay đi thế nào: cận vào, lùi ra, xoay quanh, từ trên xuống, góc thấp hay ngang tầm mắt.',
    'Ô đã chọn hiện số thứ tự của clip (1, 2, …) theo đúng thứ tự trang tạo clip. Mô tả gửi đi và tiền của mỗi clip vẫn như trước.',
    'Nếu máy bạn bật giảm chuyển động, các ô đứng yên và chỉ hiện mũi tên chỉ hướng máy quay.',
  ],
  href: '/create',
  prs: [672],
  audience: 'all',
} satisfies ChangeEntry;
