import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-20T21:30:00+07:00', kind: 'ops', title: 'Chặn thao tác do trang web khác gửi và ghi Nhật ký khi Admin tạo tài khoản', details: ['Thao tác tạo, sửa hay xoá chỉ được nhận khi trình duyệt gửi từ chính trang của ứng dụng; yêu cầu do một trang web khác gửi kèm phiên đăng nhập của bạn bị từ chối.', 'Mỗi lần Admin tạo tài khoản ở Người dùng, Nhật ký có sự kiện "Tạo tài khoản" kèm vai trò, nhóm và việc có đặt mật khẩu hay không.'], prs: [596], audience: 'admin' } satisfies ChangeEntry;
