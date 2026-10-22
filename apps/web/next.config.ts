import { type NextConfig } from 'next';

const config: NextConfig = {
  // The workspace packages ship TypeScript sources.
  transpilePackages: ['@cvs/core', '@cvs/db'],
  poweredByHeader: false,
};

export default config;
