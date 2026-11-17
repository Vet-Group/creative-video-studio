import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-15T19:46:00+07:00', kind: 'improved', title: 'Giờ chạy tính đúng và huỷ một lần mọi lượt đang chờ', details: ['Đã chạy và thường xong sau giờ tính từ lúc lượt tạo thật sự bắt đầu chạy, không cộng thời gian đứng chờ, nên một lượt phải chờ lâu không còn trông như chạy chậm.', 'Khi bạn có từ hai lượt đang chờ, khay Lượt tạo của tôi có nút Huỷ cả các lượt đang chờ. Các lượt này chưa chạy nên không mất chi phí.'], prs: [484], audience: 'all' } satisfies ChangeEntry;
