import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-18T14:50:00+07:00', kind: 'fixed', title: 'Xóa một lượt tạo không còn làm mất ảnh mẫu đã lưu', details: ['Ảnh đầu vào của một lượt tạo đã xóa giờ được giữ lại khi vẫn còn mẫu đã lưu, ảnh của lựa chọn công ty hay góp ý đang dùng nó, nên các mục đó không còn mất ảnh sau 30 ngày.'], prs: [534], audience: 'all' } satisfies ChangeEntry;
