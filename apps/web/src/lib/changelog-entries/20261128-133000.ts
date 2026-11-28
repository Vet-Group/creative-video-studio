import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-28T13:30:00+07:00',
  kind: 'new',
  title: 'Tối ưu media kiểm ảnh theo chuẩn sàn và làm ảnh chính Amazon đạt chuẩn',
  details: [
    'Thêm một ảnh vào Tối ưu media, mục Kiểm chuẩn sàn cho biết ảnh đạt hay chưa theo quy định ảnh chính của Amazon, TikTok Shop, Temu, Shopee hoặc Shopify: nền trắng tinh, cạnh dài, tỉ lệ khung, phần khung sản phẩm chiếm, định dạng và dung lượng. Một bức tường xám nhạt nhìn như trắng vẫn bị Amazon trả về, nên mục này chỉ ra ngay.',
    'Nút Ảnh chính Amazon tô nền gần trắng thành trắng tinh, căn sản phẩm chiếm 85% khung và xuất ảnh JPG 2000 × 2000 px, kèm các dòng kiểm của kết quả. Làm được tới 50 ảnh một lần vào một tệp .zip; miễn phí, chạy ngay trên thiết bị.',
  ],
  prs: [713],
  href: '/apps/media-optimizer',
  audience: 'all',
} satisfies ChangeEntry;
