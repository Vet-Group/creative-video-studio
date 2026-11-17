import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-13T04:30:00+07:00', kind: 'fixed', title: 'Phân tích video có bản tiếng Việt', details: ['Kết quả phân tích video trước đây chỉ hiện tiếng Anh vì bước dịch không chạy. Từ nay mỗi lượt phân tích mới có câu mở đầu, tóm tắt và mô tả từng cảnh bằng tiếng Việt; prompt tiếng Anh vẫn giữ để dùng khi tạo video.'], href: '/analyze', prs: [415], audience: 'all' } satisfies ChangeEntry;
