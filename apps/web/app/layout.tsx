import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { AppNav } from './components/AppNav';
import { ServiceWorkerRegistration } from './components/ServiceWorkerRegistration';
import './globals.css';
import './components/nav/nav.css';

const themeScript = `(function(){try{var stored=localStorage.getItem('pos.theme');var theme=stored==='light'||stored==='dark'?stored:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch(e){}})();`;

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppNav />
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
