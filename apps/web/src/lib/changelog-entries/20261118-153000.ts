import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-18T15:30:00+07:00', kind: 'fixed', title: 'Dùng kết quả rồi bấm Tạo không còn bị từ chối', details: ['Bấm "Dùng kết quả" ở một thẻ Lịch sử (Tạo ảnh, Thử đồ, và Tạo video từ ảnh) rồi bấm Tạo trước đây báo lỗi không gửi được. Giờ kết quả được chép thành ảnh riêng của bạn nên lượt tạo mới chạy bình thường.', 'Xoá lượt tạo cũ không làm mất ảnh đầu vào của lượt mới.'], prs: [538], audience: 'all' } satisfies ChangeEntry;
