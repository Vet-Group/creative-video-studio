import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T18:00:00+07:00',
  kind: 'new',
  title: 'Ứng dụng mới: Sửa lại hình in',
  details: [
    'Ảnh có hình in bị méo, sai chữ hay sai mẫu: thêm file design gốc, AI thay đúng phần hình in và giữ nguyên người mẫu, sản phẩm, nền và khung hình.',
    'Bấm "Sửa lại hình in" trên một ảnh hoặc video trong Lịch sử và Thư viện để mở sẵn ảnh đó (video lấy khung hình đầu), rồi "Tạo video" từ ảnh đã sửa để làm lại clip.',
  ],
  href: '/apps/print-fix',
  prs: [],
  audience: 'all',
} satisfies ChangeEntry;
