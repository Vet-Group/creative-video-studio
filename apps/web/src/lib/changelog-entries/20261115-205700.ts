import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-15T20:57:00+07:00', kind: 'improved', title: 'Khay lượt tạo cho biết còn bao nhiêu lượt xếp trước ở nhà cung cấp', details: ['Khi fal đang đông, lượt của bạn có thể phải chờ trong hàng đợi riêng của fal dù đã ghi Đang tạo. Khay lượt tạo và Lịch sử giờ ghi thêm “nhà cung cấp còn N lượt trước”, hoặc “nhà cung cấp sắp chạy”, để bạn biết lượt vẫn đang chờ chứ không bị treo, không cần huỷ rồi chạy lại.'], href: '/create', prs: [488], audience: 'all' } satisfies ChangeEntry;
