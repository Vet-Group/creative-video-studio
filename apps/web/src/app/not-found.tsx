import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Không tìm thấy trang - Creative Video Studio' };

// Shown for any unknown address, in the app's language rather than Next's English default.
export default function NotFound() {
  return (
    <main className="prose">
      <h1>Không tìm thấy trang</h1>
      <p>Địa chỉ này không có hoặc đã được đổi. Kiểm tra lại đường dẫn, hoặc quay về trang chính.</p>
      <p>
        <Link href="/">Về trang chính</Link>
      </p>
    </main>
  );
}
