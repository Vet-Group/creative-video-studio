import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-14T11:35:00+07:00', kind: 'fixed', title: 'Thời lượng video trong Thư viện đúng với file thật', details: ['Trước đây Thư viện ghi thời lượng theo lúc yêu cầu, nên có clip Motion Control ghi 16 giây trong khi file thật dài 4,5 giây. Giờ thời lượng lấy theo chính file video, chính xác tới 0,1 giây.'], prs: [465], audience: 'all' } satisfies ChangeEntry;
