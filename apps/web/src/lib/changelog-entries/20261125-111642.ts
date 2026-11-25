import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-25T11:16:42+07:00',
  kind: 'improved',
  title: 'Tab Giới thiệu dễ đọc hơn và thêm video hướng dẫn',
  details: [
    'Dưới tên mỗi tab Giới thiệu có ngày cập nhật gần nhất, bấm vào để xem Có gì mới. Video hướng dẫn có nút phát lớn ở giữa, bấm vào là xem có tiếng.',
    'Cuối tab Giới thiệu có nút Mở form để quay lại làm ngay, trang ứng dụng gợi ý thêm vài ứng dụng cùng nhóm. Thẻ Nên và Không nên có màu xanh và đỏ, bảng so sánh trên điện thoại hiện thành từng thẻ.',
    'Trang Hướng dẫn có thêm Marketing Studio và Điều khiển chuyển động. Nội dung mới: chọn tư thế trong Thử đồ, các mô hình Seedream trong Tạo ảnh, ảnh listing trong Tối ưu media.',
  ],
  href: '/tutorials',
  prs: [647],
  audience: 'all',
} satisfies ChangeEntry;
