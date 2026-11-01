import { type NextConfig } from 'next';

const config: NextConfig = {
  // The workspace packages ship TypeScript sources.
  transpilePackages: ['@cvs/core', '@cvs/db'],
  serverExternalPackages: ['pg-boss'],
  poweredByHeader: false,
  // No page is ever framed (stops clickjacking of the login and the Create buttons), and responses keep their declared types.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default config;
