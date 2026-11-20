import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-20T21:34:00+07:00', kind: 'fixed', title: 'Kết quả về muộn sau khi báo quá thời gian giờ vẫn được giao', details: ['Khi một lượt tạo báo quá thời gian nhưng nhà cung cấp vẫn làm xong trong vòng 2 giờ sau đó, clip hoặc ảnh giờ được lưu và lượt tạo chuyển sang thành công. Trước đây kết quả đó bị bỏ đi dù đã bị tính tiền, nên bấm Thử lại là trả tiền lần hai cho cùng một kết quả.'], prs: [601], audience: 'all' } satisfies ChangeEntry;
