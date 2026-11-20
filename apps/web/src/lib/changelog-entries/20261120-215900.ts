import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-20T21:59:00+07:00', kind: 'fixed', title: 'Ảnh không còn bị mất khi máy chủ khởi động lại giữa lúc tạo', details: ['Khi máy chủ khởi động lại, như lúc cập nhật, đúng lúc một lượt tạo ảnh vừa được gửi đi, hệ thống giờ chờ nhà cung cấp trả ảnh xong rồi mới dừng, nên ảnh vẫn được giao. Trước đây lượt đó báo không rõ kết quả mà vẫn bị tính tiền.'], prs: [602], audience: 'all' } satisfies ChangeEntry;
