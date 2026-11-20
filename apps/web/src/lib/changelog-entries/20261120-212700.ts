import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-20T21:27:00+07:00', kind: 'fixed', title: 'Phân tích video bị dừng giữa chừng không còn kẹt ở "đang chạy"', details: ['Một lượt phân tích bị dừng giữa chừng, như khi máy chủ khởi động lại, giờ tự chuyển sang không thành công sau khoảng 35 phút thay vì hiện là đang chạy mãi. Khi đó bạn xoá được lượt này và phân tích lại video.', 'Một lượt phân tích bị treo quá 30 phút được dừng lại, nên các video xếp sau không phải chờ.'], href: '/analyze', prs: [594], audience: 'all' } satisfies ChangeEntry;
