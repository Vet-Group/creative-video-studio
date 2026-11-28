import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T19:40:00+07:00',
  kind: 'new',
  title: 'Kết nối AI: lệnh cvs cho script và tự động hoá',
  details: [
    'Script, n8n hay Hermes dùng được CVS bằng khoá truy cập qua lệnh cvs, không cần MCP: xem hạn mức, model, báo giá, tạo video (có bước xác nhận), theo dõi job, tải kết quả và tải ảnh lên.',
    'Khoá đọc từ biến môi trường CVS_AGENT_TOKEN, không bao giờ in ra. Hướng dẫn trong tài liệu Kết nối AI, mục CLI.',
  ],
  prs: [728],
  audience: 'admin',
} satisfies ChangeEntry;
