import express, { type Express } from 'express';

import type { SessionResolver } from './core/sessionResolver';
import { authenticate } from './middleware/authenticate';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createAuthRouter, createLoginHandler } from './routes/auth';
import { createCatalogRouter } from './routes/catalog';
import { createHealthRouter } from './routes/health';
import { createInventoryRouter } from './routes/inventory';
import { createStoresRouter } from './routes/stores';
import type { AuthService } from './services/authService';
import type { CatalogService } from './services/catalog';
import type { InventoryService } from './services/inventory';
import type { StoreRepository } from '@pos/db';

export interface AppDeps {
  sessions: SessionResolver;
  stores: StoreRepository;
  catalog: CatalogService;
  inventory: InventoryService;
  auth: AuthService;
}

/**
 * Builds the Express application. Dependencies are injected so tests run against
 * in-memory implementations and production supplies Postgres ones. Never calls
 * listen(); that belongs to the runtime entrypoint (ADR-0007).
 */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.use(createHealthRouter());

  // Public: login must be reachable before a session exists.
  app.post('/v1/auth/login', createLoginHandler(deps.auth));

  const v1 = express.Router();
  v1.use(authenticate(deps.sessions));
  v1.use(createAuthRouter(deps.auth));
  v1.use(createStoresRouter(deps.stores));
  v1.use(createCatalogRouter(deps.catalog));
  v1.use(createInventoryRouter(deps.inventory));
  app.use('/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
