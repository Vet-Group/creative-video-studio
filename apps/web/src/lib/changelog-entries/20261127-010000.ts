import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T01:00:00+07:00',
  kind: 'new',
  title: 'Chọn ảnh từ kệ sản phẩm ở mọi trang',
  details: [
    'Tạo video, Thử đồ, Tạo ảnh, Marketing Studio và các ứng dụng đều có nút Từ kệ sản phẩm cạnh Ảnh đã tải: chọn một ảnh đã lưu trên kệ, không cần tải lên lại.',
    'Ảnh người mẫu và ảnh nền không có nút này, vì ảnh sản phẩm không dùng ở đó.',
  ],
  href: '/library?kind=products',
  prs: [],
  audience: 'all',
} satisfies ChangeEntry;
