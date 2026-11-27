import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T12:00:00+07:00',
  kind: 'improved',
  title: 'Thẻ Lịch sử gọn hơn trên iPad',
  details: [
    'Trên iPad cầm dọc, thẻ Lịch sử đặt ảnh lên trên, thông tin và các nút ở dưới, nút xếp 2 cột, không còn khoảng trắng lớn bên cạnh ảnh.',
    'Ô tìm ở Góp ý hiện đủ chữ gợi ý. Ở Tạo ảnh, nút Dùng bộ nhận diện thẳng hàng với các ô chọn bên cạnh.',
  ],
  prs: [694],
  audience: 'all',
} satisfies ChangeEntry;
