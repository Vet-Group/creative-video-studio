import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-21T00:30:00+07:00',
  kind: 'new',
  title: 'Dự báo chi phí cuối tháng cho team; chốt tháng gửi CSV cho kế toán qua Lark',
  details: [
    'Trong Cài đặt › Hạn mức, team bán hàng thấy thêm dòng "Dự báo cuối tháng (ước tính)": chi phí tháng này nếu cả team giữ nhịp dùng như từ đầu tháng, và phần sẽ tính cho team nếu vượt miễn phí. Đây chỉ là ước tính, không tính tiền và không chặn việc tạo.',
    'Admin thấy dự báo này trên từng team ở Chi phí › Theo team, cùng dự báo của cả sổ cái.',
    'Khi Admin chốt một tháng, bot Lark của app gửi cho những người nhận bản tóm tắt (tổng, team phải trả, đối tác phải trả, phần của công ty) và tệp CSV của tháng; nếu không gửi được, trang báo rõ để Admin tải CSV và gửi tay.',
  ],
  prs: [603],
  audience: 'all',
} satisfies ChangeEntry;
