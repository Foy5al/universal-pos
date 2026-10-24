import type { NextConfig } from 'next';

// Rewrites are baked in at build time, so hosted builds must set this to the
// deployed API origin (see docs/deployment/vercel.md).
const apiTarget =
  process.env.API_PROXY_TARGET ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pos/contracts', '@pos/domain'],
  output: 'standalone',
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiTarget}/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/sw-cache.mjs',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
