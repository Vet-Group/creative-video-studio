import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-18T22:40:00+07:00', kind: 'improved', title: 'Thiết lập đã lưu báo ảnh không lấy lại được', details: ['Khi mở một thiết lập đã lưu có ảnh đầu vào đã bị xoá, biểu mẫu cho biết có bao nhiêu ảnh không lấy lại được và vì sao, như khi "Dùng lại" một lượt tạo. Trước đây biểu mẫu chỉ điền ít ảnh hơn mà không báo gì.', 'Nếu không còn ảnh nào và thiết lập cũng không có mô tả, một thông báo cho biết biểu mẫu được giữ nguyên.'], prs: [552], audience: 'all' } satisfies ChangeEntry;
