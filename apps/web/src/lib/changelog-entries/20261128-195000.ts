import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T19:50:00+07:00',
  kind: 'improved',
  title: 'Tạo ảnh: thanh nhập mô tả đứng yên khi trang tải, mở app nhanh hơn',
  details: [
    'Trang Tạo ảnh không còn nhảy chữ và dịch các hàng nút khi vừa mở, nhất là trên điện thoại: chỗ cho dòng tiền miễn phí của team, nút Gần đây và bố cục điện thoại được giữ sẵn ngay từ lúc đầu.',
    'Mở app từ địa chỉ gốc hoặc từ biểu tượng trên màn hình chính đi thẳng tới trang của team, không qua thêm một lượt chuyển trang.',
  ],
  prs: [730],
  audience: 'all',
} satisfies ChangeEntry;
