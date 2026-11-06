'use client';
import Link from 'next/link';

// A page of the app that failed to load (a database or network error): in the app's language, with a retry, instead of Next's English default.
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="prose" role="alert">
      <h1>Trang chưa tải được</h1>
      <p>Có lỗi khi tải trang này, thường do kết nối chập chờn. Thử lại sau vài giây; nếu vẫn lỗi, báo Admin.</p>
      <p>
        <button type="button" className="button" onClick={reset}>
          Thử lại
        </button>{' '}
        <Link href="/explore">Về Khám phá</Link>
      </p>
    </main>
  );
}
