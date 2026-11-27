import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T13:00:00+07:00',
  kind: 'improved',
  title: 'Xem ảnh toàn màn hình: phóng to, vuốt và tải xuống',
  details: [
    'Chạm đúp để phóng to ảnh, chụm hai ngón để phóng thêm, kéo để di chuyển; chạm đúp lần nữa để về cỡ cũ.',
    'Vuốt xuống để đóng ảnh. Ở Lịch sử, Thư viện và ảnh đính kèm Góp ý có nút Ảnh trước / Ảnh sau, phím mũi tên trái phải hoặc vuốt ngang để xem ảnh kế bên.',
    'Nút Tải xuống ngay cạnh nút đóng lưu ảnh gốc.',
  ],
  prs: [695],
  audience: 'all',
} satisfies ChangeEntry;
