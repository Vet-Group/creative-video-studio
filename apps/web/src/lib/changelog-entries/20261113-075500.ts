import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-13T07:55:00+07:00', kind: 'improved', title: 'Phân tích video: ảnh từng cảnh, chép kịch bản và xoá phân tích', details: ['Mỗi cảnh có ảnh nhỏ lấy từ video gốc; bấm vào ảnh để tua video tới cảnh đó.', 'Nút Chép kịch bản chép cả bản phân tích (định dạng, mở đầu, từng cảnh và prompt) để dán sang nơi khác.', 'Ở Lịch sử có nút xoá cho phân tích đã xong hoặc không thành công; phân tích đã có lượt làm lại thì không xoá được.'], href: '/analyze', prs: [420], audience: 'all' } satisfies ChangeEntry;
