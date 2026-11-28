import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T14:30:00+07:00',
  kind: 'new',
  title: 'Sửa video: đổi sản phẩm trong video bằng một ảnh',
  details: [
    'Chọn kiểu sửa "Đổi sản phẩm" và thêm ảnh sản phẩm mới (tải lên, Ảnh đã tải hoặc Từ kệ sản phẩm). AI thay chiếc áo đang mặc, hay món đồ đang cầm, bằng sản phẩm trong ảnh, giữ màu, hình in và chữ.',
    'Người, chuyển động, nền và âm thanh của video gốc giữ nguyên, nên một video bán chạy dùng lại được cho nhiều thiết kế. Giá vẫn tính theo số giây của video.',
  ],
  prs: [715],
  href: '/apps/video-edit',
  audience: 'all',
} satisfies ChangeEntry;
