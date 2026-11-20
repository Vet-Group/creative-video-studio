import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-21T09:00:00+07:00', kind: 'fixed', title: 'Lượt tạo bị nhà cung cấp từ chối không còn bị trừ vào số clip trong ngày', details: ['Khi nhà cung cấp từ chối một lượt tạo ngay lúc gửi (ví dụ vì dữ liệu đầu vào không hợp lệ), lượt đó giờ báo lỗi, không bị tính tiền và không bị trừ vào số clip mỗi ngày của bạn. Trước đây lượt đó báo không rõ kết quả, vẫn bị trừ một lượt clip và giữ tiền tạm tính.'], prs: [605], audience: 'all' } satisfies ChangeEntry;
