import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Universal POS',
    short_name: 'POS',
    description: 'Offline-first, multi-tenant retail POS and operations platform',
    start_url: '/pos',
    scope: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#020617',
    theme_color: '#020617',
    icons: [
      {
        src: '/pos-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/pos-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
