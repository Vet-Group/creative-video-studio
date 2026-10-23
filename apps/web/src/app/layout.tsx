import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/inter'; // Inter, self-hosted (SIL OFL 1.1), as the font family "Inter Variable"
import './globals.css';

export const metadata: Metadata = { title: 'Creative Video Studio' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
