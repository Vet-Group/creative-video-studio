import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-25T13:00:00+07:00',
  kind: 'new',
  title: 'Nhóm: đánh dấu team không tính vào báo cáo',
  details: [
    'Trang Quản trị › Nhóm có thêm ô "Không tính vào báo cáo" cho từng team. Tài khoản của team được đánh dấu không tính vào số liệu người dùng thật ở Chi phí và Mức độ sử dụng, ví dụ team Kỹ thuật thường chạy thử app.',
    'Team được đánh dấu có nhãn "Không tính báo cáo" trong danh sách. Ô này lưu ngay khi bấm, được ghi vào Nhật ký và không đổi cách tính phí của team.',
  ],
  href: '/admin/teams',
  prs: [648],
  audience: 'admin',
} satisfies ChangeEntry;
