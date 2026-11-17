import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-13T12:00:00+07:00', kind: 'fixed', title: 'Phân tích video: Smart Remake chọn đúng cảnh, tab không tự nhảy', details: ['Ô chọn cảnh của Smart Remake giờ đánh số giống danh sách cảnh của bản phân tích, nên không còn chọn trùng một cảnh bị cắt thành nhiều đoạn (mỗi đoạn là một clip có tính phí).', 'Mở một phân tích bằng liên kết rồi chuyển tab trong lúc trang còn đang tải thì trang giữ nguyên tab bạn vừa chọn.'], href: '/analyze', prs: [421], audience: 'all' } satisfies ChangeEntry;
