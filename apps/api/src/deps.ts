import type { OrganizationRef, UserRecord } from '@pos/db';
import {
  createDb,
  createDrizzleAuthorizationRepository,
  createDrizzleCatalogRepository,
  createDrizzleInventoryRepository,
  createDrizzleMembershipRepository,
  createDrizzleSessionRepository,
  createDrizzleStoreRepository,
  createDrizzleUserRepository,
  InMemoryAuthorizationRepository,
  InMemoryCatalogRepository,
  InMemoryInventoryRepository,
  InMemoryMembershipRepository,
  InMemorySessionRepository,
  InMemoryStoreRepository,
  InMemoryUserRepository,
  type CatalogSeed,
  type Database,
  type InventorySeed,
  type StoreRecord,
} from '@pos/db';
import type { Principal } from '@pos/contracts';

import type { AppDeps } from './app';
import { Argon2PasswordHasher } from './core/passwordHasher';
import { RepositorySessionResolver } from './core/sessionResolver';
import { OpaqueTokenService } from './core/tokenService';
import { createCatalogService } from './services/catalog';
import { createInventoryService } from './services/inventory';
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

  return {
    sessions: new RepositorySessionResolver({ sessions: sessionRepo, authorization, tokens }),
    stores: new InMemoryStoreRepository(seed.stores ?? []),
    catalog: createCatalogService(catalogRepository),
    inventory: createInventoryService(inventoryRepository, catalogRepository.products),
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

  return {
    sessions: new RepositorySessionResolver({ sessions: sessionRepo, authorization, tokens }),
    stores: createDrizzleStoreRepository(db),
    catalog: createCatalogService(catalogRepository),
    inventory: createInventoryService(
      createDrizzleInventoryRepository(db),
      catalogRepository.products,
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
