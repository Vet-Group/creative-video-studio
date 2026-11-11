import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/inter'; // Inter, self-hosted (SIL OFL 1.1), as the font family "Inter Variable"
import './globals.css';
import { THEME_SCRIPT } from '@/lib/theme';

// Added to a phone's home screen it opens full screen under the app's own name (manifest.ts and apple-icon.png carry the name and icon).
export const metadata: Metadata = { title: 'Creative Video Studio', appleWebApp: { capable: true, title: 'Video Studio' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
