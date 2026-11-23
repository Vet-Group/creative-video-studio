import type { ChangeEntry } from '../changelog';

export default {
  at: '2026-11-24T01:20:00+07:00',
  kind: 'new',
  title: 'Hai ứng dụng mới: Đổi màu sản phẩm và Bộ ảnh listing',
  details: [
    'Đổi màu sản phẩm: từ một ảnh áo, cốc hay túi, tạo một ảnh cho mỗi màu đã chọn (12 màu phôi phổ biến hoặc mã màu riêng), giữ nguyên hình in, chữ, nếp vải, ánh sáng và nền.',
    'Bộ ảnh listing: từ một ảnh sản phẩm, tạo bộ ảnh đăng bán cho Etsy, Amazon, Shopify, như ảnh chính nền trắng, lifestyle, cận cảnh, gói quà và các cảnh theo mùa, sản phẩm giữ y nguyên.',
    'Mỗi màu hay mỗi cảnh là một ảnh riêng, tối đa 15 ảnh mỗi lần chạy; tổng tiền hiện trước khi bấm Chạy.',
  ],
  href: '/apps',
  prs: [0],
  audience: 'all',
} satisfies ChangeEntry;
