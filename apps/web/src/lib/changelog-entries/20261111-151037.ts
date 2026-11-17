import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-11T15:10:37+07:00', kind: 'ops', title: 'fal chuyển sang tài khoản nhóm khi tài khoản cá nhân hết tín dụng', details: ['Lượt tạo mới tự chạy trên tài khoản nhóm, chỉ khi fal từ chối tài khoản cá nhân vì hết tín dụng.', 'Cảnh báo sắp hết số dư được gửi tới một danh sách email Lark do quản trị viên đặt.'], prs: [369, 371, 373], audience: 'admin' } satisfies ChangeEntry;
