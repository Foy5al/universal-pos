export const CACHE_NAME = 'pos-shell-v1';

export const SHELL_ROUTES = [
  '/',
  '/login',
  '/pos',
  '/catalog',
  '/inventory',
  '/purchasing',
  '/reports',
  '/sync',
];

const STATIC_FILES = new Set(['/manifest.webmanifest', '/pos-icon.svg', '/pos-maskable.svg']);

export function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

export function isShellAsset(url) {
  return url.pathname.startsWith('/_next/static/') || STATIC_FILES.has(url.pathname);
}

export function isFontRequest(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

export function isRscRequest(url, rscHeader) {
  return rscHeader === '1' || url.searchParams.has('_rsc');
}

export function navigationCacheKey(url) {
  return url.pathname;
}

export function extractPrecacheUrls(html) {
  const base = 'https://pos.invalid';
  const assets = new Set();
  const pattern = /(?:src|href)="([^"]+)"/g;
  for (const match of html.matchAll(pattern)) {
    try {
      const url = new URL(match[1], base);
      if (url.origin === base && isShellAsset(url)) assets.add(url.pathname);
    } catch {
      // Ignore malformed markup rather than failing the whole install.
    }
  }
  return [...assets];
}
