import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-15T05:00:00+07:00', kind: 'fixed', title: 'Job Veo lỗi không còn bị tính tiền', details: ['Khi Google báo lỗi một job Veo 3.1, job đó giờ được tính $0 và không trừ vào hạn mức của bạn, vì Google không thu tiền những job này.'], prs: [476], audience: 'all' } satisfies ChangeEntry;
