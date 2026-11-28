import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T18:48:00+07:00',
  kind: 'improved',
  title: 'Đổi màu sản phẩm: lấy màu ở bất cứ đâu trên màn hình',
  details: [
    'Cạnh ô "Màu riêng" có nút "Lấy màu": bấm rồi chấm vào màu cần lấy, ví dụ màu áo trong ảnh mẫu hay màu thương hiệu trên trang web, mã màu tự điền vào ô. Nhấn Esc để huỷ.',
    'Nút này có trên Chrome và Edge bản máy tính; trên trình duyệt khác bạn vẫn gõ mã #RRGGBB như cũ.',
  ],
  prs: [721],
  href: '/apps/product-recolor',
  audience: 'all',
} satisfies ChangeEntry;
