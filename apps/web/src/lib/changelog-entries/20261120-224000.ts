import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-20T22:40:00+07:00', kind: 'improved', title: 'Nhật ký ghi lại việc tạo tài khoản; Khám phá không còn lấy clip của tài khoản hệ thống', details: ['Quản trị › Nhật ký có thêm dòng "Tạo tài khoản" mỗi khi Admin tạo người dùng: ai tạo, email, tên, vai trò, nhóm, có đặt mật khẩu hay không (không lưu mật khẩu).', 'Thẻ model ở Khám phá chỉ lấy clip của tài khoản hệ thống khi clip đó nằm trong Ví dụ, giống Thư viện.'], href: '/admin/audit', prs: [593], audience: 'admin' } satisfies ChangeEntry;
