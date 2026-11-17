import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-13T14:30:00+07:00', kind: 'fixed', title: 'Smart Remake: giá ước tính đúng với số tiền thật', details: ['Nhà cung cấp tính tiền cả đoạn video gửi đi lẫn đoạn video làm ra, nên mỗi giây cảnh tốn $0.20 chứ không phải $0.10 như trước đây hiển thị. Nút tạo, hộp xác nhận và ngân sách tháng giờ dùng đúng giá này; ví dụ một cảnh 2 giây là $0.40.'], href: '/analyze', prs: [425], audience: 'all' } satisfies ChangeEntry;
