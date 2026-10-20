import type { OrganizationRef, UserRecord } from '@pos/db';
import {
  createDb,
  createDrizzleAuthorizationRepository,
  createDrizzleCatalogRepository,
  createDrizzleInventoryRepository,
  createDrizzleMembershipRepository,
  createDrizzlePurchasingRepository,
  createDrizzleRefundsRepository,
  createDrizzleRegisterRepository,
  createDrizzleRegisterShiftRepository,
  createDrizzleReportsRepository,
  createDrizzleSalesRepository,
  createDrizzleSessionRepository,
  createDrizzleStoreRepository,
  createDrizzleSyncRepository,
  createDrizzleUserRepository,
  InMemoryAuthorizationRepository,
  InMemoryCatalogRepository,
  InMemoryInventoryRepository,
  InMemoryMembershipRepository,
  InMemoryPurchasingRepository,
  InMemoryRefundsRepository,
  InMemoryRegisterRepository,
  InMemoryRegisterShiftRepository,
  InMemoryReportsRepository,
  InMemorySalesRepository,
  InMemorySessionRepository,
  InMemoryStoreRepository,
  InMemorySyncRepository,
  InMemoryUserRepository,
  type CatalogSeed,
  type Database,
  type InventorySeed,
  type PurchasingSeed,
  type RefundsSeed,
  type RegisterRecord,
  type RegisterShiftSeed,
  type SalesSeed,
  type StoreRecord,
} from '@pos/db';
import type { Principal } from '@pos/contracts';

import type { AppDeps } from './app';
import { Argon2PasswordHasher } from './core/passwordHasher';
import { RepositorySessionResolver } from './core/sessionResolver';
import { OpaqueTokenService } from './core/tokenService';
import { createCatalogService } from './services/catalog';
import { createInventoryService } from './services/inventory';
import { createPurchasingService } from './services/purchasing';
import { createRegisterService } from './services/registers';
import { createReportsService } from './services/reports';
import { createSalesService } from './services/sales';
import { createSyncService } from './services/sync';
import { DefaultAuthService } from './services/authService';

const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface MemorySeed {
  users?: readonly UserRecord[];
  principals?: readonly Principal[];
  stores?: readonly StoreRecord[];
  memberships?: ReadonlyArray<{ userId: string; organizationId: string }>;
  organizations?: readonly OrganizationRef[];
  catalog?: CatalogSeed;
  inventory?: InventorySeed;
  purchasing?: PurchasingSeed;
  registers?: readonly RegisterRecord[];
  registerShifts?: RegisterShiftSeed;
  sales?: SalesSeed;
  refunds?: RefundsSeed;
}

/** In-memory wiring for tests and local development without a database. */
export function createMemoryDeps(seed: MemorySeed = {}): AppDeps {
  const sessionRepo = new InMemorySessionRepository();
  const authorization = new InMemoryAuthorizationRepository(seed.principals ?? []);
  const tokens = new OpaqueTokenService();
  const auth = new DefaultAuthService({
    users: new InMemoryUserRepository(seed.users ?? []),
    memberships: new InMemoryMembershipRepository({
      memberships: seed.memberships,
      organizations: seed.organizations,
    }),
    authorization,
    sessions: sessionRepo,
    hasher: new Argon2PasswordHasher(),
    tokens,
    sessionTtlMs: DEFAULT_SESSION_TTL_MS,
  });

  const catalogRepository = new InMemoryCatalogRepository(seed.catalog);
  const inventoryRepository = new InMemoryInventoryRepository(seed.inventory);
  const purchasingRepository = new InMemoryPurchasingRepository(
    inventoryRepository.ledger,
    seed.purchasing,
  );
  const salesRepository = new InMemorySalesRepository(inventoryRepository.ledger, seed.sales);
  const refundsRepository = new InMemoryRefundsRepository(inventoryRepository.ledger, seed.refunds);
  const reportsRepository = new InMemoryReportsRepository(
    () => salesRepository.sales.snapshot(),
    () => refundsRepository.refunds.snapshot(),
  );
  const registerRepository = new InMemoryRegisterRepository(seed.registers ?? []);
  const registerShiftRepository = new InMemoryRegisterShiftRepository(
    {
      sumCashByShift: (organizationId, shiftId) =>
        salesRepository.sales.sumCashByShift(organizationId, shiftId),
      sumRefundsByShift: (organizationId, shiftId) =>
        refundsRepository.refunds.sumByShift(organizationId, shiftId),
    },
    seed.registerShifts,
  );
  const salesService = createSalesService(
    salesRepository,
    catalogRepository.products,
    inventoryRepository.locations,
    registerShiftRepository,
    refundsRepository.refunds,
  );
  const syncRepository = new InMemorySyncRepository();

  return {
    sessions: new RepositorySessionResolver({ sessions: sessionRepo, authorization, tokens }),
    stores: new InMemoryStoreRepository(seed.stores ?? []),
    catalog: createCatalogService(catalogRepository),
    inventory: createInventoryService(inventoryRepository, catalogRepository.products),
    purchasing: createPurchasingService(
      purchasingRepository,
      catalogRepository.products,
      inventoryRepository.locations,
    ),
    sales: salesService,
    sync: createSyncService(syncRepository, salesService, inventoryRepository.locations),
    registers: createRegisterService(registerRepository, registerShiftRepository),
    reports: createReportsService(
      reportsRepository,
      registerShiftRepository,
      inventoryRepository.locations,
      inventoryRepository.ledger,
    ),
    auth,
  };
}

/** Postgres-backed wiring used by the server and integration tests. */
export function createPostgresDeps(db: Database): AppDeps {
  const sessionRepo = createDrizzleSessionRepository(db);
  const authorization = createDrizzleAuthorizationRepository(db);
  const tokens = new OpaqueTokenService();
  const auth = new DefaultAuthService({
    users: createDrizzleUserRepository(db),
    memberships: createDrizzleMembershipRepository(db),
    authorization,
    sessions: sessionRepo,
    hasher: new Argon2PasswordHasher(),
    tokens,
    sessionTtlMs: DEFAULT_SESSION_TTL_MS,
  });

  const catalogRepository = createDrizzleCatalogRepository(db);
  const inventoryRepository = createDrizzleInventoryRepository(db);
  const salesRepository = createDrizzleSalesRepository(db);
  const refundsRepository = createDrizzleRefundsRepository(db);
  const reportsRepository = createDrizzleReportsRepository(db);
  const registerRepository = createDrizzleRegisterRepository(db);
  const registerShiftRepository = createDrizzleRegisterShiftRepository(db);
  const salesService = createSalesService(
    salesRepository,
    catalogRepository.products,
    inventoryRepository.locations,
    registerShiftRepository,
    refundsRepository.refunds,
  );
  const syncRepository = createDrizzleSyncRepository(db);

  return {
    sessions: new RepositorySessionResolver({ sessions: sessionRepo, authorization, tokens }),
    stores: createDrizzleStoreRepository(db),
    catalog: createCatalogService(catalogRepository),
    inventory: createInventoryService(inventoryRepository, catalogRepository.products),
    purchasing: createPurchasingService(
      createDrizzlePurchasingRepository(db),
      catalogRepository.products,
      inventoryRepository.locations,
    ),
    sales: salesService,
    sync: createSyncService(syncRepository, salesService, inventoryRepository.locations),
    registers: createRegisterService(registerRepository, registerShiftRepository),
    reports: createReportsService(
      reportsRepository,
      registerShiftRepository,
      inventoryRepository.locations,
      inventoryRepository.ledger,
    ),
    auth,
  };
}

/**
 * Default runtime wiring. Requires DATABASE_URL; refuses the in-memory fallback
 * in production because it would not be durable or revocable (ADR-0009).
 */
export function createDefaultDeps(): AppDeps {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is required in production');
    }
    return createMemoryDeps();
  }
  return createPostgresDeps(createDb(databaseUrl));
}
