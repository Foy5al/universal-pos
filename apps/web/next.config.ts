import type { NextConfig } from 'next';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pos/contracts', '@pos/domain'],
  output: 'standalone',
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiTarget}/v1/:path*` }];
  },
};

export default nextConfig;
