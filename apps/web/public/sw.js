import {
  CACHE_NAME,
  SHELL_ROUTES,
  extractPrecacheUrls,
  isApiRequest,
  isFontRequest,
  isRscRequest,
  isShellAsset,
  navigationCacheKey,
} from './sw-cache.mjs';

const CACHE_PREFIX = 'pos-shell-';
const OFFLINE_FALLBACK = '/pos';
const STATIC_FILES = ['/manifest.webmanifest', '/pos-icon.svg', '/pos-maskable.svg'];

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  const assets = new Set(STATIC_FILES);

  await Promise.allSettled(
    SHELL_ROUTES.map(async (route) => {
      const response = await fetch(route, { cache: 'reload', credentials: 'same-origin' });
      if (!response.ok) return;
      await cache.put(route, response.clone());
      for (const asset of extractPrecacheUrls(await response.text())) assets.add(asset);
    }),
  );

  await Promise.allSettled(
    [...assets].map(async (asset) => {
      const response = await fetch(asset, { cache: 'reload', credentials: 'same-origin' });
      if (response.ok) await cache.put(asset, response.clone());
    }),
  );
}

async function networkFirst(request, cacheKey, fallbackKey) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(cacheKey, response.clone());
    return response;
  } catch (cause) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    if (fallbackKey) {
      const fallback = await cache.match(fallbackKey);
      if (fallback) return fallback;
    }
    throw cause;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    if (isFontRequest(url)) event.respondWith(cacheFirst(request));
    return;
  }

  if (isApiRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, navigationCacheKey(url), OFFLINE_FALLBACK));
    return;
  }

  if (isRscRequest(url, request.headers.get('RSC'))) {
    event.respondWith(networkFirst(request, request));
    return;
  }

  if (isShellAsset(url)) event.respondWith(cacheFirst(request));
});
