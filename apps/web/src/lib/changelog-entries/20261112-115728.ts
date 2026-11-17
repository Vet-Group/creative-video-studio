import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-12T11:57:28+07:00', kind: 'fixed', title: 'Tạo ảnh ổn định hơn khi Google quá tải hoặc hết thanh toán', details: ['Khi một tài khoản Google hết thanh toán, hệ thống tự chuyển sang tài khoản khác.', 'Khi Google từ chối vì quá tải, lượt tạo ảnh được thử lại tối đa ba lần thay vì báo lỗi ngay.'], prs: [389, 391], audience: 'all' } satisfies ChangeEntry;
