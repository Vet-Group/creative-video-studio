import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-27T00:37:00+07:00',
  kind: 'improved',
  title: 'Giá thống nhất, trang Tạo ảnh không còn nhảy và chấm trạng thái trên tab',
  details: [
    'Giá trên nút Tạo của Tạo video, Tạo ảnh, Thử đồ và Marketing Studio giờ viết cùng một kiểu, ví dụ $0.70 thay vì $0.7000. Trang Tạo ảnh cũng không còn bị giật khi vừa mở.',
    'Chữ ngắn ở giữa trang và phần Giới thiệu ngắt dòng gọn hơn, không còn một chữ lẻ loi ở cuối dòng.',
    'Nếu bạn ghim tab, biểu tượng tab có chấm vàng khi đang tạo và chấm xanh khi vừa xong, để bạn biết mà không cần mở tab.',
  ],
  prs: [675],
  audience: 'all',
} satisfies ChangeEntry;
