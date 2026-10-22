import { type NextConfig } from 'next';

const config: NextConfig = {
  // The workspace packages ship TypeScript sources.
  transpilePackages: ['@cvs/core', '@cvs/db'],
  serverExternalPackages: ['pg-boss'],
  poweredByHeader: false,
};

export default config;
