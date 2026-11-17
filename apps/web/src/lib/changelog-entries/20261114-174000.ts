import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-14T17:40:00+07:00', kind: 'fixed', title: 'Ngân sách còn lại tính cả Smart Remake', details: ['Số ngân sách tháng còn lại trong bộ chọn mô hình và cột tỉ lệ trên ngân sách của báo cáo tuần trước đây bỏ sót chi phí Smart Remake, nên hiện nhiều hơn mức hệ thống thật sự cho phép.', 'Hai nơi này giờ tính đúng những khoản mà hạn mức tháng tính; các lệnh LLM khác như Enhance vẫn không tính.'], prs: [475], audience: 'admin' } satisfies ChangeEntry;
