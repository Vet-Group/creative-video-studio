import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-26T11:20:00+07:00',
  kind: 'fixed',
  title: 'Sửa vài lỗi hiển thị nhỏ trên điện thoại và màn hình rộng',
  details: [
    'Tạo ảnh trên điện thoại: danh sách Mức suy luận và Cửa hàng/Thương hiệu không còn tràn ra ngoài mép phải màn hình; ô Số ảnh và ô Cửa hàng nằm thẳng hàng.',
    'Nút "Dùng lại" trên thẻ ở tab Ví dụ dễ bấm hơn trên điện thoại.',
    'Khám phá: các thẻ trong mục "Bắt đầu từ đâu" cao bằng nhau. Thư viện: nút sao chép liên kết cao bằng các nút bên cạnh.',
  ],
  prs: [655],
  audience: 'all',
} satisfies ChangeEntry;
