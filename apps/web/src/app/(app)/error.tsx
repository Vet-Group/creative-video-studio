'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { isStaleBuild } from '@/lib/stale-build';

const RELOADED = 'cvs-stale-reload';

// A page of the app that failed to load (a database or network error): in the app's language, with a retry, instead of Next's English default.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // A page opened before a deploy asks for files the new build no longer has: one reload fixes it, so do it for the member, at most once a minute.
  useEffect(() => {
    if (!isStaleBuild(error)) return;
    try {
      if (Date.now() - Number(sessionStorage.getItem(RELOADED) ?? 0) < 60_000) return;
      sessionStorage.setItem(RELOADED, String(Date.now()));
    } catch {
      return;
    }
    location.reload();
  }, [error]);
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
