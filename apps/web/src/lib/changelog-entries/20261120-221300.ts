import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-20T22:13:00+07:00', kind: 'fixed', title: 'Ảnh tạo xong không còn bị mất khi lưu gặp lỗi thoáng qua', details: ['Với các mô hình ảnh chạy trên Google Vertex, như Nano Banana Pro, nếu việc lưu ảnh gặp lỗi trong chốc lát thì ảnh vẫn được lưu ở lượt sau. Trước đây ảnh đó bị mất và lượt tạo báo không thành công dù đã bị tính tiền.'], prs: [598], audience: 'all' } satisfies ChangeEntry;
