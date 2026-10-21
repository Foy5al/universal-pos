import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  extractPrecacheUrls,
  isApiRequest,
  isFontRequest,
  isRscRequest,
  isShellAsset,
  navigationCacheKey,
} from '../public/sw-cache.mjs';

const url = (path) => new URL(path, 'https://pos.example');

test('extracts same-origin static assets and ignores markup noise', () => {
  const html = `
    <link rel="stylesheet" href="/_next/static/chunks/app.css" />
    <script src="/_next/static/chunks/app.js"></script>
    <script src="/_next/static/chunks/app.js"></script>
    <a href="/pos">POS</a>
    <script src="https://cdn.example/analytics.js"></script>
    <link rel="icon" href="/pos-icon.svg" />
    <link rel="manifest" href="/manifest.webmanifest" />
  `;

  assert.deepEqual(extractPrecacheUrls(html), [
    '/_next/static/chunks/app.css',
    '/_next/static/chunks/app.js',
    '/pos-icon.svg',
    '/manifest.webmanifest',
  ]);
});

test('recognizes shell assets, API and font requests', () => {
  assert.equal(isShellAsset(url('/_next/static/chunks/app.js')), true);
  assert.equal(isShellAsset(url('/manifest.webmanifest')), true);
  assert.equal(isShellAsset(url('/pos')), false);
  assert.equal(isApiRequest(url('/api/products')), true);
  assert.equal(isApiRequest(url('/v1/products')), false);
  assert.equal(isFontRequest(url('https://fonts.gstatic.com/s/nunito/abc.woff2')), true);
  assert.equal(isFontRequest(url('https://shop.example/font.woff2')), false);
});

test('detects RSC requests by header or query parameter', () => {
  assert.equal(isRscRequest(url('/pos'), '1'), true);
  assert.equal(isRscRequest(url('/pos?_rsc=abc'), null), true);
  assert.equal(isRscRequest(url('/pos'), null), false);
});

test('normalizes navigation cache keys to the pathname', () => {
  assert.equal(navigationCacheKey(url('/pos?register=1#cart')), '/pos');
});
