import type { NextConfig } from 'next';

// Only used where a proxy is needed: local dev, Docker and a two-project
// Vercel setup. On Vercel Services the platform routes /api/* to the API
// service before Next.js sees the request (see docs/deployment/vercel.md).
const apiTarget =
  process.env.API_PROXY_TARGET ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pos/contracts', '@pos/domain'],
  output: 'standalone',
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiTarget}/v1/:path*` }];
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
