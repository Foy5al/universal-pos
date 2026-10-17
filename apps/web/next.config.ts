import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pos/contracts', '@pos/domain'],
};

export default nextConfig;
