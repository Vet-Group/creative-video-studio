import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T17:15:00+07:00',
  kind: 'new',
  title: 'Kết nối AI qua MCP: Claude Code, OpenMausBot làm việc thẳng trong CVS',
  details: [
    'Thêm địa chỉ MCP cho khoá truy cập: dán lệnh trong Cài đặt > Kết nối AI vào Claude Code hoặc mục mcpServers của OpenMausBot là AI xem được hạn mức, danh sách mô hình, ước tính chi phí, tạo và theo dõi video, xem thư viện.',
    'Việc tốn tiền vẫn hỏi trước: AI báo giá ở lần gọi đầu, chỉ chạy thật khi gọi lại kèm mã xác nhận, và tính vào hạn mức tháng của khoá.',
  ],
  prs: [720],
  audience: 'admin',
} satisfies ChangeEntry;
