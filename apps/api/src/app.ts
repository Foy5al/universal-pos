import express, { type Express } from 'express';

import type { SessionResolver } from './core/sessionResolver';
import { authenticate } from './middleware/authenticate';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createAuthRouter, createLoginHandler } from './routes/auth';
import { createCatalogRouter } from './routes/catalog';
import { createHealthRouter } from './routes/health';
import { createInventoryRouter } from './routes/inventory';
import { createPurchasingRouter } from './routes/purchasing';
import { createRegistersRouter } from './routes/registers';
import { createReportsRouter } from './routes/reports';
import { createSalesRouter } from './routes/sales';
import { createStoresRouter } from './routes/stores';
import { createSyncRouter } from './routes/sync';
import type { AuthService } from './services/authService';
import type { CatalogService } from './services/catalog';
import type { InventoryService } from './services/inventory';
import type { PurchasingService } from './services/purchasing';
import type { RegisterService } from './services/registers';
import type { ReportsService } from './services/reports';
import type { SalesService } from './services/sales';
import type { SyncService } from './services/sync';
import type { StoreRepository } from '@pos/db';

export interface AppDeps {
  sessions: SessionResolver;
  stores: StoreRepository;
  catalog: CatalogService;
  inventory: InventoryService;
  purchasing: PurchasingService;
  registers: RegisterService;
  reports: ReportsService;
  sales: SalesService;
  sync: SyncService;
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
  v1.use(createPurchasingRouter(deps.purchasing));
  v1.use(createRegistersRouter(deps.registers));
  v1.use(createReportsRouter(deps.reports));
  v1.use(createSalesRouter(deps.sales));
  v1.use(createSyncRouter(deps.sync));
  app.use('/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
