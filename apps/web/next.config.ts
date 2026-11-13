import { type NextConfig } from 'next';

const config: NextConfig = {
  // The workspace packages ship TypeScript sources.
  transpilePackages: ['@cvs/core', '@cvs/db'],
  serverExternalPackages: ['pg-boss'],
  poweredByHeader: false,
  // CI typechecks in its own step first, so its builds skip the second pass (~12 s each); a deploy build still typechecks.
  typescript: { ignoreBuildErrors: process.env.CVS_SKIP_BUILD_TYPECHECK === '1' },
  devIndicators: { position: 'bottom-right' }, // the account chip has the bottom-left corner
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
