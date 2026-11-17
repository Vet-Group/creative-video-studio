import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-07T13:20:07+07:00', kind: 'ops', title: 'Lượt fal bị từ chối không tính phí', details: ['Khi fal từ chối kết quả bằng lỗi 4xx, lượt đó được ghi chi phí bằng 0 và hoàn lại số ước tính, vì fal không tính tiền đầu vào bị từ chối.'], prs: [336], audience: 'admin' } satisfies ChangeEntry;
