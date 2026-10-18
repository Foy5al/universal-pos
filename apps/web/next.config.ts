import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pos/contracts', '@pos/domain'],
  output: 'standalone',
};

export default nextConfig;
