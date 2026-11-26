import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T03:45:00+07:00',
  kind: 'new',
  title: 'Gom kết quả vào bảng theo chiến dịch hoặc sản phẩm',
  details: [
    'Mở một kết quả trong Thư viện và bấm Bảng để gom nó vào một bảng có tên, ví dụ "Tết 2027 – áo thun".',
    'Chọn nhiều mục rồi bấm Thêm vào bảng để gom một lần, và mở bảng bằng bộ lọc Bảng.',
    'Bảng chỉ bạn thấy; đổi tên hay xoá bảng không xoá kết quả nào.',
  ],
  href: '/library',
  prs: [679],
  audience: 'all',
} satisfies ChangeEntry;
