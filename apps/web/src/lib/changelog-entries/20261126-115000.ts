import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-26T11:50:00+07:00',
  kind: 'improved',
  title: 'Nhãn "Mới" tự hết sau 14 ngày, tab Ví dụ của Phân tích gọn hơn',
  details: [
    'Nhãn "Mới" ở thanh bên tự tắt 14 ngày sau ngày công cụ ra mắt, như nhãn Mới ở trang Ứng dụng. Ứng dụng mới trong danh sách Ứng dụng ở thanh bên cũng mang nhãn này.',
    'Tab Ví dụ của Phân tích: mỗi video mẫu chỉ hiện video, câu mở đầu và các nút; bấm "Xem N cảnh" để mở danh sách cảnh. Các video mẫu dùng chung xếp thành lưới trên màn hình rộng.',
    'Nút Phân tích: biểu tượng nằm cùng dòng với chữ, không còn bị đẩy lên một dòng riêng.',
  ],
  href: '/analyze',
  prs: [653],
  audience: 'all',
} satisfies ChangeEntry;
