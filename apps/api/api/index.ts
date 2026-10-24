import express, { type Express } from 'express';

import { createApp } from '../src/app';
import { createDefaultDeps } from '../src/deps';

/**
 * Vercel routes the public `/api/*` prefix into this service while Express keeps
 * its versioned routes at `/v1/*`, so the same app serves Docker, local dev and
 * this project (ADR-0007). Strip the deployment prefix here, not in the app.
 */
const deployment: Express = express();
deployment.use((req, _res, next) => {
  if (req.url === '/api' || req.url.startsWith('/api/')) {
    req.url = req.url.slice('/api'.length) || '/';
  }
  next();
});
deployment.use(createApp(createDefaultDeps()));

export default deployment;
