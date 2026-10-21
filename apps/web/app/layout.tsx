import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { ServiceWorkerRegistration } from './components/ServiceWorkerRegistration';
import './globals.css';

export const metadata: Metadata = {
  title: 'Universal POS',
  description: 'Offline-first, multi-tenant retail POS and operations platform',
  applicationName: 'Universal POS',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Universal POS',
  },
};

export const viewport: Viewport = {
  themeColor: '#020617',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
