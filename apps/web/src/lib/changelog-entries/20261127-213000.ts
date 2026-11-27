import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T21:30:00+07:00',
  kind: 'new',
  title: 'Bắt đầu theo việc ở trang Khám phá',
  details: [
    'Trang Khám phá có các nút theo việc cần làm: video TikTok cho sản phẩm, bộ ảnh listing, mockup hàng loạt, làm giống video mẫu, ảnh người mẫu mặc sản phẩm, ảnh sản phẩm ở bối cảnh mới và video người thật giới thiệu.',
    'Mỗi nút mở đúng công cụ; nút video TikTok mở ứng dụng Hiệu ứng mở đầu: tải 1 ảnh sản phẩm, nhận video dọc 5 giây.',
    'Mục này thay cho danh sách "Bắt đầu từ đâu" trước đây; nút So sánh các công cụ vẫn ở đầu mục.',
  ],
  href: '/explore',
  prs: [702],
  audience: 'all',
} satisfies ChangeEntry;
