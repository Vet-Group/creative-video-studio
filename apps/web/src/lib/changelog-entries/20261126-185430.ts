import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-26T18:54:30+07:00',
  kind: 'new',
  title: 'Kệ sản phẩm trong Thư viện: lưu sản phẩm một lần, dùng lại sau',
  details: [
    'Thư viện có thêm mục Sản phẩm: đặt tên, chọn cửa hàng và loại, rồi lưu 2–4 ảnh của một sản phẩm. Chỉ bạn thấy kệ của mình.',
    'Mỗi sản phẩm có nút Tạo thêm góc để mở ứng dụng nhiều góc từ ảnh đầu tiên. Bước sau sẽ cho chọn ảnh từ kệ ngay trong các trang tạo.',
  ],
  href: '/library?kind=products',
  prs: [676],
  audience: 'all',
} satisfies ChangeEntry;
