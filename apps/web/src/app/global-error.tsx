'use client';

// The last resort when the root layout itself fails: it replaces the whole document, so it brings its own html and body and no app styles.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, padding: 32, fontFamily: 'system-ui, sans-serif', background: '#111', color: '#eee' }}>
        <main role="alert">
          <h1 style={{ fontSize: 24 }}>Creative Video Studio chưa tải được</h1>
          <p>Có lỗi khi mở ứng dụng. Thử lại sau vài giây; nếu vẫn lỗi, báo Admin.</p>
          <button type="button" onClick={reset} style={{ padding: '8px 16px', borderRadius: 8, border: 0, cursor: 'pointer' }}>
            Thử lại
          </button>
        </main>
      </body>
    </html>
  );
}
